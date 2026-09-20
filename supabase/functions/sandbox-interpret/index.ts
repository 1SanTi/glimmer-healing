// 沙盘游戏室 AI 心理解读 Edge Function
// 接收图像描述文字（由前端 image-understanding 获取），调用 MiniMax-M3 生成沙盘疗愈心理解读

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SANDBOX_SYSTEM_PROMPT = `你是一位温和、专业的沙盘游戏治疗师（Sandplay Therapist），擅长通过来访者的沙盘布置来探索其内心世界。
用户会提供一段对其沙盘场景的图像描述，请基于该描述，按以下结构给出温和的探索式解读（注意：这是自我探索，不是诊断）：

1. 🏖 沙盘整体印象（空间使用、布局中心、留白）
2. 🏠 主要意象解读（重要的模型/物件承载了哪些可能的象征）
3. 🌿 能量与情感氛围（沙盘呈现出的情绪基调、活力状态）
4. 🔍 值得关注的细节（边界、距离、冲突或和谐的意象）
5. 🌱 温暖提示（一句鼓励的话，并建议可以和咨询师深入探讨）

语气温暖、亲切，使用"可能"、"或许"、"似乎"等不确定词汇，字数控制在 350-450 字。
不能作出诊断性判断，始终提醒这是自我探索的参考，建议有需要时与专业心理咨询师沟通。`;

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
      JSON.stringify({ error: '请提供图像描述文字' }),
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
    const userMessage = `以下是 AI 对我的沙盘布置的图像描述：\n\n${imageDescription}\n\n请基于以上描述，给我一个温和的沙盘疗愈解读。`;

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
          max_completion_tokens: 900,
          temperature: 0.72,
          stream: false,
          messages: [
            { role: 'system', content: SANDBOX_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('MiniMax sandbox-interpret error:', upstream.status, errText);
      return new Response(
        JSON.stringify({ error: 'AI 服务暂时不可用', detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const result = await upstream.json();
    const interpretation: string = result.choices?.[0]?.message?.content
      ?? '感谢你完成了这次沙盘创作。AI 暂时无法解读，建议记录下摆放时的感受，那也是宝贵的自我探索。';

    return new Response(
      JSON.stringify({ interpretation }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('sandbox-interpret error:', e);
    return new Response(
      JSON.stringify({ error: '解读服务暂时不可用，请稍后重试' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
