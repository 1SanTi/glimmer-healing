// music-generate Edge Function
// 严格遵循 ai-music-generation skill 规范
// 提交 MiniMax Music 音乐生成任务，返回 task_id 供前端轮询

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// skill 规定的提交端点
const MUSIC_GEN_URL = 'https://app-cc1nzlfg8mip-api-MusicGen01-gateway.appmiaoda.com/v1/music_generation';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });

  let prompt: string;
  let model: string;
  let lyrics: string | undefined;

  try {
    const body = await req.json();
    // 默认：纯音乐冥想背景（无人声，music-01）
    prompt = body.prompt ?? '空灵治愈，轻柔钢琴与弦乐，冥想放松，深度平静，无人声';
    model  = body.model  ?? 'music-01';
    lyrics = body.lyrics;  // 可选歌词（仅 music-01-vocal 有效）
  } catch {
    return new Response(JSON.stringify({ error: '请求参数无效' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // skill 规定：platform_managed 认证，使用 INTEGRATIONS_API_KEY
  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: '服务配置错误：缺少 INTEGRATIONS_API_KEY' }), {
    status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

  try {
    const payload: Record<string, unknown> = {
      model,
      prompt,
      // skill 规定的 audio_setting 字段
      audio_setting: { format: 'mp3', sample_rate: 44100, bitrate: 128000 },
    };
    // 有歌词时附上（用于 music-01-vocal 演唱模式）
    if (lyrics) payload.lyrics = lyrics;

    const upstream = await fetch(MUSIC_GEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // skill 规定的认证头格式
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[music-generate] upstream error:', upstream.status, errText.slice(0, 500));

      // skill 注意事项：明确处理 429 和 402
      if (upstream.status === 429) {
        return new Response(JSON.stringify({ error: '配额超限，请稍后再试' }), {
          status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      if (upstream.status === 402) {
        return new Response(JSON.stringify({ error: '余额不足，请联系管理员' }), {
          status: 402, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      // 其他上游错误：记录状态码，方便排查
      return new Response(
        JSON.stringify({ error: `音乐生成服务暂时不可用 (${upstream.status})`, detail: errText.slice(0, 200) }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const json = await upstream.json();
    const taskId: string | undefined = json.data?.task_id;
    if (!taskId) {
      return new Response(JSON.stringify({ error: '未能获取任务ID', raw: json }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    console.log('[music-generate] 任务已提交, task_id:', taskId);
    return new Response(JSON.stringify({ task_id: taskId }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    console.error('[music-generate] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

