
-- 心绘小屋作品表
CREATE TABLE painting_house_works (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid()
                    REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL DEFAULT '',
  mode            text NOT NULL CHECK (mode IN ('story', 'theory', 'game')),
  style           text NOT NULL DEFAULT 'healing',
  prompt          text NOT NULL,
  image_urls      text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','generating','done','error')),
  error_msg       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER painting_house_works_updated_at
  BEFORE UPDATE ON painting_house_works
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE painting_house_works ENABLE ROW LEVEL SECURITY;

-- 用户只能读/写自己的作品
CREATE POLICY "own_select" ON painting_house_works
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON painting_house_works
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON painting_house_works
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_delete" ON painting_house_works
  FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket：心绘小屋生成图片
INSERT INTO storage.buckets (id, name, public)
VALUES ('painting-house-images', 'painting-house-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "public_read_painting" ON storage.objects
  FOR SELECT USING (bucket_id = 'painting-house-images');
CREATE POLICY "auth_upload_painting" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'painting-house-images'
    AND auth.role() = 'authenticated'
  );
CREATE POLICY "own_delete_painting" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'painting-house-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
