-- 给 service_role 可调用的 RPC 统计 auth.users 总数
CREATE OR REPLACE FUNCTION public.get_total_users_count()
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
AS $$
  SELECT COUNT(*)::bigint FROM auth.users;
$$;
