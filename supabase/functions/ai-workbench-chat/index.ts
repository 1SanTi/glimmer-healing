/**
 * ai-workbench-chat — AI编程工作台专用 SSE 代理
 *
 * 支持五个模型，四套 API：
 *   DeepSeek 官方（DEEPSEEK_API_KEY）：
 *     - deepseek-v4-flash   快速响应，代码生成首选
 *     - deepseek-v4-pro     深度推理，复杂任务
 *   智谱 GLM（GLM_API_KEY）：
 *     - glm-4-flash         GLM-5.3，均衡性能
 *   腾讯混元 TokenHub（HY3_API_KEY）：
 *     - hunyuan-t1 → Hy3   混元旗舰，中文理解强
 *   月之暗面 Moonshot（KIMI_API_KEY）：
 *     - kimi-k3             Kimi K3，长文本推理
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 模型路由配置
interface ModelConfig {
  apiKey: () => string | undefined;
  endpoint: string;
  modelName: string;
  noTemperature?: boolean;
  /** 部分模型要求固定 temperature（如 Kimi-K3 必须传 1） */
  temperature?: number;
  maxTokens: number;   // 各模型实际支持的最大输出 token 数
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'deepseek-v4-flash': {
    apiKey: () => Deno.env.get('TENCENT_MAAS_API_KEY'),
    endpoint: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
    modelName: 'deepseek-v4-flash-202605',
    maxTokens: 384000,   // DeepSeek V4 Flash 最大输出 token
  },
  'deepseek-v4-pro': {
    apiKey: () => Deno.env.get('TENCENT_MAAS_API_KEY'),
    endpoint: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
    modelName: 'deepseek-v4-pro-202606',
    noTemperature: true,
    maxTokens: 384000,   // DeepSeek V4 Pro 官方最大输出 384K tokens（1M 上下文）
  },
  'glm-4-flash': {
    apiKey: () => Deno.env.get('GLM_API_KEY'),
    endpoint: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
    modelName: 'glm-5.3',
    maxTokens: 32768,
  },
  'hunyuan-t1': {
    apiKey: () => Deno.env.get('HY3_API_KEY'),
    endpoint: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
    modelName: 'Hy3',
    maxTokens: 32768,
  },
  'kimi-k3': {
    apiKey: () => Deno.env.get('KIMI_API_KEY'),
    endpoint: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
    modelName: 'kimi-k3',
    temperature: 1,
    maxTokens: 32768,
  },
};

/**
 * 发起上游请求并透传 SSE 流。
 * 不设代码层超时（AbortController 已移除）——由平台 150s 硬限制兜底。
 * 504 自动重试一次。
 */
async function callUpstream(config: ModelConfig, messages: Array<{ role: string; content: string }>): Promise<Response> {
  const body = JSON.stringify({
    model: config.modelName,
    messages,
    stream: true,
    max_tokens: config.maxTokens,
    ...(config.temperature !== undefined
      ? { temperature: config.temperature }
      : config.noTemperature
        ? {}
        : { temperature: 0.7 }),
  });

  const doFetch = () => fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey()}`,
    },
    body,
  });

  let resp = await doFetch();

  // 504 上游超时：等 1s 后重试一次
  if (resp.status === 504) {
    console.warn('[ai-workbench-chat] 504 gateway timeout, retrying once...');
    await new Promise(r => setTimeout(r, 1000));
    resp = await doFetch();
  }

  return resp;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let messages: Array<{ role: string; content: string }>;
  let modelId: string;

  try {
    const body = await req.json();
    messages = body.messages;
    modelId = body.model ?? 'deepseek-v4-flash';
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('messages missing');
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `请求参数无效: ${(e as Error).message}` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // 未知模型 id 降级到 deepseek-v4-flash
  const config = MODEL_CONFIGS[modelId] ?? MODEL_CONFIGS['deepseek-v4-flash'];
  const apiKey = config.apiKey();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: `服务配置错误: 模型 ${modelId} 缺少 API Key` }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[ai-workbench-chat] model=${modelId} → ${config.modelName}, msgs=${messages.length}`);

  try {
    const upstream = await callUpstream(config, messages);

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error(`[ai-workbench-chat] upstream error ${upstream.status}:`, errText);
      return new Response(
        JSON.stringify({ error: `模型调用失败 (${upstream.status})`, detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (!upstream.body) {
      return new Response(
        JSON.stringify({ error: '上游无响应体' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // 直接透传 SSE 流
    return new Response(upstream.body, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[ai-workbench-chat] 内部错误:', e);
    return new Response(
      JSON.stringify({ error: '内部错误，请稍后重试', detail: (e as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
