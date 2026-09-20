-- ============================================================
-- SECTION: SCHEMA
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


--
-- Name: EXTENSION "pg_graphql"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_graphql" IS 'pg_graphql: GraphQL support';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'order_status'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'paid',
    'cancelled',
    'refunded'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_cancel_user_subscription("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."admin_cancel_user_subscription"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


--
-- Name: admin_extend_user_subscription("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."admin_extend_user_subscription"("p_user_id" "uuid", "p_days" integer, "p_plan_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


--
-- Name: admin_get_redemption_records(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."admin_get_redemption_records"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


--
-- Name: admin_get_users_subscriptions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."admin_get_users_subscriptions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


--
-- Name: check_and_consume_ai_credits(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."check_and_consume_ai_credits"("p_cost" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


--
-- Name: code_is_redeemable("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."code_is_redeemable"("code_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT NOT is_used AND NOT is_disabled
  FROM redemption_codes WHERE id = code_id;
$$;


--
-- Name: get_admin_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_admin_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_dau integer;
  v_wau integer;
  v_mau integer;
  v_pv integer;
  v_uv integer;
  v_free integer;
  v_basic integer;
  v_pro integer;
BEGIN
  SELECT count(*) INTO v_dau FROM auth.users WHERE last_sign_in_at >= date_trunc('day', now());
  SELECT count(*) INTO v_wau FROM auth.users WHERE last_sign_in_at >= now() - interval '7 days';
  SELECT count(*) INTO v_mau FROM auth.users WHERE last_sign_in_at >= now() - interval '30 days';
  SELECT count(*) INTO v_pv FROM public.page_visits;
  SELECT count(DISTINCT visitor_id) INTO v_uv FROM public.page_visits;
  SELECT count(*) INTO v_free FROM public.user_subscriptions WHERE plan_id = 'free' AND status = 'active';
  SELECT count(*) INTO v_basic FROM public.user_subscriptions WHERE plan_id = 'basic' AND status = 'active';
  SELECT count(*) INTO v_pro FROM public.user_subscriptions WHERE plan_id = 'pro' AND status = 'active';
  RETURN jsonb_build_object(
    'dau', v_dau, 'wau', v_wau, 'mau', v_mau,
    'pv', v_pv, 'uv', v_uv,
    'subscriptions', jsonb_build_object('free', v_free, 'basic', v_basic, 'pro', v_pro)
  );
END;
$$;


--
-- Name: get_my_ai_quota(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_my_ai_quota"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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

  SELECT used_credits INTO v_used
  FROM public.user_daily_ai_quotas
  WHERE user_id = v_uid AND quota_date = v_today;

  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  RETURN jsonb_build_object(
    'used', v_used,
    'limit', v_daily_limit,
    'remaining', GREATEST(0, v_daily_limit - v_used),
    'plan_id', v_plan_id
  );
END;
$$;


--
-- Name: get_total_users_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_total_users_count"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::bigint FROM auth.users;
$$;


--
-- Name: get_user_role("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_user_role"("uid" "uuid") RETURNS "public"."user_role"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;


--
-- Name: grant_trial_subscription("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."grant_trial_subscription"("target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  sub_record RECORD;
BEGIN
  SELECT * INTO sub_record FROM public.user_subscriptions WHERE user_id = target_user_id;
  
  IF FOUND THEN
    IF sub_record.status = 'active' AND (sub_record.expires_at IS NULL OR sub_record.expires_at > now()) THEN
      RETURN jsonb_build_object('success', true, 'message', '已有有效订阅', 'plan_id', sub_record.plan_id);
    END IF;
    UPDATE public.user_subscriptions
    SET plan_id = 'pro', status = 'active', started_at = now(), expires_at = now() + interval '31 days'
    WHERE user_id = target_user_id;
  ELSE
    INSERT INTO public.user_subscriptions (user_id, plan_id, status, started_at, expires_at)
    VALUES (target_user_id, 'pro', 'active', now(), now() + interval '31 days');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', '已成功下发31天最高级别会员体验', 'plan_id', 'pro');
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role
  );
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_id, status, started_at, expires_at)
  VALUES (NEW.id, 'free', 'active', NOW(), NULL)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: init_user_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."init_user_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.subscriptions (user_id, plan_id, expires_at)
  values (new.id, 'free', null)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 管理员身份完全由 public.admin_users 表定义（见 migration 00030）。
  -- 自部署时请手动授予管理员：
  --   INSERT INTO public.admin_users (id)
  --   SELECT id FROM auth.users WHERE phone = '<你的手机号>';
  --
  -- ⚠️ 切勿让普通用户能写入 admin_users 表，否则任何注册用户都能自行提权。
  --    请确认 INSERT 策略为 WITH CHECK (is_admin())，而非 WITH CHECK (auth.uid() = id)。
  --    详见仓库根目录 SECURITY.md。
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = auth.uid()
  );
END;
$$;


--
-- Name: redeem_code("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."redeem_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: update_ai_workbench_jobs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_ai_workbench_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_note_folders_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_note_folders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_notes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ai_workbench_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ai_workbench_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "model" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "result" "text",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text" DEFAULT 'emotion'::"text" NOT NULL,
    "cover_url" "text",
    "read_count" integer DEFAULT 0 NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "articles_category_check" CHECK (("category" = ANY (ARRAY['emotion'::"text", 'stress'::"text", 'self'::"text", 'frontier'::"text", 'satir'::"text", 'positive'::"text"])))
);


--
-- Name: canvas_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."canvas_nodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pos_x" double precision DEFAULT 0 NOT NULL,
    "pos_y" double precision DEFAULT 0 NOT NULL,
    "prompt" "text",
    "aspect" "text" DEFAULT '1:1'::"text" NOT NULL,
    "scene" "text" DEFAULT 'story'::"text" NOT NULL,
    "style" "text" DEFAULT 'healing'::"text" NOT NULL,
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "image_url" "text",
    "error_msg" "text",
    "work_id" "uuid",
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ref_image_url" "text",
    "count" integer DEFAULT 1 NOT NULL,
    "node_type" "text" DEFAULT 'edit'::"text" NOT NULL,
    "gen_model" "text" DEFAULT 'gpt'::"text" NOT NULL,
    "image_urls" "text"[]
);


--
-- Name: canvas_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."canvas_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT '未命名项目'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expert" "text" NOT NULL,
    "title" "text",
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "summary" "text",
    "homework" "text",
    "is_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_sessions_expert_check" CHECK (("expert" = ANY (ARRAY['rogers'::"text", 'beck'::"text", 'perls'::"text", 'wolpe'::"text", 'freud'::"text"])))
);


--
-- Name: dream_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."dream_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" DEFAULT '未命名梦境'::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "ai_analysis" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: happiness_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."happiness_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_desc" "text" NOT NULL,
    "score" integer NOT NULL,
    "log_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "happiness_logs_event_type_check" CHECK (("event_type" = ANY (ARRAY['positive'::"text", 'negative'::"text"]))),
    CONSTRAINT "happiness_logs_score_check" CHECK ((("score" >= '-10'::integer) AND ("score" <= 10)))
);


--
-- Name: heron_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."heron_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heron_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."heron_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT 'preference'::"text" NOT NULL,
    "checked" boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN "heron_memories"."category"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."heron_memories"."category" IS 'preference=用户偏好 | task=重要事项 | summary=历史摘要';


--
-- Name: COLUMN "heron_memories"."checked"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."heron_memories"."checked" IS '仅 task 类型有效，表示是否已完成';


--
-- Name: heron_scheduled_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."heron_scheduled_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cron" "text" NOT NULL,
    "skill" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_run_at" timestamp with time zone,
    "next_run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heron_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."heron_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT '新对话'::"text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: hope_leaves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."hope_leaves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "will_power" "text" NOT NULL,
    "way_power" "text",
    "leaf_color" "text" DEFAULT '#7FBA5C'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: lesson_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."lesson_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "folder_id" "uuid",
    "name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "storage_path" "text",
    "url" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: lesson_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."lesson_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: mood_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."mood_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "mood" "text" NOT NULL,
    "note" "text",
    "checked_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: note_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."note_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size" bigint DEFAULT 0 NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: note_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."note_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "color" "text" DEFAULT '#F9C784'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid"
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "folder_id" "uuid",
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "blocks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "plain_text" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_draft" boolean DEFAULT false NOT NULL
);


--
-- Name: oh_card_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."oh_card_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "layout_screenshot_url" "text",
    "ai_interpretation" "text",
    "cards_used" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: oh_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."oh_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "image_url" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "card_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "oh_cards_type_check" CHECK (("type" = ANY (ARRAY['back'::"text", 'image'::"text", 'text'::"text", 'overcome'::"text", 'hero'::"text", 'child_situation'::"text", 'child_portrait'::"text"])))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_no" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status" NOT NULL,
    "total_amount" numeric(10,2) NOT NULL,
    "wechat_pay_url" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: page_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."page_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "user_id" "uuid",
    "path" "text" DEFAULT '/'::"text" NOT NULL,
    "visited_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: paint_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."paint_videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "work_id" "uuid",
    "image_url" "text",
    "prompt" "text" DEFAULT ''::"text" NOT NULL,
    "video_url" "text",
    "task_id" "text",
    "status" "text" DEFAULT 'generating'::"text" NOT NULL,
    "error_msg" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "paint_videos_status_check" CHECK (("status" = ANY (ARRAY['generating'::"text", 'done'::"text", 'error'::"text"])))
);


--
-- Name: painting_house_works; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."painting_house_works" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "mode" "text" NOT NULL,
    "style" "text" DEFAULT 'healing'::"text" NOT NULL,
    "prompt" "text" NOT NULL,
    "image_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_msg" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "painting_house_works_mode_check" CHECK (("mode" = ANY (ARRAY['story'::"text", 'theory'::"text", 'game'::"text", 'poster'::"text"]))),
    CONSTRAINT "painting_house_works_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'generating'::"text", 'done'::"text", 'error'::"text"])))
);


--
-- Name: payment_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."payment_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "out_trade_no" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "plan_name" "text" NOT NULL,
    "billing_cycle" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "subject" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "trade_no" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone
);


--
-- Name: positive_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."positive_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "task_type" "text" NOT NULL,
    "task_title" "text" NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "phone" "text",
    "username" "text",
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: redemption_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."redemption_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "plan_id" "text" NOT NULL,
    "duration_days" integer DEFAULT 365 NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "batch_label" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_disabled" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone
);


--
-- Name: redemption_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."redemption_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code_id" "uuid",
    "code" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_phone" "text",
    "plan_id" "text" NOT NULL,
    "duration_days" integer DEFAULT 365 NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "batch_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: rel_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."rel_edges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "direction" "text" DEFAULT 'both'::"text" NOT NULL,
    "quality" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "trust_score" integer DEFAULT 0 NOT NULL,
    "line_style" "text" DEFAULT 'solid'::"text" NOT NULL,
    CONSTRAINT "rel_edges_direction_check" CHECK (("direction" = ANY (ARRAY['source_to_target'::"text", 'target_to_source'::"text", 'both'::"text"]))),
    CONSTRAINT "rel_edges_line_style_check" CHECK (("line_style" = ANY (ARRAY['solid'::"text", 'curve'::"text", 'dashed'::"text"]))),
    CONSTRAINT "rel_edges_quality_check" CHECK (("quality" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'draining'::"text"])))
);


--
-- Name: relationship_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."relationship_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "event_date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text",
    "mood" "text" DEFAULT 'happy'::"text",
    "mood_score" integer DEFAULT 5,
    "is_anniversary" boolean DEFAULT false,
    "anniversary_label" "text" DEFAULT ''::"text",
    "node_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "sticker" "text" DEFAULT ''::"text",
    "image_url" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "relationship_events_mood_score_check" CHECK ((("mood_score" >= 1) AND ("mood_score" <= 10)))
);


--
-- Name: relationship_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."relationship_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "node_id" "uuid",
    "label" "text" NOT NULL,
    "address" "text" NOT NULL,
    "latitude" real,
    "longitude" real,
    "psychological_distance" integer DEFAULT 5,
    "ai_advice" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "geocoded_lat" double precision,
    "geocoded_lng" double precision,
    CONSTRAINT "relationship_locations_psychological_distance_check" CHECK ((("psychological_distance" >= 1) AND ("psychological_distance" <= 10)))
);


--
-- Name: relationship_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."relationship_nodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" DEFAULT '朋友'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "quality" "text" DEFAULT 'positive'::"text" NOT NULL,
    "trust_score" integer DEFAULT 5,
    "comfort_score" integer DEFAULT 5,
    "distance" real DEFAULT 150,
    "angle" real DEFAULT 0,
    "note" "text" DEFAULT ''::"text",
    "avatar_emoji" "text" DEFAULT '😊'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_center" boolean DEFAULT false NOT NULL,
    "node_color" "text" DEFAULT '#8B5E3C'::"text" NOT NULL,
    "node_image_url" "text",
    CONSTRAINT "relationship_nodes_comfort_score_check" CHECK ((("comfort_score" >= 1) AND ("comfort_score" <= 10))),
    CONSTRAINT "relationship_nodes_trust_score_check" CHECK ((("trust_score" >= 1) AND ("trust_score" <= 10)))
);


--
-- Name: shared_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."shared_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploader_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_type" "text" NOT NULL,
    "storage_path" "text",
    "url" "text",
    "size_bytes" bigint,
    "download_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: sleep_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."sleep_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "bed_time" "text" DEFAULT '22:30'::"text" NOT NULL,
    "wake_time" "text" DEFAULT '07:00'::"text" NOT NULL,
    "notification_enabled" boolean DEFAULT true NOT NULL,
    "sleep_audio_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "period_days" integer NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "level" integer DEFAULT 0 NOT NULL,
    "price_monthly" integer DEFAULT 0 NOT NULL,
    "price_yearly" integer DEFAULT 0 NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "highlight" boolean DEFAULT false NOT NULL,
    "color" "text" DEFAULT '#6B7280'::"text" NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" DEFAULT 'free'::"text" NOT NULL,
    "order_id" "uuid",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."test_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "test_type" "text" NOT NULL,
    "result_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_results_test_type_check" CHECK (("test_type" = ANY (ARRAY['scl90'::"text", 'mht'::"text", 'mbti'::"text", 'via'::"text", 'stress'::"text", 'htp'::"text", 'confidence'::"text", 'mental_age'::"text"])))
);


--
-- Name: tree_hole_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."tree_hole_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tree_hole_comments_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 500)))
);


--
-- Name: tree_hole_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."tree_hole_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "is_crisis" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tree_hole_posts_category_check" CHECK (("category" = ANY (ARRAY['academic'::"text", 'interpersonal'::"text", 'workplace'::"text", 'emotion'::"text", 'general'::"text"])))
);


--
-- Name: tree_hole_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."tree_hole_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tree_hole_reactions_reaction_type_check" CHECK (("reaction_type" = ANY (ARRAY['hug'::"text", 'empathy'::"text", 'brave'::"text"])))
);


--
-- Name: user_daily_ai_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_daily_ai_quotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "quota_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "used_credits" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "redeemed_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'cancelled'::"text", 'inactive'::"text"])))
);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_users_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_workbench_jobs ai_workbench_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ai_workbench_jobs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'ai_workbench_jobs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ai_workbench_jobs"
    ADD CONSTRAINT "ai_workbench_jobs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'articles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_nodes canvas_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'canvas_nodes_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."canvas_nodes"
    ADD CONSTRAINT "canvas_nodes_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_projects canvas_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'canvas_projects_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_projects'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."canvas_projects"
    ADD CONSTRAINT "canvas_projects_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'chat_sessions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'chat_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dream_records dream_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dream_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'dream_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dream_records"
    ADD CONSTRAINT "dream_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: happiness_logs happiness_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'happiness_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'happiness_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."happiness_logs"
    ADD CONSTRAINT "happiness_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_audit_logs heron_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_audit_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_audit_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_audit_logs"
    ADD CONSTRAINT "heron_audit_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_memories heron_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_memories_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_memories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_memories"
    ADD CONSTRAINT "heron_memories_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_scheduled_tasks heron_scheduled_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_scheduled_tasks_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_scheduled_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_scheduled_tasks"
    ADD CONSTRAINT "heron_scheduled_tasks_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_sessions heron_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_sessions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_sessions"
    ADD CONSTRAINT "heron_sessions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: hope_leaves hope_leaves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'hope_leaves_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'hope_leaves'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."hope_leaves"
    ADD CONSTRAINT "hope_leaves_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_files lesson_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'lesson_files_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_files'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."lesson_files"
    ADD CONSTRAINT "lesson_files_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_folders lesson_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'lesson_folders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."lesson_folders"
    ADD CONSTRAINT "lesson_folders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mood_checkins mood_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mood_checkins_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'mood_checkins'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mood_checkins"
    ADD CONSTRAINT "mood_checkins_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_attachments note_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'note_attachments_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'note_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."note_attachments"
    ADD CONSTRAINT "note_attachments_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_folders note_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'note_folders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'note_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."note_folders"
    ADD CONSTRAINT "note_folders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notes_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'notes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_card_records oh_card_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'oh_card_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'oh_card_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."oh_card_records"
    ADD CONSTRAINT "oh_card_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_cards oh_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'oh_cards_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'oh_cards'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."oh_cards"
    ADD CONSTRAINT "oh_cards_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_order_no_key'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_no_key" UNIQUE ("order_no");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_visits page_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'page_visits_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'page_visits'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."page_visits"
    ADD CONSTRAINT "page_visits_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: paint_videos paint_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'paint_videos_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'paint_videos'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."paint_videos"
    ADD CONSTRAINT "paint_videos_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: painting_house_works painting_house_works_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'painting_house_works_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'painting_house_works'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."painting_house_works"
    ADD CONSTRAINT "painting_house_works_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_orders payment_orders_out_trade_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'payment_orders_out_trade_no_key'
      AND n.nspname = 'public'
      AND c.relname = 'payment_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_out_trade_no_key" UNIQUE ("out_trade_no");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_orders payment_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'payment_orders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'payment_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positive_tasks positive_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'positive_tasks_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'positive_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."positive_tasks"
    ADD CONSTRAINT "positive_tasks_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes redemption_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'redemption_codes_code_key'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."redemption_codes"
    ADD CONSTRAINT "redemption_codes_code_key" UNIQUE ("code");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes redemption_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'redemption_codes_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."redemption_codes"
    ADD CONSTRAINT "redemption_codes_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_records redemption_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'redemption_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."redemption_records"
    ADD CONSTRAINT "redemption_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rel_edges rel_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rel_edges_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'rel_edges'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rel_edges"
    ADD CONSTRAINT "rel_edges_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_events relationship_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'relationship_events_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_events'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."relationship_events"
    ADD CONSTRAINT "relationship_events_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_locations relationship_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'relationship_locations_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_locations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."relationship_locations"
    ADD CONSTRAINT "relationship_locations_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_nodes relationship_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'relationship_nodes_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."relationship_nodes"
    ADD CONSTRAINT "relationship_nodes_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shared_resources shared_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'shared_resources_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'shared_resources'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."shared_resources"
    ADD CONSTRAINT "shared_resources_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sleep_config sleep_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'sleep_config_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'sleep_config'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."sleep_config"
    ADD CONSTRAINT "sleep_config_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sleep_config sleep_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'sleep_config_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'sleep_config'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."sleep_config"
    ADD CONSTRAINT "sleep_config_user_id_key" UNIQUE ("user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'subscription_plans_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'subscription_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'subscriptions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'subscriptions_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: test_results test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'test_results_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'test_results'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_comments tree_hole_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_comments_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_comments"
    ADD CONSTRAINT "tree_hole_comments_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_posts tree_hole_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_posts_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_posts"
    ADD CONSTRAINT "tree_hole_posts_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_reactions tree_hole_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_reactions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_reactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_reactions"
    ADD CONSTRAINT "tree_hole_reactions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_reactions tree_hole_reactions_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_reactions_post_id_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_reactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_reactions"
    ADD CONSTRAINT "tree_hole_reactions_post_id_user_id_key" UNIQUE ("post_id", "user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_daily_ai_quotas user_daily_ai_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_daily_ai_quotas_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_daily_ai_quotas'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_daily_ai_quotas"
    ADD CONSTRAINT "user_daily_ai_quotas_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_daily_ai_quotas user_daily_ai_quotas_user_id_quota_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_daily_ai_quotas_user_id_quota_date_key'
      AND n.nspname = 'public'
      AND c.relname = 'user_daily_ai_quotas'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_daily_ai_quotas"
    ADD CONSTRAINT "user_daily_ai_quotas_user_id_quota_date_key" UNIQUE ("user_id", "quota_date");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_subscriptions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions user_subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_subscriptions_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_key" UNIQUE ("user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: idx_heron_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_heron_audit_logs_user" ON "public"."heron_audit_logs" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_heron_memories_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_heron_memories_user" ON "public"."heron_memories" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_heron_scheduled_tasks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_heron_scheduled_tasks_user" ON "public"."heron_scheduled_tasks" USING "btree" ("user_id", "next_run_at");


--
-- Name: idx_heron_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_heron_sessions_user" ON "public"."heron_sessions" USING "btree" ("user_id", "updated_at" DESC);


--
-- Name: idx_payment_orders_out_trade_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_payment_orders_out_trade_no" ON "public"."payment_orders" USING "btree" ("out_trade_no");


--
-- Name: idx_payment_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_payment_orders_user" ON "public"."payment_orders" USING "btree" ("user_id");


--
-- Name: idx_tree_hole_reactions_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_tree_hole_reactions_post_id" ON "public"."tree_hole_reactions" USING "btree" ("post_id");


--
-- Name: mood_checkins_user_date_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "mood_checkins_user_date_unique" ON "public"."mood_checkins" USING "btree" ("user_id", "checked_at");


--
-- Name: notes_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "notes_folder_idx" ON "public"."notes" USING "btree" ("folder_id");


--
-- Name: notes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "notes_user_idx" ON "public"."notes" USING "btree" ("user_id", "updated_at" DESC);


--
-- Name: oh_cards_storage_path_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "oh_cards_storage_path_key" ON "public"."oh_cards" USING "btree" ("storage_path");


--
-- Name: oh_cards_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "oh_cards_type_idx" ON "public"."oh_cards" USING "btree" ("type");


--
-- Name: tree_hole_comments_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "tree_hole_comments_post_id_idx" ON "public"."tree_hole_comments" USING "btree" ("post_id");


--
-- Name: ai_workbench_jobs ai_workbench_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "ai_workbench_jobs_updated_at" BEFORE UPDATE ON "public"."ai_workbench_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_workbench_jobs_updated_at"();


--
-- Name: notes notes_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "notes_updated_at_trigger" BEFORE UPDATE ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_notes_updated_at"();


--
-- Name: painting_house_works painting_house_works_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "painting_house_works_updated_at" BEFORE UPDATE ON "public"."painting_house_works" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: relationship_locations relationship_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "relationship_locations_updated_at" BEFORE UPDATE ON "public"."relationship_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: relationship_nodes relationship_nodes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "relationship_nodes_updated_at" BEFORE UPDATE ON "public"."relationship_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: canvas_nodes set_canvas_nodes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_canvas_nodes_updated_at" BEFORE UPDATE ON "public"."canvas_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: canvas_projects set_canvas_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_canvas_projects_updated_at" BEFORE UPDATE ON "public"."canvas_projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: note_folders trg_note_folders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_note_folders_updated_at" BEFORE UPDATE ON "public"."note_folders" FOR EACH ROW EXECUTE FUNCTION "public"."update_note_folders_updated_at"();


--
-- Name: admin_users admin_users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_users_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_workbench_jobs ai_workbench_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ai_workbench_jobs_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'ai_workbench_jobs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ai_workbench_jobs"
    ADD CONSTRAINT "ai_workbench_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_nodes canvas_nodes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'canvas_nodes_parent_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."canvas_nodes"
    ADD CONSTRAINT "canvas_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_nodes canvas_nodes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'canvas_nodes_project_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."canvas_nodes"
    ADD CONSTRAINT "canvas_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."canvas_projects"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_nodes canvas_nodes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'canvas_nodes_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."canvas_nodes"
    ADD CONSTRAINT "canvas_nodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_projects canvas_projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'canvas_projects_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_projects'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."canvas_projects"
    ADD CONSTRAINT "canvas_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: chat_sessions chat_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'chat_sessions_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'chat_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dream_records dream_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dream_records_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'dream_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dream_records"
    ADD CONSTRAINT "dream_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: happiness_logs happiness_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'happiness_logs_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'happiness_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."happiness_logs"
    ADD CONSTRAINT "happiness_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_audit_logs heron_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_audit_logs_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_audit_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_audit_logs"
    ADD CONSTRAINT "heron_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_memories heron_memories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_memories_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_memories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_memories"
    ADD CONSTRAINT "heron_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_scheduled_tasks heron_scheduled_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_scheduled_tasks_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_scheduled_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_scheduled_tasks"
    ADD CONSTRAINT "heron_scheduled_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_sessions heron_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'heron_sessions_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'heron_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."heron_sessions"
    ADD CONSTRAINT "heron_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: hope_leaves hope_leaves_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'hope_leaves_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'hope_leaves'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."hope_leaves"
    ADD CONSTRAINT "hope_leaves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_files lesson_files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'lesson_files_folder_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_files'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."lesson_files"
    ADD CONSTRAINT "lesson_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."lesson_folders"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_files lesson_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'lesson_files_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_files'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."lesson_files"
    ADD CONSTRAINT "lesson_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_folders lesson_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'lesson_folders_parent_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."lesson_folders"
    ADD CONSTRAINT "lesson_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."lesson_folders"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_folders lesson_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'lesson_folders_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."lesson_folders"
    ADD CONSTRAINT "lesson_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mood_checkins mood_checkins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mood_checkins_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mood_checkins'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mood_checkins"
    ADD CONSTRAINT "mood_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_attachments note_attachments_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'note_attachments_note_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'note_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."note_attachments"
    ADD CONSTRAINT "note_attachments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_attachments note_attachments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'note_attachments_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'note_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."note_attachments"
    ADD CONSTRAINT "note_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_folders note_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'note_folders_parent_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'note_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."note_folders"
    ADD CONSTRAINT "note_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."note_folders"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_folders note_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'note_folders_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'note_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."note_folders"
    ADD CONSTRAINT "note_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notes notes_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notes_folder_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'notes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."note_folders"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notes notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notes_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'notes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_plan_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_visits page_visits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'page_visits_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'page_visits'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."page_visits"
    ADD CONSTRAINT "page_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: paint_videos paint_videos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'paint_videos_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'paint_videos'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."paint_videos"
    ADD CONSTRAINT "paint_videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: paint_videos paint_videos_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'paint_videos_work_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'paint_videos'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."paint_videos"
    ADD CONSTRAINT "paint_videos_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "public"."painting_house_works"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: painting_house_works painting_house_works_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'painting_house_works_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'painting_house_works'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."painting_house_works"
    ADD CONSTRAINT "painting_house_works_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positive_tasks positive_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'positive_tasks_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'positive_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."positive_tasks"
    ADD CONSTRAINT "positive_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes redemption_codes_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'redemption_codes_plan_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."redemption_codes"
    ADD CONSTRAINT "redemption_codes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes redemption_codes_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'redemption_codes_used_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."redemption_codes"
    ADD CONSTRAINT "redemption_codes_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_records redemption_records_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'redemption_records_code_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."redemption_records"
    ADD CONSTRAINT "redemption_records_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "public"."redemption_codes"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_records redemption_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'redemption_records_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."redemption_records"
    ADD CONSTRAINT "redemption_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rel_edges rel_edges_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rel_edges_source_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rel_edges'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rel_edges"
    ADD CONSTRAINT "rel_edges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."relationship_nodes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rel_edges rel_edges_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rel_edges_target_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rel_edges'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rel_edges"
    ADD CONSTRAINT "rel_edges_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."relationship_nodes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rel_edges rel_edges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rel_edges_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rel_edges'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rel_edges"
    ADD CONSTRAINT "rel_edges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_events relationship_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'relationship_events_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_events'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."relationship_events"
    ADD CONSTRAINT "relationship_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_locations relationship_locations_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'relationship_locations_node_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_locations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."relationship_locations"
    ADD CONSTRAINT "relationship_locations_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "public"."relationship_nodes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_locations relationship_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'relationship_locations_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_locations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."relationship_locations"
    ADD CONSTRAINT "relationship_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_nodes relationship_nodes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'relationship_nodes_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."relationship_nodes"
    ADD CONSTRAINT "relationship_nodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shared_resources shared_resources_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'shared_resources_uploader_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'shared_resources'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."shared_resources"
    ADD CONSTRAINT "shared_resources_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sleep_config sleep_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'sleep_config_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'sleep_config'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."sleep_config"
    ADD CONSTRAINT "sleep_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscriptions subscriptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'subscriptions_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'subscriptions_plan_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'subscriptions_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: test_results test_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'test_results_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'test_results'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_comments tree_hole_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_comments_post_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_comments"
    ADD CONSTRAINT "tree_hole_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."tree_hole_posts"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_comments tree_hole_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_comments_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_comments"
    ADD CONSTRAINT "tree_hole_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_posts tree_hole_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_posts_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_posts"
    ADD CONSTRAINT "tree_hole_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_reactions tree_hole_reactions_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_reactions_post_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_reactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_reactions"
    ADD CONSTRAINT "tree_hole_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."tree_hole_posts"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_reactions tree_hole_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'tree_hole_reactions_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_reactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."tree_hole_reactions"
    ADD CONSTRAINT "tree_hole_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_daily_ai_quotas user_daily_ai_quotas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_daily_ai_quotas_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_daily_ai_quotas'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_daily_ai_quotas"
    ADD CONSTRAINT "user_daily_ai_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions user_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_subscriptions_plan_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_subscriptions_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_daily_ai_quotas Users can insert their own daily quota; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Users can insert their own daily quota'
      AND n.nspname = 'public'
      AND c.relname = 'user_daily_ai_quotas'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "Users can insert their own daily quota" ON "public"."user_daily_ai_quotas" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_daily_ai_quotas Users can update their own daily quota; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Users can update their own daily quota'
      AND n.nspname = 'public'
      AND c.relname = 'user_daily_ai_quotas'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "Users can update their own daily quota" ON "public"."user_daily_ai_quotas" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_daily_ai_quotas Users can view their own daily quota; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Users can view their own daily quota'
      AND n.nspname = 'public'
      AND c.relname = 'user_daily_ai_quotas'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "Users can view their own daily quota" ON "public"."user_daily_ai_quotas" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_visits admin can delete visits; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin can delete visits'
      AND n.nspname = 'public'
      AND c.relname = 'page_visits'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin can delete visits" ON "public"."page_visits" FOR DELETE TO "authenticated" USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_visits admin can read all visits; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin can read all visits'
      AND n.nspname = 'public'
      AND c.relname = 'page_visits'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin can read all visits" ON "public"."page_visits" FOR SELECT TO "authenticated" USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users admin_users_delete_self; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_users_delete_self'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_users_delete_self" ON "public"."admin_users" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users admin_users_insert_admin; Type: POLICY; Schema: public; Owner: -
--
-- 安全说明：本策略必须限制为「仅管理员可写入」。
-- 若改成 WITH CHECK ("auth"."uid"() = "id")，则任何已登录用户都能把自己插入
-- admin_users 表，进而通过 is_admin() 自行提权为管理员，读取/修改全部业务数据。
-- 详见仓库根目录 SECURITY.md。

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_users_insert_admin'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_users_insert_admin" ON "public"."admin_users" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users admin_users_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_users_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_users_select_all" ON "public"."admin_users" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users admin_users_update_self; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_users_update_self'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_users_update_self" ON "public"."admin_users" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_workbench_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_workbench_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_workbench_jobs ai_workbench_jobs_delete_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_jobs_delete_own'
      AND n.nspname = 'public'
      AND c.relname = 'ai_workbench_jobs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ai_workbench_jobs_delete_own" ON "public"."ai_workbench_jobs" FOR DELETE USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_workbench_jobs ai_workbench_jobs_insert_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_jobs_insert_own'
      AND n.nspname = 'public'
      AND c.relname = 'ai_workbench_jobs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ai_workbench_jobs_insert_own" ON "public"."ai_workbench_jobs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_workbench_jobs ai_workbench_jobs_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_jobs_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'ai_workbench_jobs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ai_workbench_jobs_select_own" ON "public"."ai_workbench_jobs" FOR SELECT USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_workbench_jobs ai_workbench_jobs_update_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_jobs_update_own'
      AND n.nspname = 'public'
      AND c.relname = 'ai_workbench_jobs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ai_workbench_jobs_update_own" ON "public"."ai_workbench_jobs" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_visits anon can insert visits; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon can insert visits'
      AND n.nspname = 'public'
      AND c.relname = 'page_visits'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon can insert visits" ON "public"."page_visits" FOR INSERT TO "anon" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;

--
-- Name: page_visits authenticated can insert visits; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated can insert visits'
      AND n.nspname = 'public'
      AND c.relname = 'page_visits'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated can insert visits" ON "public"."page_visits" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."canvas_nodes" ENABLE ROW LEVEL SECURITY;

--
-- Name: canvas_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."canvas_projects" ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: redemption_codes codes_delete_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'codes_delete_admin'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "codes_delete_admin" ON "public"."redemption_codes" FOR DELETE USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes codes_insert_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'codes_insert_admin'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "codes_insert_admin" ON "public"."redemption_codes" FOR INSERT WITH CHECK ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes codes_select_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'codes_select_admin'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "codes_select_admin" ON "public"."redemption_codes" FOR SELECT USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes codes_select_unused; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'codes_select_unused'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "codes_select_unused" ON "public"."redemption_codes" FOR SELECT USING (((NOT "is_used") OR ("used_by" = "auth"."uid"())));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes codes_update_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'codes_update_admin'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "codes_update_admin" ON "public"."redemption_codes" FOR UPDATE USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_codes codes_update_self; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'codes_update_self'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_codes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "codes_update_self" ON "public"."redemption_codes" FOR UPDATE USING ((NOT "is_used"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_comments comments_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'comments_delete'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "comments_delete" ON "public"."tree_hole_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_comments comments_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'comments_insert'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "comments_insert" ON "public"."tree_hole_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_comments comments_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'comments_select'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "comments_select" ON "public"."tree_hole_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tree_hole_posts" "p"
  WHERE (("p"."id" = "tree_hole_comments"."post_id") AND ("p"."is_public" = true)))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dream_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dream_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: dream_records dream_records_owner; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dream_records_owner'
      AND n.nspname = 'public'
      AND c.relname = 'dream_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dream_records_owner" ON "public"."dream_records" USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_events events_delete_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'events_delete_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "events_delete_own" ON "public"."relationship_events" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_events events_insert_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'events_insert_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "events_insert_own" ON "public"."relationship_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_events events_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'events_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "events_select_own" ON "public"."relationship_events" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_events events_update_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'events_update_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "events_update_own" ON "public"."relationship_events" FOR UPDATE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: happiness_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."happiness_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: heron_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."heron_audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: heron_audit_logs heron_audit_logs_owner; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron_audit_logs_owner'
      AND n.nspname = 'public'
      AND c.relname = 'heron_audit_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "heron_audit_logs_owner" ON "public"."heron_audit_logs" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."heron_memories" ENABLE ROW LEVEL SECURITY;

--
-- Name: heron_memories heron_memories_owner; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron_memories_owner'
      AND n.nspname = 'public'
      AND c.relname = 'heron_memories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "heron_memories_owner" ON "public"."heron_memories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_scheduled_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."heron_scheduled_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: heron_scheduled_tasks heron_scheduled_tasks_owner; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron_scheduled_tasks_owner'
      AND n.nspname = 'public'
      AND c.relname = 'heron_scheduled_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "heron_scheduled_tasks_owner" ON "public"."heron_scheduled_tasks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: heron_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."heron_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: heron_sessions heron_sessions_owner; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron_sessions_owner'
      AND n.nspname = 'public'
      AND c.relname = 'heron_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "heron_sessions_owner" ON "public"."heron_sessions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: hope_leaves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."hope_leaves" ENABLE ROW LEVEL SECURITY;

--
-- Name: hope_leaves hope_leaves_delete_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'hope_leaves_delete_own'
      AND n.nspname = 'public'
      AND c.relname = 'hope_leaves'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "hope_leaves_delete_own" ON "public"."hope_leaves" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: hope_leaves hope_leaves_insert_auth; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'hope_leaves_insert_auth'
      AND n.nspname = 'public'
      AND c.relname = 'hope_leaves'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "hope_leaves_insert_auth" ON "public"."hope_leaves" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL)));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: hope_leaves hope_leaves_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'hope_leaves_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'hope_leaves'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "hope_leaves_select_all" ON "public"."hope_leaves" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lesson_files" ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lesson_folders" ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_locations locations_delete_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'locations_delete_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_locations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "locations_delete_own" ON "public"."relationship_locations" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_locations locations_insert_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'locations_insert_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_locations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "locations_insert_own" ON "public"."relationship_locations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_locations locations_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'locations_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_locations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "locations_select_own" ON "public"."relationship_locations" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_locations locations_update_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'locations_update_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_locations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "locations_update_own" ON "public"."relationship_locations" FOR UPDATE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mood_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mood_checkins" ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_nodes nodes_delete_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'nodes_delete_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "nodes_delete_own" ON "public"."relationship_nodes" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_nodes nodes_insert_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'nodes_insert_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "nodes_insert_own" ON "public"."relationship_nodes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_nodes nodes_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'nodes_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "nodes_select_own" ON "public"."relationship_nodes" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: relationship_nodes nodes_update_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'nodes_update_own'
      AND n.nspname = 'public'
      AND c.relname = 'relationship_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "nodes_update_own" ON "public"."relationship_nodes" FOR UPDATE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."note_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: note_attachments note_attachments_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_attachments_delete'
      AND n.nspname = 'public'
      AND c.relname = 'note_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "note_attachments_delete" ON "public"."note_attachments" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_attachments note_attachments_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_attachments_insert'
      AND n.nspname = 'public'
      AND c.relname = 'note_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "note_attachments_insert" ON "public"."note_attachments" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_attachments note_attachments_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_attachments_select'
      AND n.nspname = 'public'
      AND c.relname = 'note_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "note_attachments_select" ON "public"."note_attachments" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."note_folders" ENABLE ROW LEVEL SECURITY;

--
-- Name: note_folders note_folders_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_folders_delete'
      AND n.nspname = 'public'
      AND c.relname = 'note_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "note_folders_delete" ON "public"."note_folders" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_folders note_folders_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_folders_insert'
      AND n.nspname = 'public'
      AND c.relname = 'note_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "note_folders_insert" ON "public"."note_folders" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_folders note_folders_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_folders_select'
      AND n.nspname = 'public'
      AND c.relname = 'note_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "note_folders_select" ON "public"."note_folders" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: note_folders note_folders_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_folders_update'
      AND n.nspname = 'public'
      AND c.relname = 'note_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "note_folders_update" ON "public"."note_folders" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: notes notes_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notes_delete'
      AND n.nspname = 'public'
      AND c.relname = 'notes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "notes_delete" ON "public"."notes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notes notes_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notes_insert'
      AND n.nspname = 'public'
      AND c.relname = 'notes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "notes_insert" ON "public"."notes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notes notes_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notes_select'
      AND n.nspname = 'public'
      AND c.relname = 'notes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "notes_select" ON "public"."notes" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notes notes_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notes_update'
      AND n.nspname = 'public'
      AND c.relname = 'notes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "notes_update" ON "public"."notes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_card_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."oh_card_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: oh_card_records oh_card_records_own_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_card_records_own_insert'
      AND n.nspname = 'public'
      AND c.relname = 'oh_card_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "oh_card_records_own_insert" ON "public"."oh_card_records" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_card_records oh_card_records_own_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_card_records_own_select'
      AND n.nspname = 'public'
      AND c.relname = 'oh_card_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "oh_card_records_own_select" ON "public"."oh_card_records" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_card_records oh_card_records_own_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_card_records_own_update'
      AND n.nspname = 'public'
      AND c.relname = 'oh_card_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "oh_card_records_own_update" ON "public"."oh_card_records" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."oh_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: oh_cards oh_cards_insert_service; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_cards_insert_service'
      AND n.nspname = 'public'
      AND c.relname = 'oh_cards'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "oh_cards_insert_service" ON "public"."oh_cards" FOR INSERT TO "service_role" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_cards oh_cards_read_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_cards_read_all'
      AND n.nspname = 'public'
      AND c.relname = 'oh_cards'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "oh_cards_read_all" ON "public"."oh_cards" FOR SELECT TO "authenticated", "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: oh_cards oh_cards_update_service; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_cards_update_service'
      AND n.nspname = 'public'
      AND c.relname = 'oh_cards'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "oh_cards_update_service" ON "public"."oh_cards" FOR UPDATE TO "service_role" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_insert_service; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'orders_insert_service'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "orders_insert_service" ON "public"."orders" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'orders_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "orders_select_own" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_update_service; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'orders_update_service'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "orders_update_service" ON "public"."orders" FOR UPDATE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: painting_house_works own_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'own_delete'
      AND n.nspname = 'public'
      AND c.relname = 'painting_house_works'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "own_delete" ON "public"."painting_house_works" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: painting_house_works own_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'own_insert'
      AND n.nspname = 'public'
      AND c.relname = 'painting_house_works'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "own_insert" ON "public"."painting_house_works" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: painting_house_works own_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'own_select'
      AND n.nspname = 'public'
      AND c.relname = 'painting_house_works'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "own_select" ON "public"."painting_house_works" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: painting_house_works own_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'own_update'
      AND n.nspname = 'public'
      AND c.relname = 'painting_house_works'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "own_update" ON "public"."painting_house_works" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_nodes owner_all_nodes; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner_all_nodes'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_nodes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner_all_nodes" ON "public"."canvas_nodes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: canvas_projects owner_all_projects; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner_all_projects'
      AND n.nspname = 'public'
      AND c.relname = 'canvas_projects'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner_all_projects" ON "public"."canvas_projects" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."page_visits" ENABLE ROW LEVEL SECURITY;

--
-- Name: paint_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."paint_videos" ENABLE ROW LEVEL SECURITY;

--
-- Name: painting_house_works; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."painting_house_works" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_plans plans_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'plans_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'subscription_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "plans_select_all" ON "public"."subscription_plans" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positive_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."positive_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: redemption_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."redemption_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: redemption_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."redemption_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: redemption_records redemption_records_all_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'redemption_records_all_admin'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "redemption_records_all_admin" ON "public"."redemption_records" USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_records redemption_records_select_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'redemption_records_select_admin'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "redemption_records_select_admin" ON "public"."redemption_records" FOR SELECT USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: redemption_records redemption_records_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'redemption_records_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'redemption_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "redemption_records_select_own" ON "public"."redemption_records" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rel_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rel_edges" ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."relationship_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."relationship_locations" ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."relationship_nodes" ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."shared_resources" ENABLE ROW LEVEL SECURITY;

--
-- Name: sleep_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sleep_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: sleep_config sleep_config_owner; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sleep_config_owner'
      AND n.nspname = 'public'
      AND c.relname = 'sleep_config'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sleep_config_owner" ON "public"."sleep_config" USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscription_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_insert_service; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'subscriptions_insert_service'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "subscriptions_insert_service" ON "public"."subscriptions" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscriptions subscriptions_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'subscriptions_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "subscriptions_select_own" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: subscriptions subscriptions_update_service; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'subscriptions_update_service'
      AND n.nspname = 'public'
      AND c.relname = 'subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "subscriptions_update_service" ON "public"."subscriptions" FOR UPDATE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: test_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."test_results" ENABLE ROW LEVEL SECURITY;

--
-- Name: tree_hole_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tree_hole_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: tree_hole_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tree_hole_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: tree_hole_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tree_hole_reactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_daily_ai_quotas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_daily_ai_quotas" ENABLE ROW LEVEL SECURITY;

--
-- Name: rel_edges user_edges_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_edges_all'
      AND n.nspname = 'public'
      AND c.relname = 'rel_edges'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_edges_all" ON "public"."rel_edges" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: paint_videos users_own_videos; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'users_own_videos'
      AND n.nspname = 'public'
      AND c.relname = 'paint_videos'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "users_own_videos" ON "public"."paint_videos" USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_orders users_view_own_orders; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'users_view_own_orders'
      AND n.nspname = 'public'
      AND c.relname = 'payment_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "users_view_own_orders" ON "public"."payment_orders" FOR SELECT USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions usub_insert_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'usub_insert_own'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "usub_insert_own" ON "public"."user_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions usub_select_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'usub_select_admin'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "usub_select_admin" ON "public"."user_subscriptions" FOR SELECT USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions usub_select_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'usub_select_own'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "usub_select_own" ON "public"."user_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions usub_update_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'usub_update_admin'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "usub_update_admin" ON "public"."user_subscriptions" FOR UPDATE USING ("public"."is_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_subscriptions usub_update_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'usub_update_own'
      AND n.nspname = 'public'
      AND c.relname = 'user_subscriptions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "usub_update_own" ON "public"."user_subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shared_resources 上传者可删除; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '上传者可删除'
      AND n.nspname = 'public'
      AND c.relname = 'shared_resources'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "上传者可删除" ON "public"."shared_resources" FOR DELETE TO "authenticated" USING (("uploader_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shared_resources 任何人可更新下载数; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '任何人可更新下载数'
      AND n.nspname = 'public'
      AND c.relname = 'shared_resources'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "任何人可更新下载数" ON "public"."shared_resources" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_posts 匿名用户查看公开树洞; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '匿名用户查看公开树洞'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "匿名用户查看公开树洞" ON "public"."tree_hole_posts" FOR SELECT TO "anon" USING (("is_public" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shared_resources 已登录可上传共享资源; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '已登录可上传共享资源'
      AND n.nspname = 'public'
      AND c.relname = 'shared_resources'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "已登录可上传共享资源" ON "public"."shared_resources" FOR INSERT TO "authenticated" WITH CHECK (("uploader_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shared_resources 所有人可读分享资源; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '所有人可读分享资源'
      AND n.nspname = 'public'
      AND c.relname = 'shared_resources'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "所有人可读分享资源" ON "public"."shared_resources" FOR SELECT TO "authenticated", "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles 所有人查看文章; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '所有人查看文章'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "所有人查看文章" ON "public"."articles" FOR SELECT TO "authenticated", "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 用户更新自己的profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户更新自己的profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户更新自己的profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((NOT ("role" IS DISTINCT FROM "public"."get_user_role"("auth"."uid"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 用户查看自己的profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户查看自己的profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户查看自己的profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: chat_sessions 用户管理自己的对话; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的对话'
      AND n.nspname = 'public'
      AND c.relname = 'chat_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的对话" ON "public"."chat_sessions" TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: happiness_logs 用户管理自己的幸福日志; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的幸福日志'
      AND n.nspname = 'public'
      AND c.relname = 'happiness_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的幸福日志" ON "public"."happiness_logs" TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mood_checkins 用户管理自己的心情记录; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的心情记录'
      AND n.nspname = 'public'
      AND c.relname = 'mood_checkins'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的心情记录" ON "public"."mood_checkins" TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_files 用户管理自己的文件; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的文件'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_files'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的文件" ON "public"."lesson_files" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: lesson_folders 用户管理自己的文件夹; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的文件夹'
      AND n.nspname = 'public'
      AND c.relname = 'lesson_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的文件夹" ON "public"."lesson_folders" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_posts 用户管理自己的树洞帖子; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的树洞帖子'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的树洞帖子" ON "public"."tree_hole_posts" TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: test_results 用户管理自己的测试记录; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的测试记录'
      AND n.nspname = 'public'
      AND c.relname = 'test_results'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的测试记录" ON "public"."test_results" TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positive_tasks 用户管理自己的积极任务; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的积极任务'
      AND n.nspname = 'public'
      AND c.relname = 'positive_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的积极任务" ON "public"."positive_tasks" TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_posts 登录用户查看公开树洞; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '登录用户查看公开树洞'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "登录用户查看公开树洞" ON "public"."tree_hole_posts" FOR SELECT TO "authenticated" USING (("is_public" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_reactions 登录用户查看回应; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '登录用户查看回应'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_reactions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "登录用户查看回应" ON "public"."tree_hole_reactions" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: tree_hole_reactions 登录用户管理自己的回应; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '登录用户管理自己的回应'
      AND n.nspname = 'public'
      AND c.relname = 'tree_hole_reactions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "登录用户管理自己的回应" ON "public"."tree_hole_reactions" TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 管理员全权访问profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '管理员全权访问profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "管理员全权访问profiles" ON "public"."profiles" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mood_checkins 管理员查看所有心情记录; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '管理员查看所有心情记录'
      AND n.nspname = 'public'
      AND c.relname = 'mood_checkins'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "管理员查看所有心情记录" ON "public"."mood_checkins" FOR SELECT TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles 管理员管理文章; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '管理员管理文章'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "管理员管理文章" ON "public"."articles" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- PostgreSQL database dump complete
--




-- ============================================================
-- SECTION: DIFF FILTER OBJECTS
-- ============================================================
-- Objects that match diff-filter.json but cannot be represented
-- precisely by pg_dump --filter.

-- auth.users trigger: on_auth_user_created
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();';
  END IF;
END
$pg_schema_restore$;
-- auth.users trigger: on_auth_user_created_subscription
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created_subscription'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created_subscription AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();';
  END IF;
END
$pg_schema_restore$;
-- policy: "heron-web authenticated update" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron-web authenticated update'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "heron-web authenticated update" ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((bucket_id = ''heron-web''::text) AND (auth.role() = ''authenticated''::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: "heron-web authenticated upload" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron-web authenticated upload'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "heron-web authenticated upload" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = ''heron-web''::text) AND (auth.role() = ''authenticated''::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: "heron-web public read" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron-web public read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "heron-web public read" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''heron-web''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "oh-card-bg public read" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh-card-bg public read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "oh-card-bg public read" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''oh-card-bg''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "oh-card-bg service write" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh-card-bg service write'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "oh-card-bg service write" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = ''oh-card-bg''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "已登录可上传共享资源文件" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '已登录可上传共享资源文件'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "已登录可上传共享资源文件" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''shared-resources''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "所有人可读共享资源文件" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '所有人可读共享资源文件'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "所有人可读共享资源文件" ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((bucket_id = ''shared-resources''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "用户可上传备课文件" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户可上传备课文件'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "用户可上传备课文件" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = ''lesson-files''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: "用户可删自己备课文件" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户可删自己备课文件'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "用户可删自己备课文件" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = ''lesson-files''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: "用户可读自己备课文件" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户可读自己备课文件'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "用户可读自己备课文件" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = ''lesson-files''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: ai_workbench_images_delete_own on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_images_delete_own'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY ai_workbench_images_delete_own ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = ''ai_workbench_images''::text) AND (auth.uid() = owner)));';
  END IF;
END
$pg_schema_restore$;
-- policy: ai_workbench_images_insert_own on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_images_insert_own'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY ai_workbench_images_insert_own ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = ''ai_workbench_images''::text) AND (auth.uid() IS NOT NULL)));';
  END IF;
END
$pg_schema_restore$;
-- policy: ai_workbench_images_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_images_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY ai_workbench_images_select ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''ai_workbench_images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: ai_workbench_images_update_own on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_workbench_images_update_own'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY ai_workbench_images_update_own ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((bucket_id = ''ai_workbench_images''::text) AND (auth.uid() = owner))) WITH CHECK ((bucket_id = ''ai_workbench_images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: auth_delete_node_images on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_delete_node_images'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY auth_delete_node_images ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((bucket_id = ''app-cbrme32s08ox-node-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: auth_upload_node_images on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_upload_node_images'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY auth_upload_node_images ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''app-cbrme32s08ox-node-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: auth_upload_painting on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_upload_painting'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY auth_upload_painting ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = ''painting-house-images''::text) AND (auth.role() = ''authenticated''::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: generated_audio_auth_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'generated_audio_auth_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY generated_audio_auth_delete ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = ''generated-audio''::text) AND (auth.role() = ''authenticated''::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: generated_audio_auth_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'generated_audio_auth_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY generated_audio_auth_insert ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = ''generated-audio''::text) AND (auth.role() = ''authenticated''::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: generated_audio_auth_update on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'generated_audio_auth_update'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY generated_audio_auth_update ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((bucket_id = ''generated-audio''::text) AND (auth.role() = ''authenticated''::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: generated_audio_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'generated_audio_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY generated_audio_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''generated-audio''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: heron_web_auth_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron_web_auth_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY heron_web_auth_insert ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = ''heron-web''::text) AND (auth.role() = ''authenticated''::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: heron_web_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'heron_web_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY heron_web_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''heron-web''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: music_library_auth_update on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'music_library_auth_update'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY music_library_auth_update ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING ((bucket_id = ''music-library''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: music_library_auth_upload on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'music_library_auth_upload'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY music_library_auth_upload ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''music-library''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: music_library_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'music_library_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY music_library_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''music-library''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: note_attach_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_attach_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY note_attach_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = ''note-attachments''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: note_attach_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_attach_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY note_attach_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = ''note-attachments''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: note_attach_upload on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'note_attach_upload'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY note_attach_upload ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = ''note-attachments''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: oh_cards_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_cards_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY oh_cards_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''oh-cards''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: oh_cards_service_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_cards_service_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY oh_cards_service_insert ON storage.objects AS PERMISSIVE FOR INSERT TO service_role WITH CHECK ((bucket_id = ''oh-cards''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: oh_cards_service_update on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'oh_cards_service_update'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY oh_cards_service_update ON storage.objects AS PERMISSIVE FOR UPDATE TO service_role USING ((bucket_id = ''oh-cards''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: own_delete_painting on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'own_delete_painting'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY own_delete_painting ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = ''painting-house-images''::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));';
  END IF;
END
$pg_schema_restore$;
-- policy: public_read_node_images on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_node_images'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY public_read_node_images ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''app-cbrme32s08ox-node-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: public_read_painting on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_painting'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY public_read_painting ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''painting-house-images''::text));';
  END IF;
END
$pg_schema_restore$;

-- ============================================================
-- SECTION: STORAGE BUCKETS DATA
-- ============================================================

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('ai_workbench_images', 'ai_workbench_images', NULL, '2026-08-14 10:32:17.989812+00', '2026-08-14 10:32:17.989812+00', 'true', 'false', NULL, NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('app-cbrme32s08ox-node-images', 'app-cbrme32s08ox-node-images', NULL, '2026-08-01 07:22:07.336852+00', '2026-08-01 07:22:07.336852+00', 'true', 'false', '5242880', '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('generated-audio', 'generated-audio', NULL, '2026-06-14 13:27:31.962583+00', '2026-06-14 13:27:31.962583+00', 'true', 'false', '10485760', '{audio/mpeg,audio/mp3,audio/ogg,audio/wav}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('heron-web', 'heron-web', NULL, '2026-08-14 14:58:57.158692+00', '2026-08-14 14:58:57.158692+00', 'true', 'false', NULL, NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('lesson-files', 'lesson-files', NULL, '2026-06-15 04:28:12.773031+00', '2026-06-15 04:28:12.773031+00', 'false', 'false', '52428800', NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('music-library', 'music-library', NULL, '2026-06-27 04:12:29.280944+00', '2026-06-27 04:12:29.280944+00', 'true', 'false', '52428800', '{audio/mpeg,audio/wav,audio/mp3,audio/x-wav,audio/wave,audio/*}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('note-attachments', 'note-attachments', NULL, '2026-06-19 08:41:27.702157+00', '2026-06-19 08:41:27.702157+00', 'true', 'false', '20971520', '{image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/wav,audio/x-wav}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('oh-card-bg', 'oh-card-bg', NULL, '2026-06-28 16:29:24.029966+00', '2026-06-28 16:29:24.029966+00', 'true', 'false', '10485760', '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('oh-cards', 'oh-cards', NULL, '2026-06-28 09:38:59.310392+00', '2026-06-28 09:38:59.310392+00', 'true', 'false', '5242880', '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('painting-house-images', 'painting-house-images', NULL, '2026-08-02 11:29:38.312773+00', '2026-08-02 11:29:38.312773+00', 'true', 'false', NULL, NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('shared-resources', 'shared-resources', NULL, '2026-06-15 04:28:12.773031+00', '2026-06-15 04:28:12.773031+00', 'true', 'false', '52428800', NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";

-- ============================================================
-- SECTION: CRON JOBS
-- ============================================================
-- 用户自定义 pg_cron 任务。

