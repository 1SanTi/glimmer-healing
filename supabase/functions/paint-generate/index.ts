// paint-generate — 心绘小屋 AI 图像生成 Edge Function
// 支持三种模型：
//   gpt      — gpt-image-2（默认），同步返回 base64
//   vidu     — Vidu-Image-q2，异步任务轮询
//   hunyuan  — 混元 hy-image-v3，异步任务轮询
// 支持三种生图模式：文生图 / 图生图 / inpaint 局部修改
// 将结果转存至 Supabase Storage，返回公开 URL

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// API 超时：gpt-image-2 生成耗时约 30-90s，给 115s 余量（Supabase EF 上限 150s）
const API_TIMEOUT_MS = 115_000;
// Vidu 轮询配置：每 4s 查一次，最多查 30 次（120s 上限）
const VIDU_POLL_INTERVAL = 4_000;
const VIDU_POLL_MAX      = 30;

const STYLE_SUFFIX: Record<string, string> = {
  healing:    'healing watercolor illustration style, soft pastel macaron color palette, clean rounded lines, warm and comforting, white background, high quality',
  cartoon:    'simple cute cartoon comic style, low-saturation pastel colors, chibi characters, clean white background, high quality',
  sketch:     'minimalist pencil sketch style, black and white with gray tones, clear line art, suitable for psychology education, white background, high quality',
  infograph:  'infographic science illustration style, clear hierarchical layout, fresh color scheme, simple icons, suitable for teaching slides, white background, high quality',
  flow:       'flowchart visualization style, clear step nodes and connecting arrows, light elegant colors, psychology education style, white background, high quality',
  pixel:      'retro pixel art style, 16-bit pixel grid, vibrant limited palette, crisp pixel edges, video game aesthetic, white background, high quality',
  papercut:   'layered paper-cut illustration style, multi-layer shadow depth, flat geometric shapes, warm folk-art colors, white background, high quality',
  retro:      'vintage retro poster illustration style, halftone texture, muted warm tones, bold typography layout, 1960s graphic design aesthetic, white background, high quality',
  ghibli:     'Studio Ghibli inspired illustration style, soft dreamy watercolor washes, lush detailed backgrounds, gentle warm lighting, hand-painted anime aesthetic, white background, high quality',
  blueprint:  'technical blueprint line-drawing style, white lines on navy blue background, precise architectural linework, annotated labels, clean engineering diagram aesthetic, high quality',
  doodle:     'hand-drawn doodle sticker style, thick black outlines, playful kawaii characters, bright saturated colors, marker-pen texture, white background, high quality',
  flat:       'modern flat design illustration style, bold geometric shapes, minimal shadows, clean vector aesthetic, harmonious muted color palette, white background, high quality',
  realistic:  'photorealistic illustration style, highly detailed rendering, soft natural lighting, shallow depth of field, rich textures and materials, cinematic color grading, lifelike human expressions and environments, ultra-high quality',
};

const MODE_PREFIX: Record<string, string> = {
  story:  'Psychology story comic storyboard panels, ',
  theory: 'Psychology theory science illustration, ',
  game:   'Classroom game activity rules visualization flowchart, ',
  poster: 'Mental health education promotional poster design, eye-catching visual hierarchy, inspiring motivational layout, suitable for school campus display, ',
};

// 带超时的 fetch — 防止因 API 响应慢超过 Supabase EF 150s 硬限制
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 将 URL 下载为 Uint8Array（带超时）
async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const resp = await fetchWithTimeout(url, {}, 30_000); // 下载图片 30s 超时
  if (!resp.ok) throw new Error(`下载参考图失败: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

// 将 base64 字符串（纯 base64 或 data URI）解码为 Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64.includes(',') ? b64.split(',')[1] : b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// 将 Uint8Array 编码为纯 Base64 字符串
function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Vidu-Image-q2 异步生成 ─────────────────────────────────────────
// 1. 提交任务 → 返回 task_id
// 2. 轮询 GET /tasks/{id} 直到 success / failed / 超时
// 返回图片 URL 数组
// 抛出 ViduBillingError 时可在外层降级至 GPT

class ViduBillingError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ViduBillingError'; }
}

async function generateVidu(
  prompt: string,
  refImageUrls: string[],
  viduKey: string,
): Promise<string[]> {
  const BASE = 'https://tokenhub.tencentmaas.com/v1/wand/vidu-image';
  const headers = {
    'Authorization': `Bearer ${viduKey}`,
    'Content-Type': 'application/json',
  };

  // 1. 提交生成任务
  const body: Record<string, unknown> = { model: 'vidu-image-q2', prompt };
  if (refImageUrls.length > 0) body.images = refImageUrls;

  const submitResp = await fetchWithTimeout(`${BASE}/generation`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }, 30_000);

  if (!submitResp.ok) {
    const errText = await submitResp.text();
    // 402 / 401007 = 计费未开启或额度用尽 → 外层可降级 GPT
    if (submitResp.status === 402 || errText.includes('401007') || errText.includes('postpaid')) {
      throw new ViduBillingError(`Vidu 计费未生效(${submitResp.status})：${errText}`);
    }
    throw new Error(`Vidu 提交失败: ${submitResp.status} ${errText}`);
  }

  const submitData = await submitResp.json();
  const taskId: string = submitData.task_id ?? submitData.id ?? submitData.taskId;
  if (!taskId) throw new Error(`Vidu 未返回 task_id: ${JSON.stringify(submitData)}`);

  // 2. 轮询查询任务状态
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < VIDU_POLL_MAX; i++) {
    await sleep(VIDU_POLL_INTERVAL);
    const pollResp = await fetchWithTimeout(`${BASE}/tasks/${taskId}`, { headers }, 15_000);
    if (!pollResp.ok) throw new Error(`Vidu 查询失败: ${pollResp.status}`);
    const pollData = await pollResp.json();

    // 兼容多种可能的响应结构
    const status: string = (pollData.status ?? pollData.state ?? '').toLowerCase();
    if (status === 'failed' || status === 'error') {
      throw new Error(`Vidu 生成失败: ${pollData.message ?? pollData.error ?? status}`);
    }
    if (status === 'success' || status === 'completed' || status === 'done') {
      // 提取图片 URL：兼容 Vidu/TokenHub 各种响应结构
      // 优先级：creations[] > images[] > output.images[] > data[] > image_url 字段
      const creations: unknown[] = pollData.creations ?? [];
      const imgs: unknown[] = creations.length > 0 ? creations
        : (pollData.images ?? pollData.output?.images ?? pollData.data ?? []);
      const urls = (imgs as Array<string | { url?: string; image_url?: string }>).map(
        (img) => (typeof img === 'string' ? img : (img?.url ?? img?.image_url ?? '')),
      ).filter(Boolean);
      if (urls.length === 0 && pollData.image_url) urls.push(pollData.image_url as string);
      if (urls.length === 0) {
        // 记录完整响应以便调试
        console.error('Vidu 响应结构未知:', JSON.stringify(pollData));
        throw new Error('Vidu 成功但未返回图片 URL');
      }
      return urls;
    }
    // status: pending / processing / running → 继续等待
  }
  throw new Error('Vidu 生成超时（120s）');
}

// ── 混元 hy-image-v3 异步生成 ─────────────────────────────────────
// TokenHub 混元 v3 支持两种响应模式：
// 1. 同步模式：generation 直接返回 data[]/images[]（类 OpenAI 格式）
// 2. 异步模式：返回 task_id，需轮询 tasks/{id}
// 返回图片 URL 或 base64 data URI 数组
async function generateHunyuan(
  prompt: string,
  hyKey: string,
): Promise<string[]> {
  const BASE = 'https://tokenhub.tencentmaas.com/v1/wand/hunyuan-image';
  const headers = {
    'Authorization': `Bearer ${hyKey}`,
    'Content-Type': 'application/json',
  };
  const POLL_INTERVAL = 5_000;
  const POLL_MAX      = 24; // 最多等 120s

  // 通用：从响应对象中提取图片 URL
  function extractUrls(d: Record<string, unknown>): string[] {
    const creations = (d.creations ?? []) as Array<{url?: string}>;
    const imgs = creations.length > 0 ? creations
      : ((d.data ?? d.images ?? d.output?.images ?? []) as Array<{url?: string; b64_json?: string}>);
    const urls = (imgs as Array<string | {url?: string; b64_json?: string}>).map(
      (img) => (typeof img === 'string' ? img : (img?.url ?? ''))
    ).filter(Boolean);
    if (urls.length === 0 && d.image_url) urls.push(d.image_url as string);
    // base64
    const b64List = (imgs as Array<{b64_json?: string}>).filter(img => img?.b64_json);
    if (urls.length === 0 && b64List.length > 0)
      return b64List.map(img => `data:image/png;base64,${img.b64_json}`);
    // 腾讯原生 SDK 格式
    const ri = (d.Response as Record<string, unknown>)?.ResultImage ?? d.ResultImage;
    if (urls.length === 0 && ri) return [`data:image/png;base64,${ri}`];
    return urls;
  }

  // 1. 提交任务
  const submitResp = await fetchWithTimeout(`${BASE}/v3-generation`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: 'hy-image-v3', prompt }),
  }, 60_000);
  if (!submitResp.ok) throw new Error(`混元提交失败: ${submitResp.status} ${await submitResp.text()}`);
  const submitData = await submitResp.json() as Record<string, unknown>;
  console.log('混元提交响应:', JSON.stringify(submitData));

  // ── 同步模式：submission 已包含图片 ──────────────────────────────
  const syncUrls = extractUrls(submitData);
  if (syncUrls.length > 0) {
    console.log('混元同步响应，图片已返回');
    return syncUrls;
  }

  // ── 异步模式：轮询 ───────────────────────────────────────────────
  const taskId: string =
    submitData.task_id as string ??
    submitData.id as string ??
    submitData.taskId as string ??
    (submitData.Response as Record<string, unknown>)?.TaskId as string ??
    (submitData.Response as Record<string, unknown>)?.RequestId as string ?? '';
  if (!taskId) throw new Error(`混元未返回 task_id: ${JSON.stringify(submitData)}`);
  console.log('混元异步 task_id:', taskId);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // 尝试两种轮询路径：tasks/{id} 和 v3-tasks/{id}
  const pollPaths = [`${BASE}/tasks/${taskId}`, `${BASE}/v3-tasks/${taskId}`];

  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_INTERVAL);

    let pollData: Record<string, unknown> | null = null;
    for (const path of pollPaths) {
      const pollResp = await fetchWithTimeout(path, { headers }, 15_000);
      if (pollResp.ok) {
        pollData = await pollResp.json() as Record<string, unknown>;
        console.log(`混元轮询[${i}] path=${path} status=${(pollData.status ?? pollData.state ?? '?')}`);
        break;
      }
      console.warn(`混元轮询路径 ${path} 返回 ${pollResp.status}`);
    }
    if (!pollData) throw new Error('混元：两种轮询路径均失败');

    const status = String(pollData.status ?? pollData.state ??
      (pollData.Response as Record<string, unknown>)?.Status ?? '').toLowerCase();
    if (status === 'failed' || status === 'error' || status === '4') {
      throw new Error(`混元生成失败: ${pollData.message ?? pollData.error ?? status}`);
    }
    if (status === 'success' || status === 'completed' || status === 'done' || status === '100') {
      const asyncUrls = extractUrls(pollData);
      if (asyncUrls.length === 0) {
        console.error('混元完成但未找到图片:', JSON.stringify(pollData));
        throw new Error('混元成功但未返回图片 URL');
      }
      return asyncUrls;
    }
    // pending / processing / running / 50 → 继续等待
  }
  throw new Error('混元生成超时（120s）');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const apiKey  = Deno.env.get('INTEGRATIONS_API_KEY');
  const viduKey = Deno.env.get('VIDU_API_KEY');
  const hyKey   = Deno.env.get('HY_IMAGE_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: '服务配置错误：INTEGRATIONS_API_KEY 未配置' }), {
    status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

  let workId: string, prompt: string, style: string, userId: string, mode: string, genModel: string;
  let refImageUrl: string | undefined, maskBase64: string | undefined;
  let size: string, n: number, inpaint: boolean;
  try {
    const body = await req.json();
    workId      = body.work_id;
    prompt      = body.prompt;
    style       = body.style ?? 'healing';
    userId      = body.user_id;
    mode        = body.mode ?? 'story';
    genModel    = body.gen_model ?? 'gpt';   // 'gpt' | 'vidu' | 'hunyuan'
    refImageUrl = body.ref_image_url;
    maskBase64  = body.mask_base64;
    inpaint     = !!body.inpaint;
    size        = body.size ?? '1024x1024';
    n           = Math.min(Math.max(Number(body.n ?? 1), 1), inpaint ? 1 : 4);
    if (!workId || !prompt || !userId) throw new Error('缺少必要参数');
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const styleSuffix = STYLE_SUFFIX[style] ?? STYLE_SUFFIX.healing;
  const fullPrompt  = `${MODE_PREFIX[mode] ?? ''}${prompt}, ${styleSuffix}`;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  await supabase.from('painting_house_works').update({ status: 'generating' }).eq('id', workId);

  try {
    let imageUrls: string[] = [];
    let fallbackToGpt = false; // Vidu/混元降级标志

    // ══════════════════════════════════════════════════════
    // Vidu-Image-q2 模型：异步任务提交 + 轮询
    // 若 Vidu 计费未生效（ViduBillingError），自动降级 GPT
    // ══════════════════════════════════════════════════════
    if (genModel === 'vidu') {
      if (!viduKey) {
        console.warn('VIDU_API_KEY 未配置，自动降级至 GPT');
        fallbackToGpt = true;
      } else {
        try {
          const refs = refImageUrl ? [refImageUrl] : [];
          const rawUrls = await generateVidu(fullPrompt, refs, viduKey);
          // 下载并转存至 Storage
          for (let i = 0; i < rawUrls.length; i++) {
            const fileName = `${userId}/${workId}_${i}_${Date.now()}.png`;
            const bytes = await fetchImageBytes(rawUrls[i]);
            const { error: upErr } = await supabase.storage
              .from('painting-house-images')
              .upload(fileName, bytes.buffer, { contentType: 'image/png', upsert: true });
            if (upErr) throw new Error(`Storage 上传失败: ${upErr.message}`);
            const { data: pub } = supabase.storage.from('painting-house-images').getPublicUrl(fileName);
            imageUrls.push(pub.publicUrl);
          }
        } catch (viduErr) {
          if (viduErr instanceof ViduBillingError) {
            console.warn('Vidu 计费未生效，自动降级至 GPT:', viduErr.message);
            fallbackToGpt = true;
          } else {
            throw viduErr;
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════
    // 混元 hy-image-v3 模型：异步任务提交 + 轮询
    // ══════════════════════════════════════════════════════
    if (genModel === 'hunyuan') {
      if (!hyKey) {
        console.warn('HY_IMAGE_KEY 未配置，自动降级至 GPT');
        fallbackToGpt = true;
      } else {
        const rawUrls = await generateHunyuan(fullPrompt, hyKey);
        for (let i = 0; i < rawUrls.length; i++) {
          const fileName = `${userId}/${workId}_${i}_${Date.now()}.png`;
          let bytes: Uint8Array;
          if (rawUrls[i].startsWith('data:')) {
            // base64 data URI
            bytes = b64ToBytes(rawUrls[i]);
          } else {
            bytes = await fetchImageBytes(rawUrls[i]);
          }
          const { error: upErr } = await supabase.storage
            .from('painting-house-images')
            .upload(fileName, bytes.buffer, { contentType: 'image/png', upsert: true });
          if (upErr) throw new Error(`Storage 上传失败: ${upErr.message}`);
          const { data: pub } = supabase.storage.from('painting-house-images').getPublicUrl(fileName);
          imageUrls.push(pub.publicUrl);
        }
      }
    }

    // ══════════════════════════════════════════════════════
    // gpt-image-2 模型（默认，或 Vidu/混元 降级后的兜底）
    // ══════════════════════════════════════════════════════
    if (genModel === 'gpt' || fallbackToGpt) {
      let genData: { data?: Array<{ b64_json?: string; url?: string }>; images?: Array<{ b64_json?: string; url?: string }> };

      if (inpaint && refImageUrl && maskBase64) {
        // ── inpaint 局部修改 ──────────────────────────────
        const inpaintPrompt =
          `Inpaint only the white masked region. ` +
          `In the masked area: ${fullPrompt}. ` +
          `Keep all other areas of the image completely unchanged.`;

        const [origBytes, maskBytes] = await Promise.all([
          fetchImageBytes(refImageUrl),
          Promise.resolve(b64ToBytes(maskBase64)),
        ]);

        const editResp = await fetchWithTimeout(
          'https://app-cbrme32s08ox-api-baBw3XMNVmv9-gateway.appmiaoda.com/image2',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Gateway-Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'gpt-image-2', prompt: inpaintPrompt, size, n: 1,
              images: [
                { filename: 'original.png', content_type: 'image/png', b64_json: bytesToB64(origBytes) },
                { filename: 'mask.png',     content_type: 'image/png', b64_json: bytesToB64(maskBytes) },
              ],
            }),
          },
        );
        if (!editResp.ok) throw new Error(`局部修改失败: ${editResp.status} ${await editResp.text()}`);
        genData = await editResp.json();

      } else if (refImageUrl) {
        // ── 图生图 ────────────────────────────────────────
        const refBytes = await fetchImageBytes(refImageUrl);
        const editResp = await fetchWithTimeout(
          'https://app-cbrme32s08ox-api-baBw3XMNVmv9-gateway.appmiaoda.com/image2',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Gateway-Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'gpt-image-2', prompt: fullPrompt, size, n,
              images: [{ filename: 'reference.png', content_type: 'image/png', b64_json: bytesToB64(refBytes) }],
            }),
          },
        );
        if (!editResp.ok) throw new Error(`图生图失败: ${editResp.status} ${await editResp.text()}`);
        genData = await editResp.json();

      } else {
        // ── 文生图 ────────────────────────────────────────
        const genResp = await fetchWithTimeout(
          'https://app-cbrme32s08ox-api-wLNdpny6ZpVa-gateway.appmiaoda.com/image2',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Gateway-Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'gpt-image-2', prompt: fullPrompt, size, n }),
          },
        );
        if (!genResp.ok) throw new Error(`文生图失败: ${genResp.status} ${await genResp.text()}`);
        genData = await genResp.json();
      }

      const imageItems: Array<{ b64_json?: string; url?: string }> =
        genData?.data ?? genData?.images ?? [];
      if (!imageItems.length) throw new Error('图像生成返回数据为空');

      for (let i = 0; i < imageItems.length; i++) {
        const item = imageItems[i];
        const fileName = `${userId}/${workId}_${i}_${Date.now()}.png`;
        let bytes: Uint8Array;
        if (item.b64_json)  bytes = b64ToBytes(item.b64_json);
        else if (item.url)  bytes = await fetchImageBytes(item.url);
        else throw new Error('图像生成返回格式不支持');

        const { error: upErr } = await supabase.storage
          .from('painting-house-images')
          .upload(fileName, bytes.buffer, { contentType: 'image/png', upsert: true });
        if (upErr) throw new Error(`Storage 上传失败: ${upErr.message}`);
        const { data: pub } = supabase.storage.from('painting-house-images').getPublicUrl(fileName);
        imageUrls.push(pub.publicUrl);
      }
    } // end gpt branch

    await supabase.from('painting_house_works')
      .update({ status: 'done', image_urls: imageUrls })
      .eq('id', workId);

    return new Response(JSON.stringify({ success: true, image_urls: imageUrls, fallback_to_gpt: fallbackToGpt }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('paint-generate error:', msg);
    await supabase.from('painting_house_works')
      .update({ status: 'error', error_msg: msg })
      .eq('id', workId);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
