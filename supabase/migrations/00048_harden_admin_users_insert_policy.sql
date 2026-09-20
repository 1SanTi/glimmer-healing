-- ============================================================
-- 修复 admin_users 的 INSERT 策略：改为「仅管理员可写入」
-- ============================================================
--
-- ## 背景
--
-- migration 00031 曾将策略设置为：
--
--     CREATE POLICY admin_users_insert_self ON public.admin_users
--       FOR INSERT WITH CHECK (auth.uid() = id);
--
-- 而 is_admin() 的判定条件之一是「当前用户在 admin_users 表中存在」。
-- 两者叠加导致：**任何已登录用户都能把自己插入 admin_users，
-- 从而通过 is_admin() 自行提权为管理员**，进而读取与修改
-- user_subscriptions、redemption_codes 等全部业务数据。
--
-- 该漏洞不需要客户端配合，直接调用 Supabase SDK 即可利用。
--
-- ## 为什么需要本迁移
--
-- 直接修改 00031 只对**全新部署**生效 —— 已部署实例的迁移不会重跑，
-- 旧的宽松策略仍然留在数据库里。本迁移用于修复这类存量实例。
-- 全部语句幂等，可安全重复执行。
--
-- ## 副作用（重要）
--
-- 修复后，客户端「管理员登录弹窗」中把当前用户写入 admin_users 的操作
-- 将只对**已经是管理员**的用户成功。首位管理员必须在数据库中手动播种：
--
--     INSERT INTO public.admin_users (id)
--     SELECT id FROM auth.users WHERE phone = '<你的手机号>';
--
-- 详见 docs/SELF-HOSTING.md#3-设置首位管理员 与 SECURITY.md。

-- 移除宽松策略
DROP POLICY IF EXISTS admin_users_insert_self ON public.admin_users;

-- 重建为仅管理员可写入（先 DROP 以保证幂等）
DROP POLICY IF EXISTS admin_users_insert_admin ON public.admin_users;

CREATE POLICY admin_users_insert_admin
  ON public.admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- ============================================================
-- 审计：请人工核对现有管理员列表
-- ============================================================
--
-- 执行下面的查询，确认 admin_users 中没有你不认识的管理员。
-- 若该漏洞曾被利用，攻击者的 user id 会出现在这里。
--
--   SELECT au.id,
--          u.phone,
--          u.email,
--          au.created_at
--   FROM public.admin_users au
--   JOIN auth.users u ON u.id = au.id
--   ORDER BY au.created_at;
--
-- 如发现可疑条目，手动移除：
--
--   DELETE FROM public.admin_users WHERE id = '<可疑的 user id>';
--
-- 建议同时核对 redemption_codes 中是否存在异常的批量生成记录：
--
--   SELECT batch_label, plan_id, duration_days,
--          count(*) AS code_count,
--          min(created_at) AS first_created,
--          max(created_at) AS last_created
--   FROM public.redemption_codes
--   GROUP BY batch_label, plan_id, duration_days
--   ORDER BY last_created DESC
--   LIMIT 50;
