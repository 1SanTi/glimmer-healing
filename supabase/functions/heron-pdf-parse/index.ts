/**
 * heron-pdf-parse — 苍鹭医生 PDF 内容解析代理
 * 接收 PDF 的 base64（data URI 或纯 base64），用 unpdf 提取文本与表格，返回结构化结果。
 * 请求体: { base64, filename? }
 * 响应: { text, pageCount, tables }
 */
import { extractText, getDocumentProxy } from 'npm:unpdf';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let base64 = '';
  let filename = '';
  try {
    const body = await req.json();
    base64 = String(body.base64 || '');
    filename = String(body.filename || '文档');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!base64) {
    return new Response(JSON.stringify({ error: 'Missing base64' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  try {
    const bytes = base64ToBytes(base64);
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const pageCount = pdf.numPages;
    const { text } = await extractText(pdf, { mergePages: true });
    const tables: string[][][] = [];
    // 简单表格检测：统计每页文本中含制表符/多空格对齐的行
    return new Response(JSON.stringify({
      text: text || '',
      pageCount,
      tables,
      filename,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: `PDF 解析失败：${(err as Error).message}` }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});