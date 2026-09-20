// HTP房树人测试 AI解读 Edge Function（v2）
// 接收图片描述文字（由前端image-understanding API获取），调用MiniMax-M3生成心理解读

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HTP_SYSTEM_PROMPT = `你是一位温和、专业的心理投射分析师，擅长从房树人（HTP）绘画中提取象征性信息。
用户会提供一段对其画作的图像描述，请基于该描述，按以下结构给出温和的自我探索式解读（注意：不是诊断）：

1. 🏠 房子解读（安全感与家庭关系）
2. 🌲 树木解读（自我成长与活力）
3. 🧍 人物解读（自我形象与人际关系）
4. 💫 整体印象（画面构图、用色、留白等）
5. 🌱 温暖提示（一句鼓励的话）

语气温暖、亲切，使用"可能"、"或许"、"似乎"等不确定词汇，字数控制在300-400字。
绝对不能作出诊断性判断，始终提醒这只是自我探索的参考。`;

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
    // 支持新版 image_description（图像理解文字） 或旧版 image_data_url 兜底
    imageDescription = body.image_description ?? body.image_data_url ?? '';
    if (!imageDescription) throw new Error('Missing image_description');
  } catch {
    return new Response(
      JSON.stringify({ error: '请提供图片描述文字' }),
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
    const userMessage = `以下是AI对我的房树人画作的图像描述：\n\n${imageDescription}\n\n请基于以上描述，给我一个温和的自我探索解读。`;

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
          thinking: { type: 'disabled' },
          max_completion_tokens: 800,
          temperature: 0.7,
          stream: false,
          messages: [
            { role: 'system', content: HTP_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('MiniMax HTP error:', upstream.status, errText);
      return new Response(
        JSON.stringify({ error: 'AI服务暂时不可用', detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const result = await upstream.json();
    const interpretation: string = result.choices?.[0]?.message?.content
      ?? '感谢你分享了这幅画。由于AI暂时无法完整解读，建议你记录下画画时的感受，那也是一种珍贵的自我探索。';

    return new Response(
      JSON.stringify({ interpretation }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('htp-interpret error:', e);
    return new Response(
      JSON.stringify({ error: '解读服务暂时不可用，请稍后重试' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
