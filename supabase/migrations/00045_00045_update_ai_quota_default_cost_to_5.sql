CREATE OR REPLACE FUNCTION public.check_and_consume_ai_credits(
  p_cost INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID;
  v_plan_id TEXT := 'free';
  v_daily_limit INTEGER := 5;
  v_today DATE := CURRENT_DATE;
  v_used INTEGER := 0;
  v_sub RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', 0,
      'limit', 5,
      'remaining', 5,
      'plan_id', 'free'
    );
  END IF;

  SELECT plan_id, status, expires_at INTO v_sub
  FROM public.user_subscriptions
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_sub.status = 'active' AND (v_sub.expires_at IS NULL OR v_sub.expires_at > now()) THEN
    v_plan_id := COALESCE(v_sub.plan_id, 'free');
  ELSE
    v_plan_id := 'free';
  END IF;

  IF v_plan_id = 'pro' THEN
    v_daily_limit := 100;
  ELSIF v_plan_id = 'basic' THEN
    v_daily_limit := 50;
  ELSE
    v_daily_limit := 5;
  END IF;

  INSERT INTO public.user_daily_ai_quotas (user_id, quota_date, used_credits, created_at, updated_at)
  VALUES (v_uid, v_today, 0, now(), now())
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  SELECT used_credits INTO v_used
  FROM public.user_daily_ai_quotas
  WHERE user_id = v_uid AND quota_date = v_today
  FOR UPDATE;

  IF (v_used + p_cost) > v_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_daily_limit,
      'remaining', GREATEST(0, v_daily_limit - v_used),
      'plan_id', v_plan_id,
      'message', '今日AI额度积分不足（单次交互消耗5点积分，每日24:00自动重置）'
    );
  END IF;

  UPDATE public.user_daily_ai_quotas
  SET used_credits = used_credits + p_cost,
      updated_at = now()
  WHERE user_id = v_uid AND quota_date = v_today;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used + p_cost,
    'limit', v_daily_limit,
    'remaining', v_daily_limit - (v_used + p_cost),
    'plan_id', v_plan_id
  );
END;
$$;