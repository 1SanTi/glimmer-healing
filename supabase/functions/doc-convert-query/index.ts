/**
 * doc-convert-query — 文档格式转换（查询）
 * 用 task_id 查询转换进度，ret_code=3 时返回 Word/Excel 下载链接。
 * 请求体: { taskId }
 * 响应: { status: 'processing'|'succeed', word?, excel? }
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const QUERY_URL = 'https://app-cbrme32s08ox-api-oYA6ZGjReooa-gateway.appmiaoda.com/rest/2.0/ocr/v1/doc_convert/get_request_result';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let taskId = '';
  try {
    const body = await req.json();
    taskId = String(body.taskId || '');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Missing taskId' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const params = new URLSearchParams();
  params.append('task_id', taskId);

  const upstream = await fetch(QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Gateway-Authorization': `Bearer ${apiKey}`,
    },
    body: params.toString(),
  });

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const data = await upstream.json();
  const retCode = Number(data.ret_code ?? data.tasks?.[0]?.ret_code ?? 0);
  if (retCode === 3) {
    const rd = data.result_data || data.tasks?.[0]?.result_data || {};
    return new Response(JSON.stringify({
      status: 'succeed',
      word: String(rd.word || ''),
      excel: String(rd.excel || ''),
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ status: 'processing', taskId }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});