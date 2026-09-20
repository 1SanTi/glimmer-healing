import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 生成随机兑换码 格式: XXXX-XXXX-XXXX-XXXX
function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ══════════════════════════════════════════════════════════════════
    // 鉴权（必须在服务端完成）
    // ══════════════════════════════════════════════════════════════════
    // 本函数使用 service_role 密钥，会**绕过全部 RLS 策略**。
    // 因此调用者身份必须在这里校验 —— 绝不能依赖客户端的密码弹窗。
    //
    // 历史问题：本函数原先没有任何服务端鉴权，注释声称「安全性由前端密码弹窗保障」。
    // 由于客户端密码只存在于 APK 的 JS bundle 中（可被解包提取），且任何人都能
    // 直接 POST 到 /functions/v1/generate-codes，这等于允许任意人凭空生成
    // 高级会员兑换码，进而免费获得全部付费权益与 AI 额度。详见 SECURITY.md。
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: '身份验证失败' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 管理员校验走服务端 is_admin()（基于 admin_users 表），客户端无法伪造
    const { data: isAdmin, error: adminErr } = await anonClient.rpc('is_admin');
    if (adminErr || isAdmin !== true) {
      return new Response(JSON.stringify({ error: '无管理员权限' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 鉴权通过后，才使用 service_role 执行特权写入
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { plan_id, count = 1, duration_days = 365, batch_label = '' } = body;

    if (!plan_id || !['free', 'basic', 'pro'].includes(plan_id)) {
      return new Response(JSON.stringify({ error: '无效的套餐ID' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const safeCount = Math.min(100, Math.max(1, parseInt(count) || 1));
    const safeDays  = Math.max(0, parseInt(duration_days) || 365);

    // 计算到期时间
    const expires_at = safeDays > 0
      ? new Date(Date.now() + safeDays * 86400 * 1000).toISOString()
      : null;

    // 批量生成唯一码
    const codesSet = new Set<string>();
    let attempts = 0;
    while (codesSet.size < safeCount && attempts < safeCount * 10) {
      attempts++;
      codesSet.add(genCode());
    }
    const candidateCodes = Array.from(codesSet);

    // 过滤掉已存在的码
    const { data: existing } = await supabase
      .from('redemption_codes')
      .select('code')
      .in('code', candidateCodes);
    const existingSet = new Set((existing ?? []).map((r: { code: string }) => r.code));
    const uniqueCodes = candidateCodes.filter(c => !existingSet.has(c)).slice(0, safeCount);

    const rows = uniqueCodes.map(code => ({
      code,
      plan_id,
      duration_days: safeDays,
      expires_at,
      batch_label: batch_label || `批次-${new Date().toISOString().slice(0, 10)}`,
      created_by: user.id,
    }));

    const { data, error } = await supabase.from('redemption_codes').insert(rows).select();
    if (error) throw new Error(error.message ?? error.details ?? JSON.stringify(error));

    return new Response(JSON.stringify({ success: true, codes: data }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error
      ? e.message
      : (typeof e === 'object' && e !== null)
        ? ((e as any).message ?? (e as any).details ?? JSON.stringify(e))
        : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
