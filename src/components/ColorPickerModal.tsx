/**
 * ColorPickerModal — HSV 色盘选色弹窗
 * 兼容 iOS / Android / Web，纯 JS 实现，无需原生模块
 * 布局：色相滑条 → SV 矩形渐变 → 明度滑条 → 预设快捷色板 → 预览确认
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, Modal, PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Check } from 'lucide-react-native';

// ── HSV ↔ HEX 工具 ────────────────────────────────────────────────
function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)        { r = c; g = x; b = 0; }
  else if (h < 120)  { r = x; g = c; b = 0; }
  else if (h < 180)  { r = 0; g = c; b = x; }
  else if (h < 240)  { r = 0; g = x; b = c; }
  else if (h < 300)  { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgb2hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

function hex2hsv(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [0, 1, 0.8];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

// ── 快捷预设色 ──────────────────────────────────────────────────────
const PRESETS = [
  '#E05555','#E07A35','#D4B430','#6AAD6A','#3D9AC0',
  '#7B5EA7','#C06090','#8B5E3C','#607080','#445566',
  '#FFFFFF','#DDDDDD','#AAAAAA','#666666','#222222',
];

// ── 主组件 ────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  initialColor: string;
  onClose: () => void;
  onSelect: (hex: string) => void;
}

export default function ColorPickerModal({ visible, initialColor, onClose, onSelect }: Props) {
  const [initH, initS, initV] = hex2hsv(initialColor || '#8B5E3C');
  const [hue, setHue] = useState(initH);
  const [sat, setSat] = useState(initS);
  const [val, setVal] = useState(initV);

  // 重置当弹窗打开时同步初始值
  const onShow = useCallback(() => {
    const [h, s, v] = hex2hsv(initialColor || '#8B5E3C');
    setHue(h); setSat(s); setVal(v);
  }, [initialColor]);

  const [rgb] = [hsv2rgb(hue, sat, val)];
  const currentHex = rgb2hex(...hsv2rgb(hue, sat, val));
  const pureHueHex = rgb2hex(...hsv2rgb(hue, 1, 1));

  // ── 色相滑条 (0-360) ──────────────────────────────────────────
  const hueBarW = useRef(0);
  const huePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const x = e.nativeEvent.locationX;
        setHue(Math.min(360, Math.max(0, (x / hueBarW.current) * 360)));
      },
      onPanResponderMove: e => {
        const x = e.nativeEvent.locationX;
        setHue(Math.min(360, Math.max(0, (x / hueBarW.current) * 360)));
      },
    })
  ).current;

  // ── 明度滑条 (0-1) ────────────────────────────────────────────
  const valBarW = useRef(0);
  const valPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const x = e.nativeEvent.locationX;
        setVal(Math.min(1, Math.max(0, x / valBarW.current)));
      },
      onPanResponderMove: e => {
        const x = e.nativeEvent.locationX;
        setVal(Math.min(1, Math.max(0, x / valBarW.current)));
      },
    })
  ).current;

  // ── SV 矩形面板 ───────────────────────────────────────────────
  const svW = useRef(0), svH = useRef(0);
  const svPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY;
        setSat(Math.min(1, Math.max(0, x / svW.current)));
        setVal(Math.min(1, Math.max(0, 1 - y / svH.current)));
      },
      onPanResponderMove: e => {
        const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY;
        setSat(Math.min(1, Math.max(0, x / svW.current)));
        setVal(Math.min(1, Math.max(0, 1 - y / svH.current)));
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="slide" onShow={onShow} onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        onPress={onClose}>
        <Pressable
          style={{ backgroundColor: '#FDF9F5', borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 22, paddingBottom: 68 }}
          onPress={() => {}}>

          {/* 标题栏 */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2E1B0E' }}>选择颜色</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <X size={20} color="#8B7A6A" />
            </Pressable>
          </View>

          {/* SV 矩形面板 */}
          <View
            onLayout={(e: LayoutChangeEvent) => {
              svW.current = e.nativeEvent.layout.width;
              svH.current = e.nativeEvent.layout.height;
            }}
            style={{ width: '100%', height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}
            {...svPan.panHandlers}
          >
            {/* 左→右：白 → 纯色 */}
            <LinearGradient colors={['#FFFFFF', pureHueHex]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', inset: 0 as any, width: '100%', height: '100%' }} />
            {/* 上→下：透明 → 黑 */}
            <LinearGradient colors={['transparent', '#000000']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={{ position: 'absolute', inset: 0 as any, width: '100%', height: '100%' }} />
            {/* 选色游标 */}
            <View pointerEvents="none" style={{
              position: 'absolute',
              left: sat * (svW.current || 280) - 11,
              top: (1 - val) * (svH.current || 180) - 11,
              width: 22, height: 22, borderRadius: 11,
              borderWidth: 2.5, borderColor: '#fff',
              backgroundColor: currentHex,
              boxShadow: '0px 2px 6px rgba(0,0,0,0.4)',
            }} />
          </View>

          {/* 色相滑条 */}
          <Text style={{ fontSize: 11, color: '#8B7A6A', fontWeight: '600', marginBottom: 6 }}>色相</Text>
          <View
            onLayout={(e: LayoutChangeEvent) => { hueBarW.current = e.nativeEvent.layout.width; }}
            style={{ width: '100%', height: 26, borderRadius: 13, overflow: 'hidden', marginBottom: 14 }}
            {...huePan.panHandlers}
          >
            <LinearGradient
              colors={['#FF0000','#FFFF00','#00FF00','#00FFFF','#0000FF','#FF00FF','#FF0000']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flex: 1 }} />
            {/* 游标 */}
            <View pointerEvents="none" style={{
              position: 'absolute',
              left: (hue / 360) * (hueBarW.current || 280) - 11,
              top: 1,
              width: 24, height: 24, borderRadius: 12,
              borderWidth: 2.5, borderColor: '#fff',
              backgroundColor: pureHueHex,
              boxShadow: '0px 2px 6px rgba(0,0,0,0.35)',
            }} />
          </View>

          {/* 明度滑条 */}
          <Text style={{ fontSize: 11, color: '#8B7A6A', fontWeight: '600', marginBottom: 6 }}>明度</Text>
          <View
            onLayout={(e: LayoutChangeEvent) => { valBarW.current = e.nativeEvent.layout.width; }}
            style={{ width: '100%', height: 26, borderRadius: 13, overflow: 'hidden', marginBottom: 18 }}
            {...valPan.panHandlers}
          >
            <LinearGradient
              colors={['#000000', pureHueHex]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flex: 1 }} />
            <View pointerEvents="none" style={{
              position: 'absolute',
              left: val * (valBarW.current || 280) - 11,
              top: 1,
              width: 24, height: 24, borderRadius: 12,
              borderWidth: 2.5, borderColor: '#fff',
              backgroundColor: currentHex,
              boxShadow: '0px 2px 6px rgba(0,0,0,0.35)',
            }} />
          </View>

          {/* 快捷预设色板 */}
          <Text style={{ fontSize: 11, color: '#8B7A6A', fontWeight: '600', marginBottom: 8 }}>快捷颜色</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {PRESETS.map(c => {
              const [ph, ps, pv] = hex2hsv(c);
              const selected = Math.abs(ph - hue) < 5 && Math.abs(ps - sat) < 0.05 && Math.abs(pv - val) < 0.05;
              return (
                <Pressable key={c} onPress={() => { const [h, s, v] = hex2hsv(c); setHue(h); setSat(s); setVal(v); }}
                  style={{ width: 30, height: 30, borderRadius: 15,
                    backgroundColor: c,
                    borderWidth: selected ? 3 : 1.5,
                    borderColor: selected ? '#2E1B0E' : 'rgba(0,0,0,0.12)',
                    boxShadow: '0px 1px 3px rgba(0,0,0,0.2)' }} />
              );
            })}
          </View>

          {/* 预览 + 确认 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: currentHex,
              borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)',
              boxShadow: '0px 2px 8px rgba(0,0,0,0.2)' }} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#5A4A3A',
              fontVariant: ['tabular-nums'], letterSpacing: 1 }}>
              {currentHex.toUpperCase()}
            </Text>
            <Pressable onPress={() => { onSelect(currentHex); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: '#8B5E3C', paddingHorizontal: 20, paddingVertical: 12,
                borderRadius: 14 }}>
              <Check size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>确认</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
