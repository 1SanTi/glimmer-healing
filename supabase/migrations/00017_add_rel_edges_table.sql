
-- 关系边表：支持任意两节点之间的有向/无向关系，带关系标签
CREATE TABLE IF NOT EXISTS rel_edges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES relationship_nodes(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES relationship_nodes(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT '',
  direction   text NOT NULL DEFAULT 'both' CHECK (direction IN ('source_to_target','target_to_source','both')),
  quality     text NOT NULL DEFAULT 'neutral' CHECK (quality IN ('positive','neutral','draining')),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE relationship_nodes
  ADD COLUMN IF NOT EXISTS is_center boolean NOT NULL DEFAULT false;

ALTER TABLE rel_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_edges_all" ON rel_edges
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
