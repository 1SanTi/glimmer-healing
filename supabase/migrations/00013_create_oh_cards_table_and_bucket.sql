
-- 创建 OH 卡牌表
CREATE TABLE oh_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('image', 'text', 'back')),
  title text,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  card_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX oh_cards_type_idx ON oh_cards(type);

-- 创建 OH 卡游玩记录表
CREATE TABLE oh_card_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  layout_screenshot_url text,
  ai_interpretation text,
  cards_used jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Storage bucket oh-cards（公开读）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'oh-cards',
  'oh-cards',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- oh-cards bucket: 允许所有人读取
CREATE POLICY "oh_cards_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'oh-cards');

-- oh-cards bucket: 仅 service role 上传
CREATE POLICY "oh_cards_service_insert"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'oh-cards');

-- oh-cards bucket: 仅 service role 更新
CREATE POLICY "oh_cards_service_update"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'oh-cards');

-- RLS for oh_cards table
ALTER TABLE oh_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oh_cards_read_all"
  ON oh_cards FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "oh_cards_insert_service"
  ON oh_cards FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "oh_cards_update_service"
  ON oh_cards FOR UPDATE
  TO service_role
  USING (true);

-- RLS for oh_card_records
ALTER TABLE oh_card_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oh_card_records_own_select"
  ON oh_card_records FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "oh_card_records_own_insert"
  ON oh_card_records FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "oh_card_records_own_update"
  ON oh_card_records FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());
