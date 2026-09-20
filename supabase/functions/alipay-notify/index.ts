import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySignatureV3 } from '../_shared/alipay-sdk-deno.ts';

serve(async (req) => {
  try {
    const body = await req.text();
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(body)) params[k] = v;

    const signStr = Object.keys(params)
      .filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] !== '')
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');

    const verified = await verifySignatureV3(
      signStr,
      params['sign'] ?? '',
      Deno.env.get('ALIPAY_AIPAY_PROD_ALIPAY_PUBLIC_KEY')!,
    );
    if (!verified) return new Response('fail', { status: 200 });

    const tradeStatus = params['trade_status'];
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      const outTradeNo = params['out_trade_no'];
      const tradeNo = params['trade_no'];

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const { data: order } = await supabase
        .from('payment_orders')
        .select('id, user_id, plan_id, status, billing_cycle, amount')
        .eq('out_trade_no', outTradeNo)
        .maybeSingle();

      if (order && order.status === 'pending') {
        // 关键信息校验：金额必须与订单一致，防止伪造/篡改
        const notifyAmount = Number(params['total_amount'] ?? '0');
        const expectedAmount = Number(order.amount ?? 0);
        if (Math.abs(notifyAmount - expectedAmount) > 0.01) {
          console.error('alipay-notify amount mismatch:', notifyAmount, 'expected', expectedAmount);
          return new Response('fail', { status: 200 });
        }

        const now = new Date();
        const days = order.billing_cycle === 'yearly' ? 365 : 30;

        // 续费：若当前套餐未到期，从现有到期时间顺延；否则从当前时间起算
        const { data: existingSub } = await supabase
          .from('user_subscriptions')
          .select('expires_at')
          .eq('user_id', order.user_id)
          .eq('plan_id', order.plan_id)
          .eq('status', 'active')
          .maybeSingle();

        const base = existingSub?.expires_at && new Date(existingSub.expires_at) > now
          ? new Date(existingSub.expires_at)
          : now;
        const expiresAt = new Date(base.getTime() + days * 86400000).toISOString();

        await supabase.from('payment_orders').update({
          status: 'paid',
          trade_no: tradeNo,
          paid_at: now.toISOString(),
        }).eq('id', order.id).eq('status', 'pending');

        await supabase.from('user_subscriptions').upsert({
          user_id: order.user_id,
          plan_id: order.plan_id,
          status: 'active',
          started_at: now.toISOString(),
          expires_at: expiresAt,
        }, { onConflict: 'user_id' });
      }
    }

    return new Response('success', {
      status: 200, headers: { 'Content-Type': 'text/plain' },
    });
  } catch (e) {
    console.error('alipay-notify error:', e);
    return new Response('fail', { status: 200 });
  }
});