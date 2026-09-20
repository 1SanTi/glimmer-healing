-- 修正 admin_users 的 INSERT 策略与 is_admin() 函数
--
-- ⚠️ 安全说明（重要）
--
-- 本文件的原版本使用了如下策略：
--
--     CREATE POLICY admin_users_insert_self ON public.admin_users
--       FOR INSERT WITH CHECK (auth.uid() = id);
--
-- 由于 is_admin() 的判定条件之一是「当前用户在 admin_users 表中存在」，
-- 上述策略意味着**任何已登录用户都能把自己插入 admin_users，从而自行提权为管理员**，
-- 进而读取与修改 user_subscriptions、redemption_codes 等全部业务数据。
-- 该漏洞不依赖客户端，直接调用 Supabase SDK 即可利用。
--
-- 现已改为「仅管理员可添加管理员」。由此带来的约束是：首位管理员无法通过
-- 客户端自助产生，必须在数据库中手动播种（见 docs/SELF-HOSTING.md）。
-- is_admin() SELECT admin_users 时命中的是 admin_users_select_all（USING true）
-- 策略，不会递归调用 is_admin()，因此不存在 RLS 无限递归。

DROP POLICY IF EXISTS admin_users_insert_self ON public.admin_users;
DROP POLICY IF EXISTS admin_users_insert_admin ON public.admin_users;

CREATE POLICY admin_users_insert_admin
  ON public.admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- is_admin()：完全以 admin_users 表为准
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = auth.uid()
  );
END;
$$;
