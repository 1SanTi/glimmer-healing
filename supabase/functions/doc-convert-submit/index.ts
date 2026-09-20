/**
 * doc-convert-submit — 文档格式转换（提交）
 * 将图片 base64 或 PDF base64 提交给百度 OCR doc_convert，返回 task_id。
 * 请求体: { base64, fileType }  fileType: 'image' | 'pdf'
 * 响应: { taskId }
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUBMIT_URL = 'https://app-cbrme32s08ox-api-rY7JZ6jqrneL-gateway.appmiaoda.com/rest/2.0/ocr/v1/doc_convert/request';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let base64 = '';
  let fileType = 'image';
  try {
    const body = await req.json();
    base64 = String(body.base64 || '');
    fileType = String(body.fileType || 'image');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!base64) {
    return new Response(JSON.stringify({ error: 'Missing base64' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  const params = new URLSearchParams();
  params.append('pdf_file', cleanBase64); // PDF 走 pdf_file
  params.append('image', cleanBase64);     // 图片走 image
  params.append('filetype', fileType === 'pdf' ? 'pdf' : 'image');

  const upstream = await fetch(SUBMIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Gateway-Authorization': `Bearer ${apiKey}`,
    },
    body: params.toString(),
  });

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, { status: upstream.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const data = await upstream.json();
  if (data.error_code) {
    return new Response(JSON.stringify({ error: data.error_msg || '提交失败' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  const taskId = String(data.task_id || data.tasks?.[0]?.task_id || '');
  if (!taskId) {
    return new Response(JSON.stringify({ error: '提交失败，未获取到任务ID' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ taskId }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});