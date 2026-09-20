
-- 创建 generated-audio Storage bucket（用于存放 AI 生成的冥想音乐）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-audio',
  'generated-audio',
  true,
  10485760, -- 10 MB
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav']
);

-- RLS: 所有人可读
CREATE POLICY "generated_audio_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'generated-audio');

-- RLS: 已认证用户可写（Edge Function 用 service_role 不受此限制）
CREATE POLICY "generated_audio_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'generated-audio' AND auth.role() = 'authenticated');

CREATE POLICY "generated_audio_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'generated-audio' AND auth.role() = 'authenticated');

CREATE POLICY "generated_audio_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'generated-audio' AND auth.role() = 'authenticated');
