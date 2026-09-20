/**
 * love-map.tsx — 关系定位地图（全屏地图版）
 * 地图全屏铺底 + 悬浮按钮（+/定位/AI/列表）+ 纯净模式 + 百度地理编码定位我的位置
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput,
  ActivityIndicator, Modal, FlatList, useWindowDimensions,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import WebView from 'react-native-webview';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Plus, X, Check, Sparkles, MapPin, Trash2, Edit2,
  LocateFixed, List, Eye, EyeOff,
} from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/client/supabase';
import { streamAiChat } from '@/lib/aiStream';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';
import { useSession } from '@/ctx';

// ── 类型定义 ────────────────────────────────────────────────────
interface RelLocation {
  id: string;
  node_id: string | null;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geocoded_lat: number | null;
  geocoded_lng: number | null;
  psychological_distance: number;
  ai_advice: string;
}

// ── 地理编码（Edge Function → 百度地图 API）─────────────────────
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('geocoding', {
      body: { address },
    });
    if (error) throw error;
    if (data?.status !== 0) return null;
    return { lat: data.result.location.lat, lng: data.result.location.lng };
  } catch (e) {
    console.warn('[love-map] geocode failed:', e);
    return null;
  }
}

// ── 工具函数 ─────────────────────────────────────────────────────
function distColor(dist: number): string {
  const colors = ['#E06A8C','#E88090','#E09070','#D4A860','#B8B860','#80B880','#60A8B0','#5090C8','#4878C0','#3060B0'];
  return colors[Math.max(0, Math.min(9, dist - 1))];
}

function distLabel(dist: number): string {
  if (dist <= 2) return '心心相印';
  if (dist <= 4) return '亲密无间';
  if (dist <= 6) return '保持距离';
  if (dist <= 8) return '渐行渐远';
  return '形同陌路';
}

const THEME = {
  primary: '#5B9BD5',
  text: '#0A2040',
  sub: '#4A7CB8',
  cardBorder: '#B8D8F5',
};

// ── Leaflet + 高德瓦片 HTML 构建 ─────────────────────────────────
interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  color: string;
  dist: number;
  distLabel: string;
  isMe?: boolean;
}

function buildLeafletHtml(markers: MapMarker[]): string {
  let centerLat = 35.5;
  let centerLng = 103.8;
  let zoom = 4;

  if (markers.length === 1) {
    centerLat = markers[0].lat;
    centerLng = markers[0].lng;
    zoom = 11;
  } else if (markers.length > 1) {
    centerLat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
    centerLng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
    const lngSpan = Math.max(...markers.map(m => m.lng)) - Math.min(...markers.map(m => m.lng));
    const latSpan = Math.max(...markers.map(m => m.lat)) - Math.min(...markers.map(m => m.lat));
    const span = Math.max(lngSpan, latSpan);
    zoom = span > 20 ? 4 : span > 10 ? 5 : span > 5 ? 6 : span > 2 ? 7 : span > 0.5 ? 9 : 11;
  }

  const markersJson = JSON.stringify(markers);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#D8EBF8}
  .custom-pin{width:32px;height:40px;position:relative;cursor:pointer}
  .pin-circle{width:26px;height:26px;border-radius:50%;border:3px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;
    justify-content:center;font-size:11px;color:#fff;font-weight:700;
    position:absolute;top:0;left:3px}
  .pin-tail{width:0;height:0;border-left:5px solid transparent;
    border-right:5px solid transparent;border-top:10px solid;
    position:absolute;top:22px;left:8px}
  .me-pin{width:28px;height:28px;border-radius:50%;background:#5B9BD5;
    border:3px solid #fff;box-shadow:0 0 0 4px rgba(91,155,213,0.3),0 2px 8px rgba(0,0,0,0.25);
    display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer}
  .leaflet-popup-content-wrapper{border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.18)}
  .leaflet-popup-content{margin:10px 14px;min-width:120px}
  .pop-title{font-size:14px;font-weight:700;color:#0A2040;margin-bottom:4px}
  .pop-sub{font-size:11px;color:#4A7CB8}
  .pop-badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;margin-top:5px;color:#fff}
  #loading{position:fixed;inset:0;background:#D8EBF8;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999}
  .spin{width:36px;height:36px;border:4px solid #B8D8F5;border-top-color:#5B9BD5;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  #load-text{margin-top:12px;font-size:13px;color:#5B9BD5;font-family:sans-serif}
  .leaflet-control-zoom{border:none!important;box-shadow:0 2px 12px rgba(0,0,0,0.15)!important}
  .leaflet-control-zoom a{border-radius:8px!important;border:none!important;width:32px!important;height:32px!important;line-height:32px!important;font-size:16px!important;color:#0A2040!important;background:#fff!important}
</style>
</head>
<body>
<div id="loading"><div class="spin"></div><div id="load-text">地图加载中…</div></div>
<div id="map"></div>
<script>
(function(){
  var MARKERS=${markersJson};
  var CENTER=[${centerLat},${centerLng}];
  var ZOOM=${zoom};
  var TILE='https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
  function initMap(){
    try{
      var map=L.map('map',{center:CENTER,zoom:ZOOM,zoomControl:true,attributionControl:false});
      L.tileLayer(TILE,{subdomains:['1','2','3','4'],maxZoom:18,minZoom:3}).addTo(map);
      var relIdx=0;
      MARKERS.forEach(function(m){
        var icon;
        if(m.isMe){
          icon=L.divIcon({html:'<div class="me-pin">📍</div>',className:'',iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-18]});
        } else {
          relIdx++;
          var h='<div class="custom-pin"><div class="pin-circle" style="background:'+m.color+'">'+relIdx+'</div><div class="pin-tail" style="border-top-color:'+m.color+'"></div></div>';
          icon=L.divIcon({html:h,className:'',iconSize:[32,40],iconAnchor:[16,40],popupAnchor:[0,-44]});
        }
        var mk=L.marker([m.lat,m.lng],{icon:icon}).addTo(map);
        if(m.isMe){
          mk.bindPopup('<div class="pop-title">📍 我的位置</div><div class="pop-sub">'+m.label+'</div>');
        } else {
          mk.bindPopup('<div class="pop-title">'+m.label+'</div><div class="pop-sub">心理距离 '+m.dist+'/10</div><span class="pop-badge" style="background:'+m.color+'">'+m.distLabel+'</span>');
        }
      });
      if(MARKERS.length>1){
        map.fitBounds(MARKERS.map(function(m){return[m.lat,m.lng];}),{padding:[40,40]});
      }
      document.getElementById('loading').style.display='none';
    }catch(e){
      document.getElementById('load-text').textContent='地图初始化失败，请重试';
    }
  }
  if(typeof L!=='undefined'){initMap();}
  else{
    var t=setInterval(function(){if(typeof L!=='undefined'){clearInterval(t);initMap();}},100);
    setTimeout(function(){clearInterval(t);document.getElementById('load-text').textContent='⚠️ 网络较慢，地图加载中…';},10000);
  }
})();
</script>
</body>
</html>`;
}

// ── 全屏地图组件 ──────────────────────────────────────────────
function FullScreenMap({
  locations,
  myLocation,
}: {
  locations: RelLocation[];
  myLocation: { lat: number; lng: number; city: string } | null;
}) {
  const geocodedLocs = locations.filter(l => l.geocoded_lat != null && l.geocoded_lng != null);

  const markers: MapMarker[] = geocodedLocs.map(loc => {
    const dist = loc.psychological_distance;
    return {
      lat: loc.geocoded_lat!, lng: loc.geocoded_lng!,
      label: loc.label, color: distColor(dist),
      dist, distLabel: distLabel(dist),
    };
  });

  if (myLocation) {
    markers.unshift({
      lat: myLocation.lat, lng: myLocation.lng,
      label: myLocation.city, color: '#5B9BD5',
      dist: 0, distLabel: '我的位置', isMe: true,
    });
  }

  const html = buildLeafletHtml(markers);

  if (process.env.EXPO_OS !== 'web') {
    return (
      <WebView
        source={{ html }}
        style={{ flex: 1 }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <iframe
      srcDoc={html}
      style={{ width: '100%', height: '100%', border: 'none' }}
      title="关系地图"
    />
  );
}

// ── 可拖动纯净模式按钮（Gesture + Reanimated）────────────────────
function DraggablePureButton({
  pureMode, onToggle, screenW, screenH,
}: { pureMode: boolean; onToggle: () => void; screenW: number; screenH: number }) {
  const BTN = 44, MARGIN = 8;
  const posX = useSharedValue(screenW - BTN - MARGIN - 16);
  const posY = useSharedValue(60);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const iconOpacity = useSharedValue(1);

  // 纯净模式时图标半透明
  React.useEffect(() => {
    iconOpacity.value = withTiming(pureMode ? 0.65 : 1, { duration: 200 });
  }, [pureMode]);

  const tap = Gesture.Tap()
    .maxDistance(8)
    .onEnd(() => { runOnJS(onToggle)(); });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => { startX.value = posX.value; startY.value = posY.value; })
    .onUpdate(e => {
      posX.value = Math.max(MARGIN, Math.min(screenW - BTN - MARGIN, startX.value + e.translationX));
      posY.value = Math.max(MARGIN + 44, Math.min(screenH - BTN - MARGIN - 20, startY.value + e.translationY));
    });

  const composed = Gesture.Exclusive(tap, pan);

  const animStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: posX.value,
    top: posY.value,
    zIndex: 9999,
  }));
  const iconStyle = useAnimatedStyle(() => ({ opacity: iconOpacity.value }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={animStyle}>
        <View style={{
          width: BTN, height: BTN, borderRadius: BTN / 2,
          backgroundColor: pureMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.38)',
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: pureMode ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)',
          boxShadow: '0px 3px 12px rgba(0,0,0,0.30)',
        }}>
          <Animated.View style={iconStyle}>
            {pureMode ? <Eye size={18} color="#fff" /> : <EyeOff size={18} color="#fff" />}
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────
export default function LoveMapScreen() {
  const router = useRouter();
  useSession();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [locations, setLocations] = useState<RelLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // 模态面板
  const [showAdd, setShowAdd] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showLocInput, setShowLocInput] = useState(false);

  // 纯净模式
  const [pureMode, setPureMode] = useState(false);

  // 编辑状态
  const [editLoc, setEditLoc] = useState<RelLocation | null>(null);

  // 加载状态
  const [aiLoading, setAiLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  // 我的位置（百度地理编码）
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number; city: string } | null>(null);
  const [cityInput, setCityInput] = useState('');

  const emptyForm = () => ({ label: '', address: '', psychological_distance: 5, ai_advice: '' });
  const [form, setForm] = useState(emptyForm());

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('relationship_locations').select('*').order('created_at');
      setLocations((data ?? []) as RelLocation[]);
      setLoading(false);
    })();
  }, []));

  // ── 保存地点 ─────────────────────────────────────────────────
  const saveLoc = async () => {
    if (!form.label.trim() || !form.address.trim()) return;
    setGeoLoading(true);
    const coords = await geocodeAddress(form.address.trim());
    setGeoLoading(false);

    const payload = {
      label: form.label.trim(),
      address: form.address.trim(),
      psychological_distance: form.psychological_distance,
      geocoded_lat: coords?.lat ?? null,
      geocoded_lng: coords?.lng ?? null,
    };

    if (editLoc) {
      const { data } = await supabase.from('relationship_locations')
        .update(payload).eq('id', editLoc.id).select().single();
      if (data) setLocations(prev => prev.map(l => l.id === editLoc.id ? data as RelLocation : l));
    } else {
      const { data } = await supabase.from('relationship_locations')
        .insert({ ...payload, ai_advice: '' }).select().single();
      if (data) setLocations(prev => [...prev, data as RelLocation]);
    }
    setShowAdd(false);
    setEditLoc(null);
    setForm(emptyForm());
  };

  const deleteLoc = async (id: string) => {
    await supabase.from('relationship_locations').delete().eq('id', id);
    setLocations(prev => prev.filter(l => l.id !== id));
  };

  // ── 定位我的城市（百度地理编码）─────────────────────────────
  const locateByCity = async () => {
    if (!cityInput.trim()) return;
    setLocating(true);
    try {
      const coords = await geocodeAddress(cityInput.trim());
      if (coords) {
        setMyLocation({ lat: coords.lat, lng: coords.lng, city: cityInput.trim() });
        setShowLocInput(false);
        setCityInput('');
      }
    } catch (e) {
      console.warn('[love-map] 城市定位失败:', e);
    } finally {
      setLocating(false);
    }
  };

  // ── AI 建议 ──────────────────────────────────────────────────
  const getAiAdvice = async () => {
    if (locations.length === 0) return;
    setAiLoading(true);

    // 校验并扣减每日 AI 积分（每次建议消耗 5 点积分）
    const quota = await checkAndConsumeCredits(5);
    if (!quota.allowed) {
      console.warn(quota.message);
      setAiLoading(false);
      return;
    }

    const summary = locations.map(l =>
      `${l.label}（${l.address}）：心理距离=${l.psychological_distance}/10（${distLabel(l.psychological_distance)}）`
    ).join('\n');
    try {
      const advice = await streamAiChat({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '你是一位关系咨询师，根据用户与亲密对象的物理地址和心理距离，给出温暖而有针对性的关系维护建议。对每段关系给出1句简短建议，总字数不超过180字。' },
          { role: 'user', content: `我的关系定位：\n${summary}` },
        ],
      });
      if (locations.length > 0 && advice.trim()) {
        await supabase.from('relationship_locations').update({ ai_advice: advice }).eq('id', locations[0].id);
        setLocations(prev => prev.map((l, i) => i === 0 ? { ...l, ai_advice: advice } : l));
      }
    } catch (e) {
      console.error('[love-map] AI建议失败:', e);
    } finally {
      setAiLoading(false);
    }
  };

  const globalAdvice = locations.find(l => l.ai_advice)?.ai_advice;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* ── 全屏地图铺底 ── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <FullScreenMap locations={locations} myLocation={myLocation} />
      </View>

      {/* ── 可拖动纯净模式按钮（始终显示，可任意拖动） ── */}
      <DraggablePureButton
        pureMode={pureMode}
        onToggle={() => setPureMode(v => !v)}
        screenW={screenW}
        screenH={screenH}
      />

      {/* ── 正常模式 UI ── */}
      {!pureMode && (
        <>
          {/* 半透明顶部栏 */}
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'rgba(255,255,255,0.88)',
            borderBottomWidth: 1, borderBottomColor: 'rgba(184,216,245,0.5)',
          }}>
            <Pressable onPress={() => router.back()} style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(91,155,213,0.15)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <ArrowLeft size={20} color={THEME.primary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: THEME.text }}>🗺️ 关系定位地图</Text>
            </View>
          </View>

          {/* 右侧悬浮按钮组 */}
          <View style={{
            position: 'absolute', right: 16, bottom: 100,
            alignItems: 'center', gap: 10,
          }}>
            {/* 添加 */}
            <Pressable onPress={() => { setEditLoc(null); setForm(emptyForm()); setShowAdd(true); }} style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: THEME.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28, shadowRadius: 8,
            }}>
              <Plus size={24} color="#fff" />
            </Pressable>

            {/* 定位我 */}
            <Pressable onPress={() => setShowLocInput(true)} style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: '#fff',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15, shadowRadius: 4,
            }}>
              {locating
                ? <ActivityIndicator size="small" color={THEME.primary} />
                : <LocateFixed size={20} color={THEME.primary} />
              }
            </Pressable>

            {/* AI 建议 */}
            <Pressable onPress={() => setShowAiPanel(true)} style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: '#fff',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15, shadowRadius: 4,
            }}>
              <Sparkles size={20} color="#E06A8C" />
            </Pressable>

            {/* 列表 */}
            <Pressable onPress={() => setShowList(true)} style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: '#fff',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15, shadowRadius: 4,
            }}>
              <List size={20} color={THEME.sub} />
            </Pressable>
          </View>

          {/* 加载 & 状态提示（左下角） */}
          {loading && (
            <View style={{
              position: 'absolute', bottom: 90, left: 16,
              backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99,
              paddingHorizontal: 12, paddingVertical: 6,
              flexDirection: 'row', alignItems: 'center', gap: 6,
            }}>
              <ActivityIndicator size="small" color={THEME.primary} />
              <Text style={{ fontSize: 11, color: THEME.sub }}>加载中…</Text>
            </View>
          )}
          {!loading && locations.length === 0 && (
            <View style={{
              position: 'absolute', bottom: 90, left: 16, right: 72,
              backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14,
              paddingHorizontal: 14, paddingVertical: 10,
            }}>
              <Text style={{ fontSize: 13, color: THEME.sub }}>
                点击右侧 <Text style={{ fontWeight: '700', color: THEME.primary }}>+</Text> 添加关系人位置
              </Text>
            </View>
          )}
          {!loading && locations.some(l => l.geocoded_lat == null && l.address.trim()) && (
            <View style={{
              position: 'absolute', bottom: 90, left: 16,
              backgroundColor: 'rgba(255,248,232,0.95)', borderRadius: 99,
              paddingHorizontal: 12, paddingVertical: 6,
              flexDirection: 'row', alignItems: 'center', gap: 6,
            }}>
              <ActivityIndicator size="small" color="#D4A020" />
              <Text style={{ fontSize: 11, color: '#D4A020' }}>部分地点坐标待解析</Text>
            </View>
          )}
        </>
      )}

      {/* ── Modal：定位我的城市 ── */}
      <Modal visible={showLocInput} transparent animationType="fade"
        onRequestClose={() => setShowLocInput(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowLocInput(false)}
        >
          <Pressable style={{
            backgroundColor: '#fff', borderRadius: 20,
            padding: 24, width: '80%', gap: 14,
          }} onPress={() => {}}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: THEME.text }}>📍 定位我的位置</Text>
            <Text style={{ fontSize: 12, color: THEME.sub }}>输入你所在的城市，将在地图标注「我的位置」</Text>
            <TextInput
              value={cityInput}
              onChangeText={setCityInput}
              placeholder="例如：北京市 / 上海 / 成都"
              placeholderTextColor={THEME.sub + '80'}
              style={{
                backgroundColor: '#EAF5FF', borderRadius: 12,
                borderWidth: 1.5, borderColor: THEME.cardBorder,
                paddingHorizontal: 14, paddingVertical: 11,
                fontSize: 14, color: THEME.text,
              }}
              returnKeyType="done"
              onSubmitEditing={locateByCity}
            />
            <Pressable onPress={locateByCity} disabled={locating} style={{
              borderRadius: 12, backgroundColor: THEME.primary,
              paddingVertical: 12, alignItems: 'center',
            }}>
              {locating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>确认定位</Text>
              }
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal：添加/编辑位置 ── */}
      <Modal visible={showAdd} transparent animationType="slide"
        onRequestClose={() => { setShowAdd(false); setEditLoc(null); }}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => { setShowAdd(false); setEditLoc(null); }}
        >
          <Pressable style={{
            backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 24, paddingBottom: 44,
          }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text }}>
                {editLoc ? '编辑位置' : '添加关系人位置'}
              </Text>
              <Pressable onPress={() => { setShowAdd(false); setEditLoc(null); }}>
                <X size={22} color={THEME.sub} />
              </Pressable>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 6 }}>对象姓名/标签 *</Text>
            <TextInput
              value={form.label} onChangeText={v => setForm(f => ({ ...f, label: v }))}
              placeholder="ta 的名字" placeholderTextColor={THEME.sub + '80'}
              style={{
                backgroundColor: '#EAF5FF', borderRadius: 12, borderWidth: 1.5,
                borderColor: THEME.cardBorder, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 14, color: THEME.text, marginBottom: 14,
              }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 6 }}>所在城市/地址 *</Text>
            <TextInput
              value={form.address} onChangeText={v => setForm(f => ({ ...f, address: v }))}
              placeholder="例如：北京市 / 上海市浦东新区" placeholderTextColor={THEME.sub + '80'}
              style={{
                backgroundColor: '#EAF5FF', borderRadius: 12, borderWidth: 1.5,
                borderColor: THEME.cardBorder, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 14, color: THEME.text, marginBottom: 4,
              }}
            />
            <Text style={{ fontSize: 10, color: THEME.sub, marginBottom: 14, marginLeft: 4 }}>
              📌 保存时将自动通过百度地理编码解析坐标，标注到地图
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: THEME.sub, marginBottom: 8 }}>
              心理距离 {form.psychological_distance}/10 · {distLabel(form.psychological_distance)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <Pressable key={i} onPress={() => setForm(f => ({ ...f, psychological_distance: i + 1 }))} style={{
                  flex: 1, height: 32, borderRadius: 8,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: i + 1 <= form.psychological_distance ? distColor(i + 1) : '#E0EEF8',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: i + 1 <= form.psychological_distance ? '#fff' : THEME.sub }}>
                    {i + 1}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={saveLoc} disabled={geoLoading} style={{
              borderRadius: 16,
              backgroundColor: geoLoading ? THEME.primary + '80' : THEME.primary,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 14,
            }}>
              {geoLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Check size={18} color="#fff" />
              }
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {geoLoading ? '正在定位坐标…' : editLoc ? '保存修改' : '添加到地图'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal：关系人列表 ── */}
      <Modal visible={showList} transparent animationType="slide"
        onRequestClose={() => setShowList(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setShowList(false)}
        >
          <Pressable style={{
            backgroundColor: '#F0F7FF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingTop: 20, paddingBottom: 44, maxHeight: '75%',
          }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: THEME.text }}>
                📍 关系人位置（{locations.length}）
              </Text>
              <Pressable onPress={() => setShowList(false)}>
                <X size={22} color={THEME.sub} />
              </Pressable>
            </View>

            {/* 颜色图例 */}
            <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12 }}>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: distColor(i + 1) }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                <Text style={{ fontSize: 9, color: THEME.sub }}>亲密</Text>
                <Text style={{ fontSize: 9, color: THEME.sub }}>疏远</Text>
              </View>
            </View>

            <FlatList
              data={locations}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}
              renderItem={({ item: loc }) => {
                const color = distColor(loc.psychological_distance);
                return (
                  <View style={{
                    backgroundColor: '#fff', borderRadius: 16,
                    borderWidth: 1.5, borderColor: color + '50', padding: 14,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <View style={{
                        width: 40, height: 40, borderRadius: 20,
                        backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <MapPin size={18} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.text }}>{loc.label}</Text>
                        <Text style={{ fontSize: 12, color: THEME.sub, marginTop: 1 }}>
                          {loc.address}
                          {loc.geocoded_lat != null && (
                            <Text style={{ fontSize: 9, color: THEME.primary }}> ✓ 已定位</Text>
                          )}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <View style={{ flex: 1, height: 5, backgroundColor: '#E0EEF8', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ width: `${loc.psychological_distance * 10}%`, height: 5, backgroundColor: color, borderRadius: 3 }} />
                          </View>
                          <Text style={{ fontSize: 10, color, fontWeight: '700' }}>{distLabel(loc.psychological_distance)}</Text>
                        </View>
                      </View>
                      <View style={{ gap: 10 }}>
                        <Pressable onPress={() => {
                          setEditLoc(loc);
                          setForm({ label: loc.label, address: loc.address, psychological_distance: loc.psychological_distance, ai_advice: '' });
                          setShowList(false);
                          setShowAdd(true);
                        }}>
                          <Edit2 size={15} color={THEME.sub} />
                        </Pressable>
                        <Pressable onPress={() => deleteLoc(loc.id)}>
                          <Trash2 size={15} color="#E06A8C" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🗺️</Text>
                  <Text style={{ fontSize: 14, color: THEME.sub }}>还没有地点记录</Text>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal：AI 建议面板 ── */}
      <Modal visible={showAiPanel} transparent animationType="slide"
        onRequestClose={() => setShowAiPanel(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setShowAiPanel(false)}
        >
          <Pressable style={{
            backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 24, paddingBottom: 44,
          }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: THEME.text }}>✨ AI 关系维护建议</Text>
              <Pressable onPress={() => setShowAiPanel(false)}>
                <X size={22} color={THEME.sub} />
              </Pressable>
            </View>

            {globalAdvice ? (
              <View style={{
                backgroundColor: '#E8F5FF', borderRadius: 16,
                borderWidth: 1, borderColor: THEME.cardBorder, padding: 16, marginBottom: 16,
              }}>
                <Text style={{ fontSize: 13, color: THEME.text, lineHeight: 22 }}>{globalAdvice}</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: THEME.sub, marginBottom: 16, lineHeight: 20 }}>
                {locations.length === 0
                  ? '请先添加关系人位置，再获取 AI 建议'
                  : '点击下方按钮，AI 将根据地理位置和心理距离给出维护建议'}
              </Text>
            )}

            <Pressable onPress={getAiAdvice} disabled={aiLoading || locations.length === 0} style={{
              borderRadius: 16,
              backgroundColor: (aiLoading || locations.length === 0) ? THEME.primary + '60' : THEME.primary,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 14, marginBottom: 10,
            }}>
              {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Sparkles size={18} color="#fff" />}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {aiLoading ? '分析中…' : globalAdvice ? '重新生成建议' : '获取 AI 建议'}
              </Text>
            </Pressable>

            <Pressable onPress={() => {
              setShowAiPanel(false);
              router.push('/(app)/chat/satir' as RelativePathString);
            }} style={{
              borderRadius: 16, backgroundColor: '#FFF0F5',
              borderWidth: 1.5, borderColor: '#F5C8D8',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 12,
            }}>
              <Text style={{ fontSize: 16 }}>🌸</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#E06A8C' }}>与萨提亚探讨这段关系</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
