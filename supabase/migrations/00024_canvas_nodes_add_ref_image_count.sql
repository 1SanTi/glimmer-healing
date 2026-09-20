-- 添加参考图URL字段（图生图时使用）和生成数量字段
ALTER TABLE canvas_nodes
  ADD COLUMN IF NOT EXISTS ref_image_url text,
  ADD COLUMN IF NOT EXISTS count integer NOT NULL DEFAULT 1;

-- 节点类型：edit（编辑卡片）| image（图片结果卡片）
ALTER TABLE canvas_nodes
  ADD COLUMN IF NOT EXISTS node_type text NOT NULL DEFAULT 'edit';
