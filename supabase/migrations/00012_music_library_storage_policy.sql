
-- 任何人可读（公开曲库）
CREATE POLICY "music_library_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'music-library');

-- 已登录用户可上传
CREATE POLICY "music_library_auth_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'music-library');

-- 已登录用户可更新自己的文件
CREATE POLICY "music_library_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'music-library');
