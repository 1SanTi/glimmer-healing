-- 创建 admin_users 表，通过用户 ID 标记管理员
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 启用 RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 所有人都可以查看（因为 is_admin() 需要读取）
DROP POLICY IF EXISTS admin_users_select_all ON public.admin_users;
CREATE POLICY admin_users_select_all
  ON public.admin_users FOR SELECT
  USING (true);

-- 仅已有管理员可以添加新管理员
DROP POLICY IF EXISTS admin_users_insert_admin ON public.admin_users;
CREATE POLICY admin_users_insert_admin
  ON public.admin_users FOR INSERT
  WITH CHECK (is_admin());

-- 修改 is_admin() 函数：完全以 admin_users 表为准（原先的硬编码手机号回退已移除）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 管理员身份由 public.admin_users 表定义。自部署时请手动授予管理员：
  --   INSERT INTO public.admin_users (id)
  --   SELECT id FROM auth.users WHERE phone = '<你的手机号>';
  --
  -- ⚠️ 安全提醒：请务必确认 admin_users 的 INSERT 策略只允许已有管理员写入
  --    （WITH CHECK (is_admin())），而不是 WITH CHECK (auth.uid() = id)。
  --    后者会让任何注册用户把自己提升为管理员。详见仓库根目录 SECURITY.md。
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = auth.uid()
  );
END;
$$;

-- 同时保留等价 SQL，确保当前 session 中的 admin_users 行能被立即识别
GRANT SELECT, INSERT ON public.admin_users TO authenticated;
