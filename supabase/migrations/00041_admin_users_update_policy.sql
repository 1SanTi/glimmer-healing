-- 为 admin_users 表添加 UPDATE 和 DELETE 策略，允许用户自身更新/删除
DROP POLICY IF EXISTS admin_users_update_self ON public.admin_users;
CREATE POLICY admin_users_update_self
  ON public.admin_users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS admin_users_delete_self ON public.admin_users;
CREATE POLICY admin_users_delete_self
  ON public.admin_users
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);