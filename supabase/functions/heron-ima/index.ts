/**
 * heron-ima — 苍鹭医生 ima 知识库代理
 * 单一 Edge Function，通过 action 字段路由到不同 ima OpenAPI。
 * action: 'list_kb' | 'search_kb' | 'list_content' | 'search_knowledge' | 'get_media_info' | 'import_url'
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE = 'https://ima.qq.com';

function imaHeaders(): Record<string, string> {
  const clientId = Deno.env.get('IMA_CLIENT_ID');
  const apiKey = Deno.env.get('IMA_API_KEY');
  if (!clientId || !apiKey) throw new Error('ima 知识库未配置，请联系管理员填写 Client ID 与 API Key');
  return {
    'Content-Type': 'application/json',
    'ima-openapi-clientid': clientId,
    'ima-openapi-apikey': apiKey,
  };
}

async function imaPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: imaHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.msg || 'ima 接口错误');
  return data.data;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let action = '';
  let kbName = '';
  let query = '';
  let cursor = '';
  let kbId = '';
  let mediaId = '';
  let urls: string[] = [];
  try {
    const body = await req.json();
    action = String(body.action || '');
    kbName = String(body.kbName || '');
    query = String(body.query || '');
    cursor = String(body.cursor || '');
    kbId = String(body.kbId || '');
    mediaId = String(body.mediaId || '');
    urls = Array.isArray(body.urls) ? body.urls.map(String) : [];
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  try {
    if (action === 'list_kb') {
      const data = await imaPost('/openapi/wiki/v1/search_knowledge_base', { query: '', cursor: '', limit: 20 });
      const list = (data?.info_list || []).map((k: Record<string, unknown>) => ({ kbId: String(k.kb_id), name: String(k.kb_name), description: String(k.description || '') }));
      return new Response(JSON.stringify({ list }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'search_kb') {
      const data = await imaPost('/openapi/wiki/v1/search_knowledge_base', { query: kbName, cursor: '', limit: 5 });
      const list = (data?.info_list || []).map((k: Record<string, unknown>) => ({ kbId: String(k.kb_id), name: String(k.kb_name) }));
      return new Response(JSON.stringify({ list }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // 以下操作需要 kbId；若只给了名称，先解析
    if (!kbId && kbName) {
      const data = await imaPost('/openapi/wiki/v1/search_knowledge_base', { query: kbName, cursor: '', limit: 5 });
      const first = data?.info_list?.[0];
      if (!first) throw new Error(`未找到知识库「${kbName}」`);
      kbId = String(first.kb_id);
    }
    if (!kbId) throw new Error('请指定知识库名称');

    if (action === 'list_content') {
      const data = await imaPost('/openapi/wiki/v1/get_knowledge_list', { cursor, limit: 20, knowledge_base_id: kbId });
      const list = (data?.knowledge_list || []).map((k: Record<string, unknown>) => ({ mediaId: String(k.media_id), title: String(k.title), mediaType: Number(k.media_type) }));
      return new Response(JSON.stringify({ list, isEnd: !!data?.is_end, nextCursor: String(data?.next_cursor || '') }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'search_knowledge') {
      if (!query) throw new Error('搜索内容不能为空');
      const data = await imaPost('/openapi/wiki/v1/search_knowledge', { query, cursor, knowledge_base_id: kbId });
      const list = (data?.info_list || []).map((k: Record<string, unknown>) => ({ mediaId: String(k.media_id), title: String(k.title), summary: String(k.summary || k.content || '') }));
      return new Response(JSON.stringify({ list, isEnd: !!data?.is_end, nextCursor: String(data?.next_cursor || '') }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_media_info') {
      if (!mediaId) throw new Error('缺少 media_id');
      const data = await imaPost('/openapi/wiki/v1/get_media_info', { media_id: mediaId });
      const urlInfo = data?.url_info || {};
      return new Response(JSON.stringify({ url: String(urlInfo.url || ''), title: String(data?.title || ''), mediaType: Number(data?.media_type || 0) }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'import_url') {
      if (!urls.length) throw new Error('请提供要导入的网页 URL');
      const data = await imaPost('/openapi/wiki/v1/import_urls', { knowledge_base_id: kbId, folder_id: kbId, urls });
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});