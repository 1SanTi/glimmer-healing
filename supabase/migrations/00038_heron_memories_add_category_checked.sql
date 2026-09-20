ALTER TABLE heron_memories
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'preference',
  ADD COLUMN IF NOT EXISTS checked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN heron_memories.category IS 'preference=用户偏好 | task=重要事项 | summary=历史摘要';
COMMENT ON COLUMN heron_memories.checked IS '仅 task 类型有效，表示是否已完成';
