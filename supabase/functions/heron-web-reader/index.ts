/**
 * heron-web-reader — 苍鹭医生网页解析代理
 * 直接抓取目标网页 HTML，提取标题与正文，转换成 Markdown 风格文本。
 * 请求体: { url, withLinksSummary? }
 * 响应: { content, title?, description? }
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 将原始 HTML 转成可读 Markdown 风格文本 */
function htmlToMarkdown(html: string): { title: string; content: string } {
  // 提取 title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1] : '';
  const title = decodeHtmlEntities(rawTitle.replace(/\s+/g, ' ').trim());

  // 去掉 head / script / style / nav / header / footer / aside / svg
  let body = html
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // 标题转 Markdown
  body = body
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, '\n#### $1\n');

  // 段落 / 列表 / 换行
  body = body
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1')
    .replace(/<br\s*\/?>/gi, '\n');

  // 去掉剩余标签
  body = body.replace(/<[^>]+>/g, '');

  // 解码实体 & 整理空白
  body = decodeHtmlEntities(body)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return { title, content: body };
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let targetUrl = '';
  try {
    const body = await req.json();
    targetUrl = String(body.url || '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HeronBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `网页请求失败: ${res.status}` }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const html = await res.text();
    const { title, content } = htmlToMarkdown(html);
    const truncated = content.slice(0, 12000); // 限制长度

    return new Response(
      JSON.stringify({ content: `Title: ${title}\nURL Source: ${targetUrl}\nMarkdown Content:\n${truncated}`, title }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: `网页解析失败：${(err as Error).message}` }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});