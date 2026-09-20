// 图像内容理解 — 提交请求 Edge Function
// 接收图片base64，调用百度图像理解API，返回 task_id（前端轮询用）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let question: string;
  let imageBase64: string | undefined;
  let imageUrl: string | undefined;

  try {
    const body = await req.json();
    question = body.question;
    if (!question) throw new Error('Missing question');
    if (!body.image && !body.url) throw new Error('Missing image or url');
    imageBase64 = body.image;
    imageUrl = body.url;
  } catch {
    return new Response(JSON.stringify({ error: '请求参数无效' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '服务配置错误' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const requestBody: Record<string, string> = { question };
  if (imageBase64) {
    requestBody.image = imageBase64;
  } else if (imageUrl) {
    requestBody.url = imageUrl;
  }

  const upstream = await fetch(
    'https://app-cbrme32s08ox-api-DYJwo27V85oa-gateway.appmiaoda.com/rest/2.0/image-classify/v1/image-understanding/request',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error('image-understanding-request error:', upstream.status, errText);
    return new Response(JSON.stringify({ error: `上游服务错误: ${upstream.status}` }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
