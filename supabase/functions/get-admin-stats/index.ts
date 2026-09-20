import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ══════════════════════════════════════════════════════════════════
    // 鉴权（必须在服务端完成）
    // ══════════════════════════════════════════════════════════════════
    // 本函数使用 service_role 密钥，会**绕过全部 RLS 策略**，可以读取
    // auth.users 等敏感数据。原版本没有任何服务端鉴权，任何知道函数 URL 的
    // 人都能调用并获取运营数据。现改为要求已登录且为管理员。详见 SECURITY.md。
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

    const { data: isAdmin, error: adminErr } = await anonClient.rpc('is_admin');
    if (adminErr || isAdmin !== true) {
      return new Response(JSON.stringify({ error: '无管理员权限' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 鉴权通过后，才使用 service_role 执行特权查询
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 用 SQL 直接 COUNT auth.users，最准确
    const { data, error } = await supabase.rpc('get_total_users_count');
    if (error) {
      // fallback: listUsers 分页拿 total
      const { data: page } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
      const total_users = (page as any)?.total ?? 0;
      return new Response(JSON.stringify({ total_users }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ total_users: data ?? 0 }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), total_users: 0 }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
