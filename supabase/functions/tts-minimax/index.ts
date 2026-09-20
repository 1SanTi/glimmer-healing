// edge-functions/tts-minimax/index.ts
// 调用 MiniMax T2A V2 合成语音，返回持久化 CDN URL
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function streamMediaToStorage(mediaUrl: string, bucketName: string) {
  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "audio/mpeg";
    const ext = contentType.split("/")[1]?.split(";")[0] ?? "mp3";
    const filePath = `tts/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, response.body!, { contentType, cacheControl: "3600", upsert: false });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    return { success: true, publicUrl: urlData.publicUrl };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  let text: string, voiceId: string, model: string;
  let speed: number | undefined, vol: number | undefined, pitch: number | undefined, emotion: string | undefined;

  try {
    const body = await req.json();
    text = body.text;
    if (!text) throw new Error("Missing text");
    voiceId = body.voice_id ?? "male-qn-qingse";
    model   = body.model   ?? "speech-02-turbo";
    speed   = body.speed;
    vol     = body.vol;
    pitch   = body.pitch;
    emotion = body.emotion;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "Server config error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const voiceSetting: Record<string, unknown> = { voice_id: voiceId };
  if (speed   !== undefined) voiceSetting.speed   = speed;
  if (vol     !== undefined) voiceSetting.vol     = vol;
  if (pitch   !== undefined) voiceSetting.pitch   = pitch;
  if (emotion !== undefined) voiceSetting.emotion = emotion;

  const upstream = await fetch("https://app-cbrme32s08ox-api-DLEO7Bj0lORa-gateway.appmiaoda.com/v1/t2a_v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Gateway-Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, text, stream: false, output_format: "url", voice_setting: voiceSetting, audio_setting: { format: "mp3" } }),
  });

  if (!upstream.ok) return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const result = await upstream.json();
  if (result.base_resp?.status_code !== 0) {
    return new Response(JSON.stringify({ error: `TTS error ${result.base_resp?.status_code}: ${result.base_resp?.status_msg}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const rawUrl = result.data?.audio;
  let audioUrl = rawUrl;
  if (rawUrl) {
    const stored = await streamMediaToStorage(rawUrl, "generated-audio");
    if (stored.success) audioUrl = stored.publicUrl;
  }

  return new Response(JSON.stringify({ audioUrl, audioLength: result.extra_info?.audio_length ?? 0, traceId: result.trace_id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
