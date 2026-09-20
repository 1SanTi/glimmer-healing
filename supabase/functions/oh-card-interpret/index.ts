// oh-card-interpret Edge Function
// 调用 MiniMax-M3 多模态模型对 OH 卡牌阵进行非诊断性投射解读
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MINIMAX_URL =
  "https://app-cbrme32s08ox-api-rLobPAn0n7m9-gateway.appmiaoda.com/v1/chat/completions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CardInput {
  type: "image" | "text";
  card_index: number;
  image_url: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "服务配置错误" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { cards: CardInput[]; cardDescriptions: string; desktopName: string };
  try {
    body = await req.json();
    if (!body.cards || body.cards.length === 0) throw new Error("缺少卡牌信息");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { cards, desktopName } = body;
  const imageCards = cards.filter(c => c.type === "image");
  const textCards = cards.filter(c => c.type === "text");

  // 构造多模态消息内容
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: string } };

  const userContent: ContentPart[] = [
    {
      type: "text",
      text: `你是一位温暖、非评判性的OH卡引导师。

用户在「${desktopName}」桌面上摆放了以下卡牌：
- 图像卡：${imageCards.length} 张（编号：${imageCards.map(c => c.card_index).join("、")}）
- 文字卡：${textCards.length} 张（编号：${textCards.map(c => c.card_index).join("、")}）

请根据你看到的卡牌图像内容，从投射心理学角度给出温暖、开放性的牌阵解读。

解读要求：
1. 以第一人称「你」直接与用户对话，语气温暖亲切
2. 观察卡牌中呈现的意象、颜色、空间关系
3. 提出开放性问题引发自我反思（2-3个）
4. 结尾给出一段鼓励性总结
5. 严禁做出任何诊断、判断或定论性表述
6. 控制在300-500字

以下是用户摆放的图像卡：`,
    },
  ];

  // 附加图像卡图片（最多5张，避免token超限）
  const imagesToInclude = imageCards.slice(0, 5);
  for (const card of imagesToInclude) {
    userContent.push({
      type: "image_url",
      image_url: { url: card.image_url, detail: "default" },
    });
  }

  const payload = {
    model: "MiniMax-M3",
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "system",
        content:
          "你是专业的OH卡（投射性卡牌）引导师，用温暖、非指导性的语言帮助来访者探索内心。你的解读永远是开放性、探索性的，从不作出诊断或定论。",
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    max_completion_tokens: 1024,
    temperature: 0.85,
    top_p: 0.95,
  };

  try {
    const upstream = await fetch(MINIMAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      throw new Error(`上游服务错误 ${upstream.status}: ${errorText}`);
    }

    const result = await upstream.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      base_resp?: { status_code: number; status_msg: string };
    };

    if (result.base_resp && result.base_resp.status_code !== 0) {
      throw new Error(`MiniMax错误：${result.base_resp.status_msg}`);
    }

    const interpretation =
      result.choices?.[0]?.message?.content ?? "暂未获取到解读内容，请重试";

    return new Response(
      JSON.stringify({ interpretation }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: `解读失败：${msg}` }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
