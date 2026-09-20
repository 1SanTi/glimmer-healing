// alipay-query Edge Function
// 主动查询订单状态（异步通知兜底）：防止通知延迟/丢失导致状态不一致
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AlipaySdk } from '../_shared/alipay-sdk-deno.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sdk = new AlipaySdk({
  appId: Deno.env.get('ALIPAY_AIPAY_PROD_APP_ID')!,
  privateKey: Deno.env.get('ALIPAY_AIPAY_PROD_PRIVATE_KEY')!,
  alipayPublicKey: Deno.env.get('ALIPAY_AIPAY_PROD_ALIPAY_PUBLIC_KEY')!,
  signType: 'RSA2',
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

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
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: '身份验证失败' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { outTradeNo } = await req.json();
    if (!outTradeNo) {
      return new Response(JSON.stringify({ error: '缺少订单号' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: order } = await supabase
      .from('payment_orders')
      .select('id, user_id, plan_id, status, billing_cycle, amount')
      .eq('out_trade_no', outTradeNo)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ error: '订单不存在' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: '无权操作该订单' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 已支付直接返回
    if (order.status === 'paid') {
      return new Response(JSON.stringify({ status: 'paid' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 主动向支付宝查询交易状态
    const result = await sdk.exec('alipay.trade.query', {
      bizContent: { out_trade_no: outTradeNo },
    });

    const tradeStatus = result?.alipay_trade_query_response?.trade_status;
    const isPaid = tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED';

    if (isPaid) {
      const now = new Date();
      const days = order.billing_cycle === 'yearly' ? 365 : 30;
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
        trade_no: result.alipay_trade_query_response.trade_no ?? null,
        paid_at: now.toISOString(),
      }).eq('id', order.id).eq('status', 'pending');

      await supabase.from('user_subscriptions').upsert({
        user_id: order.user_id,
        plan_id: order.plan_id,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt,
      }, { onConflict: 'user_id' });

      return new Response(JSON.stringify({ status: 'paid' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'pending' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});