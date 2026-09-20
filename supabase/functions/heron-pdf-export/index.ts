/**
 * heron-pdf-export — 苍鹭医生 PDF 导出代理
 * 接收标题与正文（Markdown 风格），用 pdf-lib 排版生成 PDF，返回 base64。
 * 请求体: { title, content }
 * 响应: { base64, pageCount }
 */
import { PDFDocument, PDFFont, rgb } from 'npm:pdf-lib';
import fontkit from 'npm:@pdf-lib/fontkit';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// CJK 字体字节缓存（跨请求复用原始字节，避免重复下载）
// 注意：每次请求必须对新 PDFDocument 重新 embedFont，不能缓存 PDFFont 实例
// 使用 npm CDN（不经过 Git LFS），WOFF2 由 fontkit 自动解压
const FONT_URLS = [
  'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2',
  'https://unpkg.com/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2',
];
let cachedFontBytes: Uint8Array | null = null;

async function loadCJKFont(doc: PDFDocument): Promise<PDFFont> {
  if (!cachedFontBytes) {
    let lastErr: Error = new Error('字体加载失败');
    for (const url of FONT_URLS) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) { lastErr = new Error(`字体请求失败: ${res.status}`); continue; }
        cachedFontBytes = new Uint8Array(await res.arrayBuffer());
        break;
      } catch (e) { lastErr = e as Error; }
    }
    if (!cachedFontBytes) throw lastErr;
  }
  // 每次为当前 doc 重新 embed，不能跨 doc 复用 PDFFont 实例
  // @fontsource WOFF2 已是 subset 字体，不能再二次 subset（否则 TTFSubset 越界报错）
  return doc.embedFont(cachedFontBytes, { subset: false });
}

interface Line {
  text: string;
  size: number;
  bold: boolean;
  spaceAfter: number;
}

function parseContent(title: string, content: string): Line[] {
  const lines: Line[] = [];
  if (title) lines.push({ text: title, size: 22, bold: true, spaceAfter: 16 });
  const raw = content.split('\n');
  for (const rawLine of raw) {
    const t = rawLine.trim();
    if (!t) { lines.push({ text: '', size: 12, bold: false, spaceAfter: 6 }); continue; }
    if (/^#{1,3}\s+/.test(t)) {
      const level = (t.match(/^#+/) || ['#'])[0].length;
      lines.push({ text: t.replace(/^#+\s+/, ''), size: level === 1 ? 18 : 16, bold: true, spaceAfter: 10 });
    } else if (/^[-*]\s+/.test(t)) {
      lines.push({ text: '• ' + t.replace(/^[-*]\s+/, ''), size: 12, bold: false, spaceAfter: 4 });
    } else if (/^\d+[.、)]\s+/.test(t)) {
      lines.push({ text: t, size: 12, bold: false, spaceAfter: 4 });
    } else {
      lines.push({ text: t, size: 12, bold: false, spaceAfter: 6 });
    }
  }
  return lines;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const out: string[] = [];
  let current = '';
  for (const ch of text) {
    const test = current + ch;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      out.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) out.push(current);
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let title = '';
  let content = '';
  try {
    const body = await req.json();
    title = String(body.title || '').trim();
    content = String(body.content || '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!content) {
    return new Response(JSON.stringify({ error: '内容为空，无法导出 PDF' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  try {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await loadCJKFont(doc);

    const PAGE_W = 595.28; // A4 width in pt
    const PAGE_H = 841.89; // A4 height in pt
    const MARGIN = 56;
    const maxWidth = PAGE_W - MARGIN * 2;
    const ink = rgb(0.12, 0.14, 0.13);
    const muted = rgb(0.4, 0.42, 0.4);

    const lines = parseContent(title, content);
    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    let pageCount = 1;

    const ensureSpace = (needed: number) => {
      if (y - needed < MARGIN) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        pageCount++;
        y = PAGE_H - MARGIN;
      }
    };

    for (const line of lines) {
      const useFont = font;
      const wrapped = wrapText(line.text, useFont, line.size, maxWidth);
      const lineHeight = line.size * 1.5;
      for (const seg of wrapped) {
        ensureSpace(lineHeight);
        page.drawText(seg, { x: MARGIN, y: y - line.size, size: line.size, font: useFont, color: line.bold ? ink : muted });
        y -= lineHeight;
      }
      y -= line.spaceAfter;
    }

    const pdfBytes = await doc.save();
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(pdfBytes.subarray(i, i + chunk)) as unknown as number[]);
    }
    const base64 = btoa(bin);

    return new Response(JSON.stringify({ base64, pageCount }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: `排版失败：${(err as Error).message}` }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});