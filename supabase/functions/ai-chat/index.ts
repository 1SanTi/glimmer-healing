// AI心理咨询对话 Edge Function（非流式）
// 封装 MiniMax-M3，根据 expert_id 注入流派 system prompt，并输出技术标记

const ALLOWED_ORIGIN = '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 各流派技术关键词检测规则（用于生成 tech_note）
const TECH_PATTERNS: Record<string, { pattern: RegExp; note: string }[]> = {
  rogers: [
    { pattern: /听起来|你感到|你觉得|你刚才说/, note: '情感反映' },
    { pattern: /对吗|是这样吗|是吗/, note: '复述确认' },
    { pattern: /你怎么看|你认为|你希望/, note: '开放性探索' },
  ],
  beck: [
    { pattern: /证据|事实|证明|真的|肯定|总是|从来|绝对/, note: '认知重构' },
    { pattern: /换一种方式|另一种想法|替代思维|试试用/, note: '应对性思维' },
    { pattern: /记录|写下来|思维表|评分/, note: '行为记录' },
  ],
  perls: [
    { pattern: /此刻|现在|当下|感受到|身体|哪个部位/, note: '此时此地觉察' },
    { pattern: /空椅子|对面|坐在这里|直接告诉他/, note: '空椅子技术' },
    { pattern: /我注意到|你的表情|你的手|你停顿了/, note: '现象学描述' },
  ],
  wolpe: [
    { pattern: /深呼吸|放松|肌肉|0到10|紧张度|评分/, note: '放松训练' },
    { pattern: /想象|画面|场景|从最轻微/, note: '系统脱敏' },
    { pattern: /行动|步骤|计划|这一步|明天/, note: '行为计划' },
  ],
  freud: [
    { pattern: /联想到|想到了什么|那个字|告诉你/, note: '自由联想' },
    { pattern: /早年|小时候|父母|原生|过去/, note: '早期经历探索' },
    { pattern: /防御|合理化|投射|回避/, note: '防御机制识别' },
  ],
};

function extractTechNote(content: string, expertId: string): string {
  const patterns = TECH_PATTERNS[expertId] ?? [];
  for (const { pattern, note } of patterns) {
    if (pattern.test(content)) return note;
  }
  return '';
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let messages: Array<{ role: string; content: string }>;
  let expert_id: string;

  try {
    const body = await req.json();
    messages = body.messages;
    expert_id = body.expert_id ?? 'rogers';
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('messages missing');
    }
  } catch {
    return new Response(
      JSON.stringify({ error: '无效的请求参数' }),
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
          thinking: { type: 'adaptive' },
          messages,
          max_completion_tokens: 600,
          temperature: 0.8,
          stream: false,
        }),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('MiniMax API error:', upstream.status, errText);
      return new Response(
        JSON.stringify({ error: 'AI服务暂时不可用', detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const result = await upstream.json();

    // 提取回复内容并附加技术标记
    const content: string = result.choices?.[0]?.message?.content ?? '';
    const tech_note = extractTechNote(content, expert_id);

    return new Response(
      JSON.stringify({ ...result, tech_note }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('ai-chat error:', e);
    return new Response(
      JSON.stringify({ error: '内部错误，请稍后重试' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
