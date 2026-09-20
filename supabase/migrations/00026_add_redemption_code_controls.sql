-- 密钥禁用标记
ALTER TABLE redemption_codes
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 密钥到期时间（生成码时由 Edge Function 写入）
ALTER TABLE redemption_codes
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 禁用的码不能被兑换（补充 RLS check）
CREATE OR REPLACE FUNCTION public.code_is_redeemable(code_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT is_used AND NOT is_disabled
  FROM redemption_codes WHERE id = code_id;
$$;