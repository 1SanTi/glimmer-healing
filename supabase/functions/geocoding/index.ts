/**
 * geocoding — 地理编码代理（高德地图）
 * 将用户输入的中文地址转换为经纬度坐标（GCJ-02 坐标系）
 * 优先使用高德 AK（AMAP_AK），回退到百度 AK（BAIDU_MAP_AK）
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let address: string;
  let city: string | undefined;

  try {
    const body = await req.json();
    address = body.address;
    city = body.city;
    if (!address || typeof address !== 'string') throw new Error('Missing address');
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `请求参数无效: ${(e as Error).message}` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const amapAk = Deno.env.get('AMAP_AK');
  const baiduAk = Deno.env.get('BAIDU_MAP_AK');

  console.log(`[geocoding] 解析地址: ${address}${city ? ` (${city})` : ''}, engine=${amapAk ? 'amap' : baiduAk ? 'baidu' : 'none'}`);

  // ── 优先：高德地图地理编码 ──────────────────────────────────
  if (amapAk) {
    try {
      const params = new URLSearchParams({
        key: amapAk,
        address,
        output: 'JSON',
      });
      if (city) params.set('city', city);

      const upstream = await fetch(
        `https://restapi.amap.com/v3/geocode/geo?${params.toString()}`,
      );
      const json = await upstream.json() as {
        status: string;
        geocodes?: Array<{ location: string; formatted_address: string }>;
        info?: string;
      };

      if (json.status === '1' && json.geocodes && json.geocodes.length > 0) {
        // 高德返回 "lng,lat" 格式（GCJ-02）
        const [lngStr, latStr] = json.geocodes[0].location.split(',');
        const lng = parseFloat(lngStr);
        const lat = parseFloat(latStr);
        console.log(`[geocoding] 高德成功: ${address} -> ${lat},${lng}`);
        return new Response(
          JSON.stringify({
            status: 0,
            result: {
              location: { lat, lng },
              level: json.geocodes[0].formatted_address,
            },
            engine: 'amap',
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      } else {
        console.warn(`[geocoding] 高德未找到: ${address}, info=${json.info}`);
        // 高德找不到时继续尝试百度
      }
    } catch (e) {
      console.warn(`[geocoding] 高德请求失败: ${(e as Error).message}`);
      // 降级到百度
    }
  }

  // ── 降级：百度地图地理编码 ──────────────────────────────────
  if (baiduAk) {
    try {
      const params = new URLSearchParams({
        address,
        output: 'json',
        ret_coordtype: 'gcj02ll', // 返回 GCJ-02 坐标以统一坐标系
        ak: baiduAk,
      });
      if (city) params.set('city', city);

      const upstream = await fetch(
        `https://api.map.baidu.com/geocoding/v3/?${params.toString()}`,
      );
      const json = await upstream.json() as {
        status: number;
        result?: { location: { lat: number; lng: number }; level?: string };
      };

      if (json.status === 0 && json.result) {
        console.log(`[geocoding] 百度成功: ${address} -> ${json.result.location.lat},${json.result.location.lng}`);
        return new Response(
          JSON.stringify({ status: 0, result: json.result, engine: 'baidu' }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    } catch (e) {
      console.warn(`[geocoding] 百度请求失败: ${(e as Error).message}`);
    }
  }

  // ── 无可用 AK ──────────────────────────────────────────────
  return new Response(
    JSON.stringify({ status: -1, error: '地理编码失败：无法解析该地址' }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let address: string;
  let city: string | undefined;

  try {
    const body = await req.json();
    address = body.address;
    city = body.city;
    if (!address || typeof address !== 'string') throw new Error('Missing address');
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `请求参数无效: ${(e as Error).message}` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // 优先使用直接 AK，回退到 INTEGRATIONS_API_KEY 网关
  const baiduAk = Deno.env.get('BAIDU_MAP_AK');
  const integKey = Deno.env.get('INTEGRATIONS_API_KEY');

  const params = new URLSearchParams({ address, output: 'json', ret_coordtype: 'bd09ll' });
  if (city) params.set('city', city);

  console.log(`[geocoding] 解析地址: ${address}${city ? ` (${city})` : ''}, ak=${baiduAk ? 'direct' : 'gateway'}`);

  try {
    let upstream: Response;
    if (baiduAk) {
      // 直接调用百度地图开放平台
      params.set('ak', baiduAk);
      upstream = await fetch(
        `https://api.map.baidu.com/geocoding/v3/?${params.toString()}`,
      );
    } else if (integKey) {
      // 回退：通过秒哒平台网关
      upstream = await fetch(
        `https://app-cbrme32s08ox-api-GaDwZ0j3erOY-gateway.appmiaoda.com/geocoding/v3/?${params.toString()}`,
        { method: 'GET', headers: { 'X-Gateway-Authorization': `Bearer ${integKey}` } },
      );
    } else {
      return new Response(
        JSON.stringify({ error: '服务配置错误：缺少 AK' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (upstream.status === 429 || upstream.status === 402) {
      const errText = await upstream.text();
      return new Response(errText, {
        status: upstream.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `上游错误: ${upstream.status}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const data = await upstream.json();
    console.log(`[geocoding] 结果: status=${data.status}, loc=${JSON.stringify(data.result?.location)}`);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[geocoding] 内部错误:', e);
    return new Response(
      JSON.stringify({ error: '内部错误，请稍后重试', detail: (e as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
