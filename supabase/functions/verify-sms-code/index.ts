import { serve } from "https://deno.land/std/http/server.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  let sessionId: string | undefined;
  let code: string;
  let mobile: string;
  let password: string | undefined;
  try {
    const body = await req.json();
    sessionId = body.sessionId;
    code = body.code;
    mobile = body.mobile || body.phone;
    password = body.password;
    if (!code) throw new Error("Missing code");
    if (!mobile) throw new Error("Missing mobile");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body", success: false }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server configuration error", success: false }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(
      "https://app-cbrme32s08ox-api-Xa6JZxjyqK0a-gateway.appmiaoda.com/v1/code/verify_message_code",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gateway-Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ sessionId: sessionId || "", code, mobile }),
      },
    );

    if (upstream.status === 429 || upstream.status === 402) {
      const errText = await upstream.text();
      return new Response(errText, {
        status: upstream.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream error: ${upstream.status}`, success: false }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const data = await upstream.json();
    if (data.status !== 0) {
      return new Response(JSON.stringify({
        success: false,
        status: data.status,
        message: data.msg || "验证码错误或已失效",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 上游验证通过，为该手机号在 Supabase Auth 中建立/更新用户
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const email = `${mobile}@miaoda.com`;
    const customPwd = password && typeof password === "string" && password.trim().length >= 6 ? password.trim() : null;
    const defaultPwd = `Glimmer_Mobile_${mobile}_AuthSecure!2026`;
    let tokenHash: string | null = null;

    if (supabaseUrl && serviceRoleKey) {
      try {
        const { createClient } = await import("jsr:@supabase/supabase-js@2");
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // 尝试新建用户
        const { error: createErr } = await adminClient.auth.admin.createUser({
          email,
          phone: mobile,
          password: customPwd || defaultPwd,
          email_confirm: true,
          phone_confirm: true,
          user_metadata: { phone: mobile, full_name: `手机用户_${mobile.slice(-4)}` },
        });

        if (createErr && (createErr.message?.includes('already registered') || createErr.message?.includes('exists'))) {
          // 用户已存在
          const { data: usersData } = await adminClient.auth.admin.listUsers();
          const target = usersData?.users?.find((u: { email?: string; phone?: string }) => u.email === email || u.phone === mobile);
          if (target) {
            const updatePayload: Record<string, unknown> = {
              phone: mobile,
              phone_confirm: true,
            };
            if (customPwd) {
              updatePayload.password = customPwd;
            }
            await adminClient.auth.admin.updateUserById(target.id, updatePayload);

            // 若没有提供自定义密码（快捷登录），生成 magiclink token_hash 免密建立会话
            if (!customPwd) {
              try {
                const { data: linkData } = await adminClient.auth.admin.generateLink({
                  type: 'magiclink',
                  email,
                });
                tokenHash = linkData?.properties?.hashed_token || null;
              } catch (linkErr) {
                console.error("Generate magiclink warning:", linkErr);
              }
            }
          }
        }
      } catch (provisionErr) {
        console.error("Admin user provisioning warning:", provisionErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      status: 0,
      msg: "验证成功",
      email,
      password: customPwd || defaultPwd,
      token_hash: tokenHash,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to verify code" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
