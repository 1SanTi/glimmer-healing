/**
 * DrawingCanvas v5
 * - 精简底部胶囊（6键不换行）+ 次要功能收进"更多"弹层
 * - 纯净模式改为可拖动浮标（EyeOff 圆形小按钮，任意位置拖放）
 * - 面板在胶囊上方展开，不遮挡任何按钮
 * - Pinch 以双指中心为焦点缩放（focalX/focalY 算法）
 * - v5 修复：
 *   1. panGesture 改读 lockedSV.value（worklet安全），不再读 JS 闭包 locked
 *   2. pinch 变换完全在 UI 线程（SharedValue + useAnimatedStyle），去除高频 runOnJS
 *   3. 色盘明度条改用纯色相渐变（s=1），与色相环颜色一致
 *   4. 锁定按钮直接设 lockedSV.value，不再依赖异步 useEffect 同步
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, Pressable, ActivityIndicator,
  useWindowDimensions, Modal,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Svg, {
  Path as SvgPath, Rect, Defs,
  RadialGradient as SvgRadialGradient,
  LinearGradient as SvgLinearGradient,
  Stop, Circle as SvgCircle,
} from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import {
  Eraser, Trash2, RotateCcw, Pencil, Pen, Brush,
  CircleDot, Lock, Unlock, Eye, EyeOff,
  Download, Sparkles, Square, MoreHorizontal,
} from 'lucide-react-native';

// ── 预设颜色 ──────────────────────────────────────────────────────
export const CANVAS_COLORS = [
  '#1F2937', '#DC2626', '#2563EB', '#16A34A',
  '#9333EA', '#D97706', '#EC4899', '#0EA5E9',
  '#6366F1', '#F59E0B', '#84CC16', '#14B8A6',
  '#F97316', '#FFFFFF',
];

// ── 材质 ──────────────────────────────────────────────────────────
export type BrushTexture = 'pencil' | 'pen' | 'brush' | 'crayon';
const TEXTURES: { id: BrushTexture; label: string; Icon: any }[] = [
  { id: 'pencil', label: '铅笔', Icon: Pencil },
  { id: 'pen',    label: '钢笔', Icon: Pen },
  { id: 'brush',  label: '毛笔', Icon: Brush },
  { id: 'crayon', label: '蜡笔', Icon: Square },
];
function getStrokeProps(texture: BrushTexture, base: number) {
  switch (texture) {
    case 'pencil': return { w: base * 0.75, op: 0.8,  dash: `${base * 0.8},${base * 0.2}` };
    case 'pen':    return { w: base * 0.55, op: 1.0,  dash: undefined };
    case 'brush':  return { w: base * 2.0,  op: 0.75, dash: undefined };
    case 'crayon': return { w: base * 2.4,  op: 0.55, dash: `${base * 1.5},${base * 0.6}` };
    default:       return { w: base,        op: 1.0,  dash: undefined };
  }
}

const SIZES = [{ r: 3, label: '细' }, { r: 6, label: '中' }, { r: 11, label: '粗' }];

// ── HSV → hex ────────────────────────────────────────────────────
function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

// ── HSV 色盘 ──────────────────────────────────────────────────────
// hex → [hue(0-360), sat(0-1), val(0-1)]
function hexToHsv(hex: string): [number, number, number] {
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
    h = ((h * 60) + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

const WHEEL_R = 90; const SLICES = 36;
function ColorWheel({ onSelect, currentColor }: { onSelect: (h: string) => void; currentColor: string }) {
  // 完整提取 HSV，明度条只改 V，不强制覆盖 S（原 bug：明度条写死 s=1）
  const [activeHue, setActiveHue] = useState(() => hexToHsv(currentColor)[0]);
  const [activeSat, setActiveSat] = useState(() => hexToHsv(currentColor)[1]);
  const [activeVal, setActiveVal] = useState(() => hexToHsv(currentColor)[2]);

  const size = WHEEL_R * 2; const cx = WHEEL_R; const cy = WHEEL_R;
  const outerR = WHEEL_R - 4; const innerR = WHEEL_R * 0.42;
  const sectors = Array.from({ length: SLICES }, (_, i) => {
    const a0 = (i / SLICES) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / SLICES) * 2 * Math.PI - Math.PI / 2;
    const hue = (i / SLICES) * 360;
    const x0o = cx + outerR * Math.cos(a0), y0o = cy + outerR * Math.sin(a0);
    const x1o = cx + outerR * Math.cos(a1), y1o = cy + outerR * Math.sin(a1);
    const x0i = cx + innerR * Math.cos(a0), y0i = cy + innerR * Math.sin(a0);
    const x1i = cx + innerR * Math.cos(a1), y1i = cy + innerR * Math.sin(a1);
    const d = `M ${x0o.toFixed(1)} ${y0o.toFixed(1)} A ${outerR} ${outerR} 0 0 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)} L ${x1i.toFixed(1)} ${y1i.toFixed(1)} A ${innerR} ${innerR} 0 0 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z`;
    return { d, fill: hsvToHex(hue, 1, 1) };
  });
  const BAR_W = size; const BAR_H = 22;
  // 明度条：固定用纯色相（s=1）渐变，与色相环外圈颜色保持一致
  // 修复：原用 activeSat 导致低饱和度时渐变条几乎全灰，与色相环颜色不对应
  const barDark   = hsvToHex(activeHue, 1, 0);
  const barBright = hsvToHex(activeHue, 1, 1);

  const handleTouch = useCallback((evt: any) => {
    const lx = evt.nativeEvent.locationX; const ly = evt.nativeEvent.locationY;
    if (ly < size) {
      const dx = lx - cx; const dy = ly - cy; const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= innerR && dist <= outerR) {
        // 色相环：只改 H，保留当前 S/V
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        setActiveHue(angle);
        onSelect(hsvToHex(angle, activeSat, activeVal));
      } else if (dist < innerR) {
        // 中心 SV 区：同时改 S 和 V
        const newS = Math.max(0, Math.min(1, (lx - (cx - innerR * 0.7)) / (innerR * 1.4)));
        const newV = Math.max(0, Math.min(1, 1 - (ly - (cy - innerR * 0.7)) / (innerR * 1.4)));
        setActiveSat(newS); setActiveVal(newV);
        onSelect(hsvToHex(activeHue, newS, newV));
      }
    } else {
      // 明度条：只改 V，保留 H 和 S（修复关键：不再强制 s=1）
      const t = Math.max(0, Math.min(1, lx / BAR_W));
      setActiveVal(t);
      onSelect(hsvToHex(activeHue, activeSat, t));
    }
  }, [cx, cy, outerR, innerR, size, BAR_W, activeHue, activeSat, activeVal, onSelect]);

  return (
    <View style={{ width: BAR_W, height: size + BAR_H + 12 }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgRadialGradient id="wh" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="white" stopOpacity="1" />
            <Stop offset="100%" stopColor="white" stopOpacity="0" />
          </SvgRadialGradient>
          <SvgLinearGradient id="bk" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="black" stopOpacity="0" />
            <Stop offset="100%" stopColor="black" stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        {sectors.map((s, i) => <SvgPath key={i} d={s.d} fill={s.fill} />)}
        <SvgCircle cx={cx} cy={cy} r={innerR - 1} fill="white" />
        <SvgCircle cx={cx} cy={cy} r={innerR - 1} fill="url(#wh)" />
        <SvgCircle cx={cx} cy={cy} r={innerR - 1} fill="url(#bk)" />
        <SvgCircle cx={cx} cy={cy} r={innerR - 1} fill="none" stroke="#E5E7EB" strokeWidth="1" />
      </Svg>
      {/* 明度条：颜色跟随当前选中色相 */}
      <Svg width={BAR_W} height={BAR_H} style={{ marginTop: 10 }}>
        <Defs>
          <SvgLinearGradient id="bright" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={barDark} />
            <Stop offset="100%" stopColor={barBright} />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={BAR_W} height={BAR_H} fill="url(#bright)" rx={BAR_H / 2} />
      </Svg>
      <Text style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginTop: 4 }}>← 暗  明度  亮 →</Text>
      <View style={{ position: 'absolute', top: WHEEL_R - 8, left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ fontSize: 10, color: '#6B7280' }}>触摸选色</Text>
      </View>
    </View>
  );
}

// ── 路径 & 类型 ───────────────────────────────────────────────────
type DrawnPath = { d: string; color: string; width: number; opacity: number; dashArray?: string };
type PanelType = null | 'brush' | 'color' | 'size' | 'more';

// ── 圆形工具按钮 ──────────────────────────────────────────────────
const BTN = 44;
function ToolBtn({
  onPress, active = false, danger = false, activeColor = '#6366F1', disabled = false, children,
}: { onPress: () => void; active?: boolean; danger?: boolean; activeColor?: string; disabled?: boolean; children: React.ReactNode }) {
  const bg = disabled ? 'rgba(240,240,240,0.7)' : danger ? '#FFF1F2' : active ? activeColor : 'rgba(255,255,255,0.95)';
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={{
      width: BTN, height: BTN, borderRadius: BTN / 2,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: active && !danger ? 'transparent' : 'rgba(0,0,0,0.07)',
      opacity: disabled ? 0.45 : 1,
    }}>{children}</Pressable>
  );
}

// ── Props ────────────────────────────────────────────────────────
interface DrawingCanvasProps {
  bgColor?: string;
  submitLabel?: string;
  submitColor?: string;
  topReservedHeight?: number;
  onExport: (base64: string) => void;
  exporting?: boolean;
  /** 纯净模式切换时通知父组件隐藏/恢复顶部 UI */
  onPureModeChange?: (isPure: boolean) => void;
}

// ═════════════════════════════════════════════════════════════════
export default function DrawingCanvas({
  bgColor = '#F7F5F0',
  submitLabel: _submitLabel = '完成',
  submitColor = '#E8A365',
  topReservedHeight = 0,
  onExport,
  exporting = false,
  onPureModeChange,
}: DrawingCanvasProps) {
  const { width: W, height: H } = useWindowDimensions();
  const canvasH = H - topReservedHeight;
  const viewShotRef = useRef<any>(null);
  const [capturing, setCapturing] = useState(false);

  // ── 绘画状态 ──────────────────────────────────────────────────
  const [paths, setPaths] = useState<DrawnPath[]>([]);
  const [color, setColor] = useState('#1F2937');
  const [brushSize, setBrushSize] = useState(6);
  const [texture, setTexture] = useState<BrushTexture>('pen');
  const [erasing, setErasing] = useState(false);

  // ── 画布变换（全部用 SharedValue，UI线程驱动，无 JS re-render）──
  // 变换模型：screenPt = canvasPt * scale + offset
  // lockedSV：锁定状态在 worklet 线程实时读取，替代 JS state 闭包快照
  const lockedSV   = useSharedValue(false);
  const [locked, setLockedState] = useState(false);
  // 同步设置 locked 的统一入口，确保 JS state 与 SharedValue 同步
  const setLocked = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setLockedState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      lockedSV.value = next;
      return next;
    });
  }, [lockedSV]);

  // 画布变换：使用 SharedValue 完全在 UI 线程驱动，消除高频 runOnJS 导致的卡顿/崩溃
  const svScale  = useSharedValue(1.0);
  const svOffX   = useSharedValue(0.0);
  const svOffY   = useSharedValue(0.0);

  // JS ref 同步当前值，供 screenToCanvas / applyTransform 读取（保持绘画坐标映射正确）
  const canvasScaleRef  = useRef(1.0);
  const canvasOffsetRef = useRef({ x: 0, y: 0 });
  // JS state 仅用于 canvasScale > 1 的角标显示（低频更新，不影响绘画性能）
  const [canvasScale, setCanvasScale] = useState(1.0);

  const pinchBaseScale  = useSharedValue(1.0);
  const pinchBaseFocalX = useSharedValue(0.0);
  const pinchBaseFocalY = useSharedValue(0.0);
  const pinchBaseOffX   = useSharedValue(0.0);
  const pinchBaseOffY   = useSharedValue(0.0);

  // useAnimatedStyle 直接驱动变换，完全绕过 JS 线程 re-render
  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: svOffX.value },
      { translateY: svOffY.value },
      { scale: svScale.value },
    ],
  }));

  // ── UI 状态 ───────────────────────────────────────────────────
  const [pureMode, setPureMode] = useState(false);
  const togglePureMode = useCallback((val: boolean) => {
    setPureMode(val);
    onPureModeChange?.(val);
  }, [onPureModeChange]);
  const [openPanel, setOpenPanel] = useState<PanelType>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showColorWheel, setShowColorWheel] = useState(false);

  // ── 可拖动纯净浮标（RNGH Gesture.Pan，与画布手势同框架，互不干扰）────
  // PanResponder 在 GestureDetector 内部会被 RNGH 内部协调器完全拦截，
  // 必须换用 Gesture.Pan 才能在手机上正常响应拖动。
  const purePosX = useSharedValue(W - 60);
  const purePosY = useSharedValue(H * 0.4);
  const pureDragBaseX = useSharedValue(W - 60);
  const pureDragBaseY = useSharedValue(H * 0.4);
  const pureAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: purePosX.value }, { translateY: purePosY.value }],
  }));
  const pureDragGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      pureDragBaseX.value = purePosX.value;
      pureDragBaseY.value = purePosY.value;
    })
    .onUpdate(e => {
      'worklet';
      purePosX.value = Math.max(4, Math.min(W - 52, pureDragBaseX.value + e.translationX));
      purePosY.value = Math.max(4, Math.min(H - 52, pureDragBaseY.value + e.translationY));
    })
    .runOnJS(false);

  // ── 绘画 refs ─────────────────────────────────────────────────
  const currentPathRef = useRef('');
  const isDrawingRef = useRef(false);

  const screenToCanvas = useCallback((sx: number, sy: number) => ({
    x: (sx - canvasOffsetRef.current.x) / canvasScaleRef.current,
    y: (sy - canvasOffsetRef.current.y) / canvasScaleRef.current,
  }), []);

  const applyTransform = useCallback((scale: number, ox: number, oy: number) => {
    canvasScaleRef.current  = scale;
    canvasOffsetRef.current = { x: ox, y: oy };
    // 同步 SharedValue 让 UI 线程立即渲染
    svScale.value = scale;
    svOffX.value  = ox;
    svOffY.value  = oy;
    // 低频更新角标显示
    setCanvasScale(scale);
  }, [svScale, svOffX, svOffY]);

  // ── 绘画事件 ──────────────────────────────────────────────────
  const startPath = useCallback((sx: number, sy: number) => {
    const { x, y } = screenToCanvas(sx, sy);
    const strokeColor = erasing ? bgColor : color;
    const props = erasing ? { w: brushSize * 5, op: 1.0, dash: undefined } : getStrokeProps(texture, brushSize);
    currentPathRef.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    isDrawingRef.current = true;
    setPaths(prev => [...prev, { d: currentPathRef.current, color: strokeColor, width: props.w, opacity: props.op, dashArray: props.dash }]);
  }, [color, brushSize, texture, erasing, bgColor, screenToCanvas]);

  const updatePath = useCallback((sx: number, sy: number) => {
    if (!isDrawingRef.current) return;
    const { x, y } = screenToCanvas(sx, sy);
    currentPathRef.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    const d = currentPathRef.current;
    setPaths(prev => { if (!prev.length) return prev; const n = [...prev]; n[n.length - 1] = { ...n[n.length - 1], d }; return n; });
  }, [screenToCanvas]);

  const endPath = useCallback(() => { isDrawingRef.current = false; }, []);

  // ── 单指手势 ──────────────────────────────────────────────────
  // 锁定语义：
  //   locked=false（绘画模式）→ 始终绘画，不允许平移/缩放
  //   locked=true （查看模式）→ 始终平移，不允许绘画；配合 pinchGesture 可缩放
  //
  // 关键修复 A：onStart/onUpdate 必须标 'worklet'，读 lockedSV.value（worklet安全）
  // 关键修复 B：平移时 svOffX/svOffY 直接在 worklet 里写（不能 runOnJS 后再写 SharedValue）
  //            onEnd 一次性 runOnJS(applyTransform) 同步 JS ref（低频，安全）
  const panOffBaseX = useSharedValue(0.0);
  const panOffBaseY = useSharedValue(0.0);

  const panGesture = Gesture.Pan().minDistance(0).maxPointers(1)
    .onStart(e => {
      'worklet';
      if (lockedSV.value) {
        // 查看模式：记录本次平移基准（worklet内直接读 SharedValue）
        panOffBaseX.value = svOffX.value;
        panOffBaseY.value = svOffY.value;
      } else {
        // 绘画模式：开始新路径
        runOnJS(startPath)(e.x, e.y);
      }
    })
    .onUpdate(e => {
      'worklet';
      if (lockedSV.value) {
        // 查看模式：直接在 worklet 写 SharedValue（UI线程零延迟，无 runOnJS）
        svOffX.value = panOffBaseX.value + e.translationX;
        svOffY.value = panOffBaseY.value + e.translationY;
      } else {
        // 绘画模式：追加路径点
        runOnJS(updatePath)(e.x, e.y);
      }
    })
    .onEnd(() => {
      'worklet';
      if (lockedSV.value) {
        // 手势结束后同步回 JS ref（供 screenToCanvas 使用），一次性 runOnJS
        runOnJS(applyTransform)(svScale.value, svOffX.value, svOffY.value);
      } else {
        runOnJS(endPath)();
      }
    });

  // ── 双指 Pinch（以双指中心为焦点，完全 UI 线程驱动）─────────
  // 变换模型：screenPt = canvasPt * scale + offset
  // 焦点不动：newOffset = focalPt - focalCanvasPt * newScale
  //
  // 关键修复：onUpdate 直接写 svScale/svOffX/svOffY SharedValue（UI线程），
  //           不再 runOnJS(applyTransform)（每帧触发 React re-render → 手机卡顿/崩溃）
  //           onEnd 才 runOnJS(applyTransform) 同步 JS ref（低频，安全）
  const pinchGesture = Gesture.Pinch()
    .onStart(e => {
      'worklet';
      pinchBaseScale.value  = svScale.value;
      pinchBaseOffX.value   = svOffX.value;
      pinchBaseOffY.value   = svOffY.value;
      pinchBaseFocalX.value = e.focalX;
      pinchBaseFocalY.value = e.focalY;
    })
    .onUpdate(e => {
      'worklet';
      if (!lockedSV.value) return; // 绘画模式禁止缩放
      const bs  = pinchBaseScale.value;
      const ns  = Math.max(1.0, Math.min(5.0, bs * e.scale));
      const fx  = pinchBaseFocalX.value;
      const fy  = pinchBaseFocalY.value;
      const fcx = (fx - pinchBaseOffX.value) / bs;
      const fcy = (fy - pinchBaseOffY.value) / bs;
      const newOx = ns <= 1.01 ? 0 : fx - fcx * ns;
      const newOy = ns <= 1.01 ? 0 : fy - fcy * ns;
      // 直接写 SharedValue：UI 线程立即渲染，零 JS re-render
      svScale.value = ns;
      svOffX.value  = newOx;
      svOffY.value  = newOy;
    })
    .onEnd(() => {
      'worklet';
      // 手势结束后同步回 JS ref（供 screenToCanvas 使用），一次性调用，无性能问题
      runOnJS(applyTransform)(svScale.value, svOffX.value, svOffY.value);
    });

  // Simultaneous：pan 限 maxPointers(1)，双指时自动让位给 pinch
  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  // ── Web 端鼠标滚轮缩放（锁定模式才允许）──────────────────────
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (!lockedSV.value) return; // 绘画模式禁止滚轮缩放
      const factor   = e.deltaY > 0 ? 0.94 : 1.06;
      const oldScale = canvasScaleRef.current;
      const newScale = Math.max(1.0, Math.min(5.0, oldScale * factor));
      if (newScale === oldScale) return;
      const bOx  = canvasOffsetRef.current.x;
      const bOy  = canvasOffsetRef.current.y;
      const fcx  = (e.clientX - bOx) / oldScale;
      const fcy  = (e.clientY - bOy) / oldScale;
      const newOx = newScale <= 1.01 ? 0 : e.clientX - fcx * newScale;
      const newOy = newScale <= 1.01 ? 0 : e.clientY - fcy * newScale;
      applyTransform(newScale, newOx, newOy);
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTransform]);

  // ── 导出 ─────────────────────────────────────────────────────
  const handleExport = async () => {
    if (paths.length === 0 || capturing) return;
    setCapturing(true); setOpenPanel(null);
    try {
      await new Promise(r => setTimeout(r, 80));
      const uri: string | undefined = await viewShotRef.current?.capture();
      if (!uri) throw new Error('截图失败');
      const result = await manipulateAsync(uri, [], { format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (!result.base64) throw new Error('base64转换失败');
      setCapturing(false); onExport(result.base64);
    } catch (e) { console.error('画板导出失败:', e); setCapturing(false); }
  };

  // ── 保存相册 ─────────────────────────────────────────────────
  const handleSaveToAlbum = async () => {
    if (process.env.EXPO_OS === 'web') return;
    setCapturing(true); setOpenPanel(null);
    try {
      const ML = await import('expo-media-library');
      const { status } = await ML.requestPermissionsAsync();
      if (status !== 'granted') { setCapturing(false); return; }
      await new Promise(r => setTimeout(r, 80));
      const uri: string | undefined = await viewShotRef.current?.capture();
      if (!uri) throw new Error('截图失败');
      await ML.saveToLibraryAsync(uri);
    } catch (e) { console.error('保存相册失败:', e); }
    finally { setCapturing(false); }
  };

  const curTx = TEXTURES.find(t => t.id === texture)!;
  // 工具胶囊底部安全距离，预留 bottom=24，高度~60，上方 panel 动态展开
  const TOOLBAR_BOTTOM = 24;

  // ═══════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>

      {/* ── 画布 ──
          变换模型（SharedValue + useAnimatedStyle，UI线程驱动，零 re-render）：
          外层 View：overflow:hidden，固定为屏幕尺寸，作为裁剪容器
          内层 Animated.View：transform = [translateX, translateY, scale] 由 useAnimatedStyle 驱动
          ViewShot 包裹在 Animated.View 内，capture() 时自动包含变换后的内容
          坐标映射：screenToCanvas 用 canvasOffsetRef / canvasScaleRef（onEnd 后同步）
      ── */}
      <GestureDetector gesture={composedGesture}>
        <View style={{ width: W, height: canvasH, overflow: 'hidden' }}>
          <Animated.View style={[
            { width: W, height: canvasH, transformOrigin: 'top left' },
            canvasAnimStyle,
          ]}>
            <ViewShot ref={viewShotRef}
              style={{ width: W, height: canvasH }}
              options={{ format: 'jpg', quality: 0.85 }}>
              <Svg width={W} height={canvasH}>
                <Rect x={0} y={0} width={W} height={canvasH} fill={bgColor} />
                {paths.map((p, i) => (
                  <SvgPath key={i} d={p.d} stroke={p.color}
                    strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round"
                    fill="none" opacity={p.opacity} strokeDasharray={p.dashArray} />
                ))}
              </Svg>
            </ViewShot>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* 缩放角标 */}
      {canvasScale > 1.05 && (
        <View style={{ position: 'absolute', top: 12, left: 16, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: 'white', fontSize: 11 }}>{canvasScale.toFixed(1)}×</Text>
        </View>
      )}

      {/* ════════════════════════════════════════════
          可拖动纯净模式浮标（RNGH Gesture.Pan，与画布手势同框架）
          position:'absolute' + translateX/Y 由 Animated SharedValue 驱动
          ════════════════════════════════════════════ */}
      <GestureDetector gesture={pureDragGesture}>
        <Animated.View style={[
          {
            position: 'absolute', left: 0, top: 0,
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: pureMode ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.18)' }] as any,
            borderWidth: 1, borderColor: pureMode ? 'transparent' : 'rgba(0,0,0,0.08)',
            zIndex: 20,
          },
          pureAnimStyle,
        ]}>
          <Pressable
            onPress={() => { togglePureMode(!pureMode); setOpenPanel(null); }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            {pureMode
              ? <EyeOff size={20} color="white" />
              : <Eye size={20} color="#6B7280" />}
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* ════════════════════════════════════════════
          底部工具栏（纯净模式时隐藏）
          ════════════════════════════════════════════ */}
      {!pureMode && (
        <View
          style={{ position: 'absolute', bottom: TOOLBAR_BOTTOM, left: 0, right: 0, alignItems: 'center' }}
          pointerEvents="box-none">

          {/* ── 上方展开面板 ── */}
          {openPanel === 'brush' && (
            <View style={{
              flexDirection: 'row', gap: 4, marginBottom: 10,
              backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 20,
              paddingHorizontal: 10, paddingVertical: 8,
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.12)' }] as any,
            }}>
              {TEXTURES.map(tx => {
                const on = tx.id === texture && !erasing;
                return (
                  <Pressable key={tx.id}
                    onPress={() => { setTexture(tx.id); setErasing(false); setOpenPanel(null); }}
                    style={{ alignItems: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, backgroundColor: on ? '#6366F1' : 'transparent' }}>
                    <tx.Icon size={18} color={on ? 'white' : '#374151'} />
                    <Text style={{ fontSize: 10, color: on ? 'white' : '#6B7280', fontWeight: '600' }}>{tx.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {openPanel === 'color' && (
            <Modal visible={true} transparent animationType="fade">
              <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }}
                onPress={() => setOpenPanel(null)}>
                <Pressable onPress={() => {}} style={{
                  backgroundColor: 'white', borderRadius: 28,
                  paddingHorizontal: 18, paddingVertical: 14,
                  alignItems: 'center', gap: 10,
                  boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,0,0,0.18)' }] as any,
                }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937' }}>🎨 选择颜色</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: 240, justifyContent: 'center' }}>
                    {CANVAS_COLORS.map(c => (
                      <Pressable key={c} onPress={() => { setColor(c); setErasing(false); setOpenPanel(null); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: color === c && !erasing ? 3 : 1.5, borderColor: color === c && !erasing ? '#374151' : c === '#FFFFFF' ? '#D1D5DB' : 'rgba(0,0,0,0.1)' }} />
                    ))}
                  </View>
                  <Pressable onPress={() => { setShowColorWheel(true); setOpenPanel(null); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: '#F3F4F6' }}>
                    <Text style={{ fontSize: 12, color: '#374151', fontWeight: '600' }}>🎨 更多颜色（色盘）</Text>
                  </Pressable>
                  <Pressable onPress={() => setOpenPanel(null)}
                    style={{ paddingVertical: 6 }}>
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>关闭</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          )}

          {openPanel === 'size' && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 10,
              backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 20,
              paddingHorizontal: 20, paddingVertical: 12,
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.12)' }] as any,
            }}>
              {SIZES.map(s => (
                <Pressable key={s.r} onPress={() => { setBrushSize(s.r); setOpenPanel(null); }} style={{ alignItems: 'center', gap: 5 }}>
                  <View style={{ width: s.r * 3 + 4, height: s.r * 3 + 4, borderRadius: (s.r * 3 + 4) / 2, backgroundColor: brushSize === s.r ? '#1F2937' : '#D1D5DB' }} />
                  <Text style={{ fontSize: 10, color: brushSize === s.r ? '#1F2937' : '#9CA3AF', fontWeight: '600' }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* 更多面板：锁定 + 保存 */}
          {openPanel === 'more' && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
              backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 20,
              paddingHorizontal: 16, paddingVertical: 10,
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.12)' }] as any,
            }}>
              {/* 锁定：setLocked 内部已同步 lockedSV，无需手动赋值 */}
              <Pressable onPress={() => setLocked(l => !l)}
                style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: locked ? '#1F2937' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                  {locked ? <Lock size={18} color="white" /> : <Unlock size={18} color="#374151" />}
                </View>
                <Text style={{ fontSize: 10, color: '#6B7280' }}>{locked ? '解锁' : '锁定'}</Text>
              </Pressable>
              {/* 保存相册 */}
              <Pressable onPress={handleSaveToAlbum} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                  {capturing ? <ActivityIndicator size={16} color="#374151" /> : <Download size={18} color="#374151" />}
                </View>
                <Text style={{ fontSize: 10, color: '#6B7280' }}>保存</Text>
              </Pressable>
              {/* 清空 */}
              <Pressable onPress={() => { setShowClearConfirm(true); setOpenPanel(null); }} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF1F2', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={18} color="#DC2626" />
                </View>
                <Text style={{ fontSize: 10, color: '#DC2626' }}>清空</Text>
              </Pressable>
            </View>
          )}

          {/* ── 主工具胶囊（精简 6 键，确保一行）── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 32, paddingHorizontal: 10, paddingVertical: 8,
            boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 20, color: 'rgba(0,0,0,0.12)' }] as any,
          }}>
            {/* 1. 画笔类型 */}
            <ToolBtn onPress={() => setOpenPanel(p => p === 'brush' ? null : 'brush')} active={openPanel === 'brush'} disabled={locked}>
              <curTx.Icon size={20} color={openPanel === 'brush' ? 'white' : (locked ? '#C0C0C0' : '#374151')} />
            </ToolBtn>
            {/* 2. 颜色 */}
            <ToolBtn onPress={() => setOpenPanel(p => p === 'color' ? null : 'color')} active={openPanel === 'color'} disabled={locked}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: (locked ? '#E5E7EB' : erasing ? '#D1D5DB' : color), borderWidth: 2, borderColor: openPanel === 'color' ? 'white' : 'rgba(0,0,0,0.15)' }} />
            </ToolBtn>
            {/* 3. 粗细 */}
            <ToolBtn onPress={() => setOpenPanel(p => p === 'size' ? null : 'size')} active={openPanel === 'size'} disabled={locked}>
              <CircleDot size={brushSize === 3 ? 12 : brushSize === 6 ? 17 : 22} color={openPanel === 'size' ? 'white' : (locked ? '#C0C0C0' : '#374151')} />
            </ToolBtn>
            {/* 4. 橡皮 */}
            <ToolBtn onPress={() => { setErasing(e => !e); setOpenPanel(null); }} active={erasing} activeColor="#E8A365" disabled={locked}>
              <Eraser size={20} color={erasing ? 'white' : (locked ? '#C0C0C0' : '#374151')} />
            </ToolBtn>
            {/* 5. 撤回 */}
            <ToolBtn onPress={() => setPaths(p => p.slice(0, -1))} disabled={locked}>
              <RotateCcw size={19} color={locked ? '#C0C0C0' : '#374151'} />
            </ToolBtn>

            <View style={{ width: 1, height: 28, backgroundColor: 'rgba(0,0,0,0.1)' }} />

            {/* 6. 更多（锁定/保存/清空） */}
            <ToolBtn onPress={() => setOpenPanel(p => p === 'more' ? null : 'more')} active={openPanel === 'more'}>
              <MoreHorizontal size={20} color={openPanel === 'more' ? 'white' : '#374151'} />
            </ToolBtn>

            <View style={{ width: 1, height: 28, backgroundColor: 'rgba(0,0,0,0.1)' }} />

            {/* 7. AI 解读（主操作，强调色） */}
            <Pressable
              onPress={handleExport}
              disabled={capturing || exporting || paths.length === 0}
              style={{
                width: BTN, height: BTN, borderRadius: BTN / 2,
                backgroundColor: paths.length === 0 ? '#D1D5DB' : submitColor,
                alignItems: 'center', justifyContent: 'center',
                boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: 'rgba(0,0,0,0.18)' }] as any,
              }}>
              {(capturing || exporting)
                ? <ActivityIndicator size={16} color="white" />
                : <Sparkles size={20} color="white" />}
            </Pressable>
          </View>

        </View>
      )}

      {/* ── 清空确认 ── */}
      <Modal visible={showClearConfirm} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowClearConfirm(false)}>
          <View style={{ width: 280, backgroundColor: 'white', borderRadius: 24, padding: 24, alignItems: 'center', boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,0,0,0.15)' }] as any }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 8 }}>清空画布？</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 20, textAlign: 'center' }}>所有笔画将被清除，无法撤销</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable onPress={() => setShowClearConfirm(false)}
                style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontWeight: '600', color: '#374151' }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => { setPaths([]); applyTransform(1, 0, 0); setShowClearConfirm(false); }}
                style={{ flex: 1, backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', color: 'white' }}>清空</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── HSV 色盘弹窗 ── */}
      <Modal visible={showColorWheel} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 28, padding: 20, alignItems: 'center', gap: 14, marginBottom: 48, boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,0,0,0.18)' }] as any }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>🎨 选择颜色</Text>
            <ColorWheel onSelect={hex => { setColor(hex); setErasing(false); }} currentColor={color} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color, borderWidth: 2, borderColor: 'rgba(0,0,0,0.1)' }} />
              <Text style={{ fontSize: 13, color: '#374151' }}>{color.toUpperCase()}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowColorWheel(false)}
                style={{ backgroundColor: '#F3F4F6', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 10 }}>
                <Text style={{ fontWeight: '600', color: '#374151' }}>取消</Text>
              </Pressable>
              <Pressable onPress={() => setShowColorWheel(false)}
                style={{ backgroundColor: '#1F2937', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 10 }}>
                <Text style={{ color: 'white', fontWeight: '700' }}>确认</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
