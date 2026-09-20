import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: '身份验证失败' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const { code } = await req.json();
    if (!code?.trim()) return new Response(JSON.stringify({ error: '请输入兑换码' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // 查找兑换码
    const { data: codeRow, error: findErr } = await supabase
      .from('redemption_codes')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();

    if (findErr || !codeRow) return new Response(JSON.stringify({ error: '兑换码不存在' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (codeRow.is_used) return new Response(JSON.stringify({ error: '该兑换码已被使用' }), { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // 计算到期时间
    const now = new Date();
    const expiresAt = codeRow.duration_days > 0
      ? new Date(now.getTime() + codeRow.duration_days * 86400000).toISOString()
      : null;

    // 原子操作：标记码已使用 + 更新/插入订阅（用 upsert） + 写入兑换流水记录
    const [markResult, subResult, recordResult] = await Promise.all([
      supabase.from('redemption_codes').update({
        is_used: true,
        used_by: user.id,
        used_at: now.toISOString(),
      }).eq('id', codeRow.id).eq('is_used', false),

      supabase.from('user_subscriptions').upsert({
        user_id: user.id,
        plan_id: codeRow.plan_id,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt,
        redeemed_code: code.trim().toUpperCase(),
      }, { onConflict: 'user_id' }),

      supabase.from('redemption_records').insert({
        code_id: codeRow.id,
        code: codeRow.code,
        user_id: user.id,
        user_phone: user.phone || null,
        plan_id: codeRow.plan_id,
        duration_days: codeRow.duration_days,
        used_at: now.toISOString(),
        expires_at: expiresAt,
        status: 'active',
        batch_label: codeRow.batch_label,
      }),
    ]);

    if (markResult.error) throw markResult.error;
    if (subResult.error) throw subResult.error;
    if (recordResult.error) console.warn('redemption_records 记录写入异常:', recordResult.error);

    // 查套餐名称
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('name, level')
      .eq('id', codeRow.plan_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      success: true,
      plan_id: codeRow.plan_id,
      plan_name: plan?.name ?? codeRow.plan_id,
      expires_at: expiresAt,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
