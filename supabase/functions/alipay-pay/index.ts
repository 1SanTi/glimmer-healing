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

    const { planId, billingCycle, returnUrl } = await req.json();
    if (!planId || !['yearly', 'monthly'].includes(billingCycle)) {
      return new Response(JSON.stringify({ error: '参数错误' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: plan, error: planErr } = await supabase
      .from('subscription_plans')
      .select('id, name, price_monthly, price_yearly')
      .eq('id', planId)
      .maybeSingle();
    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: '套餐不存在' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const priceCents = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const amount = (priceCents / 100).toFixed(2);
    const outTradeNo = `GH${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const subject = `${plan.name} · ${billingCycle === 'yearly' ? '年付' : '月付'}`;

    const { error: insertErr } = await supabase.from('payment_orders').insert({
      out_trade_no: outTradeNo,
      user_id: user.id,
      plan_id: plan.id,
      plan_name: plan.name,
      billing_cycle: billingCycle,
      amount: Number(amount),
      subject,
      status: 'pending',
    });
    if (insertErr) throw insertErr;

    const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/alipay-notify`;

    const formHtml = await sdk.pageExec('alipay.trade.page.pay', 'POST', {
      returnUrl: returnUrl || `${Deno.env.get('SUPABASE_URL')}/functions/v1/alipay-notify`,
      notifyUrl,
      bizContent: {
        out_trade_no: outTradeNo,
        product_code: 'FAST_INSTANT_TRADE_PAY',
        total_amount: amount,
        subject,
      },
    });

    return new Response(JSON.stringify({ formHtml, outTradeNo }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});