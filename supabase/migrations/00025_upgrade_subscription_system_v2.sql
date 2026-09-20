
-- ── 1. 升级 subscription_plans 表（补列）────────────────────────
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS level         int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_monthly int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_yearly  int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS features      jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS highlight     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color         text    NOT NULL DEFAULT '#6B7280';

-- 更新三级套餐数据
INSERT INTO subscription_plans (id, name, description, level, price_monthly, price_yearly, features, highlight, color, price, period_days)
VALUES
  ('free',  '体验版',      '免费使用基础心愈功能',       0, 0,    0,
   '["AI对话（每日3次）","心理自测","呼吸冥想","匿名树洞浏览","基础情绪日记"]'::jsonb,
   false, '#6B7280', 0, 0),
  ('basic', '心愈版',      '深度心愈，专属AI陪伴',       1, 2800, 28000,
   '["AI对话（无限次）","全部心理测评","OH卡/心灵绘画","情绪分析报告","沙盘疗愈","AI梦境解析","音乐疗愈全库","爱情实验室"]'::jsonb,
   true,  '#7C6FCD', 28, 365),
  ('pro',   'AI工作台版',  '专业教师/咨询师首选',        2, 6800, 68000,
   '["含心愈版全部功能","AI开发工作台（无限制）","心灵画布（AI解读+存档）","AI咨询系统","AI专家多模态分析","批量学生测评管理","专属AI微光助手","优先客服支持"]'::jsonb,
   false, '#E8A365', 68, 365)
ON CONFLICT (id) DO UPDATE
  SET name=EXCLUDED.name, description=EXCLUDED.description,
      level=EXCLUDED.level, features=EXCLUDED.features,
      highlight=EXCLUDED.highlight, color=EXCLUDED.color,
      price_monthly=EXCLUDED.price_monthly, price_yearly=EXCLUDED.price_yearly;

-- ── 2. 用户订阅表 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id       text NOT NULL REFERENCES subscription_plans(id),
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','expired','cancelled')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  redeemed_code text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usub_select_own"  ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "usub_insert_own"  ON user_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "usub_update_own"  ON user_subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- ── 3. 兑换码表 ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS redemption_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  plan_id       text NOT NULL REFERENCES subscription_plans(id),
  duration_days int  NOT NULL DEFAULT 365,
  is_used       boolean NOT NULL DEFAULT false,
  used_by       uuid REFERENCES auth.users(id),
  used_at       timestamptz,
  batch_label   text,
  created_by    uuid NOT NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE redemption_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "codes_select_unused" ON redemption_codes FOR SELECT
  USING (NOT is_used OR used_by = auth.uid());
CREATE POLICY "codes_update_self"   ON redemption_codes FOR UPDATE USING (NOT is_used);

-- ── 4. 管理员辅助函数 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 管理员手机号占位符。自部署时请替换为你自己的管理员手机号，
  -- 或（推荐）改用 public.admin_users 表管理管理员（见 migration 00030）。
  RETURN (SELECT phone = '13800000000' FROM auth.users WHERE id = auth.uid() LIMIT 1);
END;
$$;

CREATE POLICY "codes_select_admin" ON redemption_codes FOR SELECT   USING (is_admin());
CREATE POLICY "codes_insert_admin" ON redemption_codes FOR INSERT   WITH CHECK (is_admin());
CREATE POLICY "codes_update_admin" ON redemption_codes FOR UPDATE   USING (is_admin());
CREATE POLICY "codes_delete_admin" ON redemption_codes FOR DELETE   USING (is_admin());
CREATE POLICY "usub_select_admin"  ON user_subscriptions FOR SELECT USING (is_admin());
CREATE POLICY "usub_update_admin"  ON user_subscriptions FOR UPDATE USING (is_admin());
