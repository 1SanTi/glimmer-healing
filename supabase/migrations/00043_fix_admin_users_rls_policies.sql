-- 为 public.admin_users 添加 UPDATE 与 DELETE RLS 策略，支持 upsert (ON CONFLICT DO UPDATE)
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
