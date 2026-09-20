-- 更新 is_admin() 函数：管理员手机号改为占位值
--
-- 说明：原始代码在此硬编码了一位管理员手机号。开源版本已将其替换为占位符，
-- 以避免发布个人信息。自部署时请二选一：
--
--   1) 把下面的 '13800000000' 替换为你自己的管理员手机号；或
--   2) 删除本函数中的手机号分支，改用 public.admin_users 表管理管理员（推荐），
--      见 migration 00030_admin_users_table_dynamic_admin.sql。
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT phone = '13800000000'
    FROM auth.users
    WHERE id = auth.uid()
    LIMIT 1
  );
END;
$$;
