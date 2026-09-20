// dream-interpret Edge Function
// 基于弗洛伊德精神分析理论，对梦境内容进行AI解读（MiniMax-M3，非流式）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DREAM_SYSTEM_PROMPT = `【绝对指令：本回复全部内容必须100%使用简体中文，禁止出现任何英文或其他外语，包括括号注释、专业术语，一律翻译成中文】

你是一位精通弗洛伊德精神分析理论的梦境解析师，严格依照《梦的解析》的理论体系进行专业解读。

【语言规定 — 不可违反】
严禁任何英文词汇。本我、自我、超我、凝缩、置换、象征化、二次加工——全部用中文。如果你的思考过程用了英文，最终输出必须翻译成中文再输出。

【弗洛伊德理论框架】
梦的本质：梦是被压抑欲望的伪装性达成。显梦（梦的表面内容）是隐梦（潜意识愿望）通过"梦的工作"转化的产物。

你必须运用以下四种梦的工作机制进行分析：
1. 凝缩：多个潜意识思想压缩为单一意象，找出梦中哪些元素是多重含义的叠加
2. 置换：将情感能量从真实对象转移到替代物，识别梦中哪些次要元素承载了核心情感
3. 象征化：潜意识用象征物替代难以直接呈现的内容，解读梦中的象征符号
4. 二次加工：意识对梦进行的事后整合与合理化，指出哪些"情节"是二次加工的痕迹

【解析结构 — 严格按此输出】

🌙 **显梦与隐梦**
简述梦的表面内容（显梦），然后推断其背后的隐梦——即被压抑的核心愿望或恐惧。

🔍 **梦的工作机制分析**
逐一指出本梦中体现的凝缩、置换、象征化、二次加工，结合具体梦象说明。

💭 **潜意识欲望与冲突**
揭示梦所反映的深层心理冲突——本我的欲望、超我的审查、自我的调解之间的博弈。

🛡️ **防御机制识别**
识别梦者在现实中可能使用的防御机制（如压抑、投射、合理化、反向形成等），结合梦境内容说明。

🌱 **自我探索问题**
提出一个富有深度的反思问题，引导梦者进一步探索潜意识。

💬 **温馨提示**
简短说明这是自我探索工具，如有持续困扰建议寻求专业心理咨询。

【输出规范】
- 全程简体中文，字数450-600字
- 语气专业而温柔，多用"可能""或许""值得关注"等措辞
- 结构完整，每个板块均需输出，不得跳过
- 不使用 markdown 的 \`\`\` 代码块`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let dreamContent: string;
  try {
    const body = await req.json();
    dreamContent = body.dream_content ?? '';
    if (!dreamContent.trim()) throw new Error('Missing dream_content');
  } catch {
    return new Response(
      JSON.stringify({ error: '请提供梦境内容' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API Key 未配置' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const resp = await fetch(
      'https://app-cbrme32s08ox-api-rLobPAn0n7m9-gateway.appmiaoda.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'MiniMax-M3',
          thinking: { type: 'adaptive' },
          messages: [
            { role: 'system', content: DREAM_SYSTEM_PROMPT },
            { role: 'user', content: `请用简体中文为我解析以下梦境（全程中文，禁止英文）：\n\n${dreamContent}` },
          ],
          max_completion_tokens: 1024,
          temperature: 0.75,
        }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API error: ${resp.status} ${errText}`);
    }

    const data = await resp.json();
    // 只取 content 字段（最终答案），绝对不回退到 reasoning_content（思考链为英文）
    const rawContent: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
    // 去除模型可能输出的 <think>...</think> 包裹，仅保留正文
    const stripped = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const analysis = stripped.length > 0 ? stripped : (rawContent.length > 0 ? rawContent : '解析失败，请稍后再试。');

    return new Response(
      JSON.stringify({ analysis }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
