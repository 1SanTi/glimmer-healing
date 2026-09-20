
CREATE TABLE IF NOT EXISTS public.hope_leaves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  will_power  TEXT NOT NULL,
  way_power   TEXT,
  leaf_color  TEXT NOT NULL DEFAULT '#7FBA5C',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hope_leaves ENABLE ROW LEVEL SECURITY;

-- 所有人可查看叶片（匿名共享）
CREATE POLICY "hope_leaves_select_all"
  ON public.hope_leaves FOR SELECT USING (true);

-- 登录用户可新增叶片
CREATE POLICY "hope_leaves_insert_auth"
  ON public.hope_leaves FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 用户只能删除自己的叶片
CREATE POLICY "hope_leaves_delete_own"
  ON public.hope_leaves FOR DELETE
  USING (auth.uid() = user_id);
