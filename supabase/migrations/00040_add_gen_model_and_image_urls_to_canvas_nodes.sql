-- 补充 canvas_nodes 中缺失的两列
ALTER TABLE canvas_nodes
  ADD COLUMN IF NOT EXISTS gen_model text NOT NULL DEFAULT 'gpt',
  ADD COLUMN IF NOT EXISTS image_urls text[] NULL;
