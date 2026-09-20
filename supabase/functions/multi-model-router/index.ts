import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── 模型配置 ──────────────────────────────────────────────────────
const MODEL_CONFIGS = {
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    apiKey: Deno.env.get("DEEPSEEK_API_KEY") ?? "",
    modelName: "deepseek-chat",
  },
  glm: {
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    apiKey: Deno.env.get("GLM_API_KEY") ?? "",
    modelName: "glm-4-flash",
  },
  "glm-vision": {
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    apiKey: Deno.env.get("GLM_API_KEY") ?? "",
    modelName: "glm-4v",
  },
  agnes: {
    url: "https://apihub.agnes-ai.com/v1/chat/completions",
    apiKey: Deno.env.get("AGNES_API_KEY") ?? "",
    modelName: "agnes-2.0-flash",
  },
  nex: {
    url: "https://api.siliconflow.cn/v1/chat/completions",
    apiKey: Deno.env.get("NEX_API_KEY") ?? "",
    modelName: "nex-agi/Nex-N2-Pro",
  },
};

// 路由规则
const ROUTE_MAP: Record<string, { primary: string; fallback: string }> = {
  text: { primary: "deepseek", fallback: "agnes" },
  code: { primary: "deepseek", fallback: "nex" },
  reasoning: { primary: "nex", fallback: "deepseek" },
  vision: { primary: "glm-vision", fallback: "glm-vision" },
  chat: { primary: "glm", fallback: "deepseek" },
  fast: { primary: "agnes", fallback: "agnes" },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── 调用模型 ──────────────────────────────────────────────────────
async function callModel(
  modelKey: string,
  messages: Array<{ role: string; content: string | object[] }>,
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  const config = MODEL_CONFIGS[modelKey as keyof typeof MODEL_CONFIGS];
  if (!config) throw new Error(`未知模型: ${modelKey}`);

  const payload = {
    model: config.modelName,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4096,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 代码生成延长到30s

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`模型 ${modelKey} 返回错误 ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

// ── 视觉消息构建 ──────────────────────────────────────────────────
function buildVisionMessages(
  prompt: string,
  imageUrl: string
): Array<{ role: string; content: object[] }> {
  return [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: imageUrl } },
      { type: "text", text: prompt },
    ],
  }];
}

// ── 主逻辑 ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const {
      task_type = "text",
      prompt,
      image_url = null,
      system_prompt = null,
      preferred_model = null,
      temperature = 0.7,
      max_tokens = 4096,
      history = [],   // 多轮对话历史 [{role, content}]
    } = body;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "缺少必要参数: prompt" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 确定路由
    let modelKey: string;
    let fallbackKey: string;

    if (preferred_model && MODEL_CONFIGS[preferred_model as keyof typeof MODEL_CONFIGS]) {
      modelKey = preferred_model;
      fallbackKey = "agnes";
    } else if (image_url) {
      modelKey = "glm-vision";
      fallbackKey = "glm-vision";
    } else {
      const route = ROUTE_MAP[task_type] ?? ROUTE_MAP.text;
      modelKey = route.primary;
      fallbackKey = route.fallback;
    }

    // 构建消息（支持多轮 history）
    const messages: Array<{ role: string; content: string | object[] }> = [];
    if (system_prompt) {
      messages.push({ role: "system", content: system_prompt });
    }
    // 插入多轮历史（最多10条，过滤掉当前这条 prompt 以避免重复）
    if (Array.isArray(history) && history.length > 0) {
      const validHistory = history
        .filter((m: { role: string; content: string }) => m.role && m.content)
        .slice(-10);
      // 去掉最后一条（即 userMsg 本身，前端已包含在 history 末尾）
      const contextHistory = validHistory.slice(0, -1);
      messages.push(...contextHistory);
    }
    if (image_url) {
      messages.push(...buildVisionMessages(prompt, image_url));
    } else {
      messages.push({ role: "user", content: prompt });
    }

    // 调用主模型，失败则降级
    let content: string;
    let modelUsed = modelKey;
    let isFallback = false;
    let fallbackReason: string | null = null;

    try {
      content = await callModel(modelKey, messages, { temperature, max_tokens });
    } catch (primaryError) {
      fallbackReason = `主模型 ${MODEL_CONFIGS[modelKey as keyof typeof MODEL_CONFIGS]?.modelName} 调用失败: ${(primaryError as Error).message}`;
      console.error(`[路由降级] ${fallbackReason}`);

      if (fallbackKey !== modelKey) {
        const fallbackMessages = image_url
          ? [{ role: "user", content: `请根据以下描述回答（图片暂时无法处理）：${prompt}` }]
          : messages;
        content = await callModel(fallbackKey, fallbackMessages, { temperature, max_tokens });
        modelUsed = fallbackKey;
        isFallback = true;
      } else {
        throw primaryError;
      }
    }

    if (isFallback) {
      content += "\n\n（注：主模型暂时不可用，已自动切换到备用模型）";
    }

    return new Response(
      JSON.stringify({
        content,
        model_used: MODEL_CONFIGS[modelUsed as keyof typeof MODEL_CONFIGS]?.modelName,
        task_type,
        fallback: isFallback,
        fallback_reason: fallbackReason,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[multi-model-router 错误]", error);
    return new Response(
      JSON.stringify({ error: "模型调用失败，请稍后重试", detail: (error as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
