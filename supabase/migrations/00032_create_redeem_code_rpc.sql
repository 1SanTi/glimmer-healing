-- 创建兑换码 RPC 函数（原子操作，防并发重复兑换）
CREATE OR REPLACE FUNCTION public.redeem_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row   public.redemption_codes%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_end   timestamptz;
  v_plan_name text;
BEGIN
  -- 空码校验
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', '请输入兑换码');
  END IF;

  -- 未登录校验
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '身份验证失败，请重新登录');
  END IF;

  -- 行锁防并发重复兑换
  SELECT * INTO v_row
  FROM public.redemption_codes
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '兑换码不存在');
  END IF;
  IF v_row.is_disabled THEN
    RETURN jsonb_build_object('ok', false, 'error', '兑换码已停用');
  END IF;
  IF v_row.is_used THEN
    RETURN jsonb_build_object('ok', false, 'error', '兑换码已被使用');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', '兑换码已过期');
  END IF;

  -- 标记为已使用
  UPDATE public.redemption_codes
  SET is_used = true, used_by = v_uid, used_at = now()
  WHERE id = v_row.id;

  -- 更新订阅（upsert）
  v_end := now() + (v_row.duration_days || ' days')::interval;
  INSERT INTO public.user_subscriptions (user_id, plan_id, status, started_at, expires_at)
  VALUES (v_uid, v_row.plan_id, 'active', now(), v_end)
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id    = EXCLUDED.plan_id,
        status     = 'active',
        started_at = EXCLUDED.started_at,
        expires_at = EXCLUDED.expires_at;

  -- 获取套餐名称
  SELECT name INTO v_plan_name
  FROM public.subscription_plans
  WHERE id = v_row.plan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'plan_id', v_row.plan_id,
    'plan_name', v_plan_name,
    'expires_at', v_end
  );
END;
$$;

-- 授权已认证用户调用
GRANT EXECUTE ON FUNCTION public.redeem_code(text) TO authenticated;
