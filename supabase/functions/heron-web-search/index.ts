/**
 * heron-web-search — 苍鹭医生联网搜索代理
 * 调用百度 AI 搜索（SSE 流式），服务端聚合为 { summary, sources } 返回。
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UPSTREAM = 'https://app-cbrme32s08ox-api-DYJwo27V8Qya-gateway.appmiaoda.com/v2/ai_search/chat/completions';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let query = '';
  try {
    const body = await req.json();
    query = String(body.query || '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }],
      instruction: '你是苍鹭医生的搜索助手，请用温暖、简洁的中文总结搜索结果，并附上来源。',
      enable_reasoning: false,
      max_completion_tokens: 1024,
    }),
  });

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, { status: upstream.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  // 聚合 SSE
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let summary = '';
  const sources: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  const handleData = (payload: string) => {
    payload = payload.trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const obj = JSON.parse(payload);
      const delta = obj?.choices?.[0]?.delta;
      if (delta?.content) summary += delta.content;
      if (Array.isArray(obj.references)) {
        for (const r of obj.references) {
          const url = String(r.url || '');
          if (url && !seen.has(url)) {
            seen.add(url);
            sources.push({ title: String(r.title || url), url });
          }
        }
      }
    } catch { /* ignore malformed chunk */ }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) handleData(trimmed.slice(5));
    }
  }
  if (buffer.trim().startsWith('data:')) handleData(buffer.trim().slice(5));

  return new Response(JSON.stringify({ summary: summary.trim(), sources }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});