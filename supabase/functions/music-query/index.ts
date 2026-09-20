// music-query Edge Function
// 严格遵循 ai-music-generation skill 规范
// 查询 MiniMax Music 生成任务状态
// 成功后将 CDN 音频（临时链接）转存至 Supabase Storage，返回持久化 URL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// skill 规定的查询端点（注意是 MusicGen02 不同于提交端点 MusicGen01）
const MUSIC_QUERY_BASE = 'https://app-cc1nzlfg8mip-api-MusicGen02-gateway.appmiaoda.com/v1/music_generation';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  let taskId: string;
  try {
    const body = await req.json();
    taskId = body.task_id ?? '';
    if (!taskId) throw new Error('Missing task_id');
  } catch {
    return new Response(JSON.stringify({ error: '请求参数无效，需提供 task_id' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // skill 规定：platform_managed 认证
  const apiKey      = Deno.env.get('INTEGRATIONS_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!apiKey) return new Response(JSON.stringify({ error: '服务配置错误：缺少 INTEGRATIONS_API_KEY' }), {
    status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

  try {
    // skill 规定：GET /v1/music_generation/{task_id}
    const queryResp = await fetch(`${MUSIC_QUERY_BASE}/${taskId}`, {
      method: 'GET',
      headers: { 'X-Gateway-Authorization': `Bearer ${apiKey}` },
    });

    if (!queryResp.ok) {
      const errText = await queryResp.text();
      console.error('[music-query] upstream error:', queryResp.status, errText);
      return new Response(JSON.stringify({ error: '查询失败', detail: errText }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const result = await queryResp.json();
    // skill 规定：status 字段在 data.status
    const status: string = result.data?.status ?? 'Processing';

    // 仍在生成中 — 前端继续轮询
    if (status === 'Processing') {
      return new Response(JSON.stringify({ status: 'Processing' }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 生成失败
    if (status !== 'Success') {
      console.warn('[music-query] 生成失败, task_id:', taskId, 'status:', status);
      return new Response(JSON.stringify({ status: 'Failed', error: '音乐生成失败' }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 成功 — skill 注意事项：CDN URL 有时效性，必须立即转存到 Supabase Storage
    // skill 规定：音频 URL 字段为 data.audio_file
    const cdnUrl: string = result.data.audio_file;
    if (!cdnUrl) {
      return new Response(JSON.stringify({ status: 'Failed', error: '未获取到音频 URL' }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const filename    = `${taskId}.mp3`;
    const storagePath = `music/${filename}`;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    // 检查是否已转存（避免重复上传，保持幂等）
    const { data: existing } = await supabase.storage
      .from('generated-audio')
      .list('music', { search: filename });

    let publicUrl: string;

    if (existing && existing.length > 0) {
      // 已存在，直接取 public URL
      const { data: urlData } = supabase.storage
        .from('generated-audio')
        .getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
      console.log('[music-query] 已存在，直接返回:', publicUrl);
    } else {
      // 下载 CDN 音频（使用全局 fetch，Edge Function 环境可直接访问）
      const audioResp = await fetch(cdnUrl);
      if (!audioResp.ok) throw new Error(`下载 CDN 音频失败: ${audioResp.status}`);
      const audioBuffer = await audioResp.arrayBuffer();

      // 转存到 Supabase Storage（bucket: generated-audio，路径: music/）
      const { error: uploadErr } = await supabase.storage
        .from('generated-audio')
        .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

      if (uploadErr) throw new Error(`上传到 Storage 失败: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage
        .from('generated-audio')
        .getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
      console.log('[music-query] 转存完成，持久化 URL:', publicUrl);
    }

    return new Response(JSON.stringify({ status: 'Success', url: publicUrl }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    console.error('[music-query] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

