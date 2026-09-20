-- 1. 创建兑换记录表
CREATE TABLE IF NOT EXISTS public.redemption_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID REFERENCES public.redemption_codes(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_phone TEXT,
  plan_id TEXT NOT NULL,
  duration_days INT NOT NULL DEFAULT 365,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'revoked'
  batch_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.redemption_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "redemption_records_select_own" ON public.redemption_records;
CREATE POLICY "redemption_records_select_own" ON public.redemption_records
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "redemption_records_select_admin" ON public.redemption_records;
CREATE POLICY "redemption_records_select_admin" ON public.redemption_records
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "redemption_records_all_admin" ON public.redemption_records;
CREATE POLICY "redemption_records_all_admin" ON public.redemption_records
  FOR ALL USING (is_admin());

-- 2. 同步回填现有的已使用兑换码记录
INSERT INTO public.redemption_records (code_id, code, user_id, user_phone, plan_id, duration_days, used_at, expires_at, status, batch_label)
SELECT 
  rc.id AS code_id,
  rc.code,
  rc.used_by AS user_id,
  u.phone AS user_phone,
  rc.plan_id,
  rc.duration_days,
  COALESCE(rc.used_at, now()) AS used_at,
  us.expires_at,
  CASE 
    WHEN us.status = 'cancelled' THEN 'revoked'
    WHEN us.expires_at IS NOT NULL AND us.expires_at < now() THEN 'expired'
    ELSE 'active'
  END AS status,
  rc.batch_label
FROM public.redemption_codes rc
JOIN auth.users u ON rc.used_by = u.id
LEFT JOIN public.user_subscriptions us ON rc.used_by = us.user_id
WHERE rc.is_used = true AND rc.used_by IS NOT NULL;

-- 3. 升级 redeem_code RPC 函数，加入写入兑换记录逻辑
CREATE OR REPLACE FUNCTION public.redeem_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row   public.redemption_codes%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_phone text;
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

  -- 获取用户手机号
  SELECT phone INTO v_phone FROM auth.users WHERE id = v_uid;

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
    'plan_name', v_plan_name,
    'expires_at', v_end
  );
END;
$$;

-- 4. 管理员手动延长用户会员有效期
CREATE OR REPLACE FUNCTION public.admin_extend_user_subscription(
  p_user_id uuid,
  p_days int,
  p_plan_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub public.user_subscriptions%ROWTYPE;
  v_target_plan text;
  v_new_end timestamptz;
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', '无管理员操作权限');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '用户ID不能为空');
  END IF;

  IF p_days <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '延长时间必须大于0天');
  END IF;

  SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = p_user_id;

  -- 确定目标套餐
  IF p_plan_id IS NOT NULL AND p_plan_id <> '' AND p_plan_id <> 'free' THEN
    v_target_plan := p_plan_id;
  ELSIF v_sub.plan_id IS NOT NULL AND v_sub.plan_id <> 'free' THEN
    v_target_plan := v_sub.plan_id;
  ELSE
    v_target_plan := 'basic';
  END IF;

  -- 计算新到期时间
  IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at > now() AND v_sub.status = 'active' THEN
    v_new_end := v_sub.expires_at + (p_days || ' days')::interval;
  ELSE
    v_new_end := now() + (p_days || ' days')::interval;
  END IF;

  INSERT INTO public.user_subscriptions (user_id, plan_id, status, started_at, expires_at)
  VALUES (p_user_id, v_target_plan, 'active', now(), v_new_end)
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id    = v_target_plan,
        status     = 'active',
        expires_at = v_new_end;

  -- 更新对应兑换记录状态为 active
  UPDATE public.redemption_records
  SET status = 'active', expires_at = v_new_end
  WHERE user_id = p_user_id AND status <> 'active';

  RETURN jsonb_build_object(
    'ok', true,
    'plan_id', v_target_plan,
    'expires_at', v_new_end,
    'message', '成功延长会员有效期至 ' || to_char(v_new_end, 'YYYY-MM-DD HH24:MI')
  );
END;
$$;

-- 5. 管理员手动取消会员订阅（降级体验版）
CREATE OR REPLACE FUNCTION public.admin_cancel_user_subscription(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', '无管理员操作权限');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '用户ID不能为空');
  END IF;

  INSERT INTO public.user_subscriptions (user_id, plan_id, status, started_at, expires_at)
  VALUES (p_user_id, 'free', 'cancelled', now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id    = 'free',
        status     = 'cancelled',
        expires_at = now();

  UPDATE public.redemption_records
  SET status = 'revoked'
  WHERE user_id = p_user_id AND status = 'active';

  RETURN jsonb_build_object('ok', true, 'message', '已成功取消该用户的会员订阅并降级为体验版');
END;
$$;

-- 6. 管理员获取所有用户及其订阅详情列表
CREATE OR REPLACE FUNCTION public.admin_get_users_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT is_admin() THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'phone', COALESCE(u.phone, ''),
      'created_at', u.created_at,
      'plan_id', COALESCE(s.plan_id, 'free'),
      'status', CASE 
        WHEN s.plan_id IS NULL OR s.plan_id = 'free' THEN 'free'
        WHEN s.status = 'cancelled' THEN 'cancelled'
        WHEN s.expires_at IS NOT NULL AND s.expires_at < now() THEN 'expired'
        ELSE COALESCE(s.status, 'free')
      END,
      'expires_at', s.expires_at,
      'started_at', s.started_at,
      'redeemed_code', s.redeemed_code
    ) ORDER BY u.created_at DESC
  ) INTO v_res
  FROM auth.users u
  LEFT JOIN public.user_subscriptions s ON u.id = s.user_id;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- 7. 管理员获取兑换记录列表
CREATE OR REPLACE FUNCTION public.admin_get_redemption_records()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT is_admin() THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'code_id', r.code_id,
      'code', r.code,
      'user_id', r.user_id,
      'user_phone', COALESCE(r.user_phone, u.phone, '未绑定手机'),
      'plan_id', r.plan_id,
      'duration_days', r.duration_days,
      'used_at', r.used_at,
      'expires_at', r.expires_at,
      'status', r.status,
      'batch_label', r.batch_label
    ) ORDER BY r.used_at DESC
  ) INTO v_res
  FROM public.redemption_records r
  LEFT JOIN auth.users u ON r.user_id = u.id;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- 授权认证用户执行 RPC
GRANT EXECUTE ON FUNCTION public.redeem_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_user_subscription(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_user_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_users_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_redemption_records() TO authenticated;
