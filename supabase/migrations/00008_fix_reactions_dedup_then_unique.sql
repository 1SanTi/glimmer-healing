
-- 先用 CTE 删除重复行，只保留每个 (post_id, user_id) 的最新记录
DELETE FROM tree_hole_reactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY post_id, user_id
             ORDER BY created_at DESC
           ) AS rn
    FROM tree_hole_reactions
  ) sub
  WHERE rn > 1
);

-- 删除旧的三列唯一约束（若存在）
ALTER TABLE tree_hole_reactions
  DROP CONSTRAINT IF EXISTS tree_hole_reactions_post_id_user_id_reaction_type_key;

-- 添加新的两列唯一约束（单选覆盖）
ALTER TABLE tree_hole_reactions
  ADD CONSTRAINT tree_hole_reactions_post_id_user_id_key UNIQUE (post_id, user_id);

-- 加速查询的索引
CREATE INDEX IF NOT EXISTS idx_tree_hole_reactions_post_id ON tree_hole_reactions(post_id);
