
-- 给关系节点表加图片URL字段
ALTER TABLE relationship_nodes ADD COLUMN IF NOT EXISTS node_image_url text;

-- 创建节点图片存储桶（公开读取）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-cbrme32s08ox-node-images',
  'app-cbrme32s08ox-node-images',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 上传策略
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_upload_node_images' AND tablename = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_upload_node_images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''app-cbrme32s08ox-node-images'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'public_read_node_images' AND tablename = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "public_read_node_images" ON storage.objects FOR SELECT TO public USING (bucket_id = ''app-cbrme32s08ox-node-images'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_node_images' AND tablename = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_delete_node_images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''app-cbrme32s08ox-node-images'')';
  END IF;
END $$;
