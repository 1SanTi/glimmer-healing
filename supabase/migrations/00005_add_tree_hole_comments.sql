
-- 树洞帖子评论表
CREATE TABLE IF NOT EXISTS tree_hole_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES tree_hole_posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tree_hole_comments_post_id_idx ON tree_hole_comments(post_id);

ALTER TABLE tree_hole_comments ENABLE ROW LEVEL SECURITY;

-- 已登录用户可查看公开帖子的评论
CREATE POLICY "comments_select" ON tree_hole_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tree_hole_posts p
      WHERE p.id = post_id AND p.is_public = true
    )
  );

-- 已登录用户可发评论
CREATE POLICY "comments_insert" ON tree_hole_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 只能删除自己的评论
CREATE POLICY "comments_delete" ON tree_hole_comments
  FOR DELETE USING (auth.uid() = user_id);
