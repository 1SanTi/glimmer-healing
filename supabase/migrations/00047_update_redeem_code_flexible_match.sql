CREATE OR REPLACE FUNCTION public.redeem_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row   public.redemption_codes%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_phone text;
  v_end   timestamptz;
  v_plan_name text;
  v_clean_code text;
BEGIN
  -- 空码校验
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', '请输入兑换码');
  END IF;

  -- 未登录校验
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '身份验证失败，请重新登录');
  END IF;

  -- 统一清理连字符与空白
  v_clean_code := replace(replace(replace(upper(trim(p_code)), ' ', ''), '-', ''), '—', '');

  -- 获取用户手机号
  SELECT phone INTO v_phone FROM auth.users WHERE id = v_uid;

  -- 行锁防并发重复兑换：同时兼容带连字符与无连字符匹配
  SELECT * INTO v_row
  FROM public.redemption_codes
  WHERE replace(code, '-', '') = v_clean_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '兑换码不存在，请核对后重试');
  END IF;
  IF v_row.is_disabled THEN
    RETURN jsonb_build_object('ok', false, 'error', '该兑换码已被停用');
  END IF;
  IF v_row.is_used THEN
    RETURN jsonb_build_object('ok', false, 'error', '该兑换码已被使用');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', '该兑换码已过期');
  END IF;

  -- 标记为已使用
  UPDATE public.redemption_codes
  SET is_used = true, used_by = v_uid, used_at = now()
  WHERE id = v_row.id;

  -- 计算并更新订阅（upsert）
  v_end := now() + (v_row.duration_days || ' days')::interval;
  INSERT INTO public.user_subscriptions (user_id, plan_id, status, started_at, expires_at, redeemed_code)
  VALUES (v_uid, v_row.plan_id, 'active', now(), v_end, v_row.code)
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id       = EXCLUDED.plan_id,
        status        = 'active',
        started_at    = EXCLUDED.started_at,
        expires_at    = EXCLUDED.expires_at,
        redeemed_code = EXCLUDED.redeemed_code;

  -- 获取套餐名称
  SELECT name INTO v_plan_name
  FROM public.subscription_plans
  WHERE id = v_row.plan_id;

  -- 插入兑换流水记录
  INSERT INTO public.redemption_records (
    code_id, code, user_id, user_phone, plan_id, duration_days, used_at, expires_at, status, batch_label
  ) VALUES (
    v_row.id, v_row.code, v_uid, v_phone, v_row.plan_id, v_row.duration_days, now(), v_end, 'active', v_row.batch_label
  );

  RETURN jsonb_build_object(
    'ok', true,
    'plan_id', v_row.plan_id,
    'plan_name', COALESCE(v_plan_name, v_row.plan_id),
    'duration_days', v_row.duration_days,
    'expires_at', v_end
  );
END;
$$;