// 心灵速写 AI 色彩情绪解读 Edge Function
// 接收图像描述，调用 MiniMax M3，从色彩心理学角度解读情绪

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SKETCH_SYSTEM_PROMPT = `你是一位温柔的色彩心理学分析师，擅长从绘画的颜色选择、线条走势和构图方式中，读取作画者的情绪状态和内心世界。

用户会提供一段对其即兴色彩画作的图像描述，请按以下结构给出温暖、诗意的情绪解读：

1. 🎨 主色调解读（画作中出现的主要颜色及其情绪含义）
2. 〰️ 线条与节奏（线条的走势、力度透露的情绪能量）
3. 🌌 构图感受（空间使用、重心位置反映的心理状态）
4. 💫 整体情绪印象（此刻作画者可能处于的情绪状态）
5. 🌱 温暖寄语（一句针对此次色彩体验的鼓励）

注意：
- 语气温暖、充满诗意，避免生硬的心理学术语
- 多使用"或许"、"可能"、"感受到"等柔和词汇
- 字数控制在 250-350 字
- 不做任何诊断性判断，强调这是情绪探索而非评判`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let imageDescription: string;
  try {
    const body = await req.json();
    imageDescription = body.image_description ?? '';
    if (!imageDescription) throw new Error('Missing image_description');
  } catch {
    return new Response(
      JSON.stringify({ error: '请提供画作描述文字' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: '服务配置错误' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const userMessage = `以下是AI对我的心灵速写画作的图像描述：\n\n${imageDescription}\n\n请基于以上描述，从色彩心理学角度给我一段温柔的情绪解读。`;

    const upstream = await fetch(
      'https://app-cbrme32s08ox-api-rLobPAn0n7m9-gateway.appmiaoda.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'MiniMax-M3',
          messages: [
            { role: 'system', content: SKETCH_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 600,
          temperature: 0.8,
        }),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new Error(`MiniMax API error ${upstream.status}: ${errText}`);
    }

    const json = await upstream.json();
    const interpretation = json.choices?.[0]?.message?.content ?? '解读生成失败，请重试。';

    return new Response(
      JSON.stringify({ interpretation }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('sketch-interpret error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? '服务暂时不可用' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
