import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Dimensions, Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, List, X, Music, VolumeX, Pencil, Trash2 } from 'lucide-react-native';
import Svg, {
  Path, Ellipse, Defs, RadialGradient, Stop, LinearGradient as SvgLinearGradient,
  Circle as SvgCircle,
} from 'react-native-svg';
import { useSession } from '@/ctx';
import { getHopeLeaves, addHopeLeaf, updateHopeLeaf, deleteHopeLeaf } from '@/db/api';
import type { HopeLeaf } from '@/db/api';
import { useMeditationMusic } from '@/lib/useMeditationMusic';
import { getUsageUri } from '@/lib/audioStore';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, withSpring, Easing,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');

const LEAF_COLORS = ['#7FBA5C', '#5BAD8F', '#A8D87C', '#4EAA9C', '#8DD4A8', '#6BC48E', '#B5E4A0', '#3D9B88'];

// 叶片在新树形上的位置（x=水平比例 0-1, y=垂直比例相对树容器高度）
const LEAF_POSITIONS: { x: number; y: number }[] = [
  { x: 0.50, y: 0.07 }, { x: 0.40, y: 0.10 }, { x: 0.60, y: 0.09 },
  { x: 0.30, y: 0.14 }, { x: 0.70, y: 0.13 }, { x: 0.50, y: 0.16 },
  { x: 0.22, y: 0.21 }, { x: 0.78, y: 0.20 }, { x: 0.38, y: 0.19 },
  { x: 0.62, y: 0.18 }, { x: 0.50, y: 0.24 }, { x: 0.27, y: 0.28 },
  { x: 0.73, y: 0.27 }, { x: 0.44, y: 0.30 }, { x: 0.56, y: 0.31 },
];

// ── 写实 SVG 大树（夜晚风格）──────────────────────────────
function HopeTreeSVG() {
  const svgH = H * 0.60;
  const cx = W / 2;
  const trunkBaseY = svgH - 10;
  const trunkForkY = svgH * 0.46;

  return (
    <Svg width={W} height={svgH} style={{ position: 'absolute', top: 30, left: 0 }}>
      <Defs>
        {/* 树干渐变 */}
        <SvgLinearGradient id="trunk" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#3B2008" />
          <Stop offset="0.4" stopColor="#6B3E1A" />
          <Stop offset="1" stopColor="#3B2008" />
        </SvgLinearGradient>
        {/* 主树冠径向渐变（外浅内深） */}
        <RadialGradient id="canopyCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#0B3023" stopOpacity="1" />
          <Stop offset="1" stopColor="#1A4A30" stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="canopyMid" cx="40%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#1B5E40" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#0F3A22" stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="canopyOuter" cx="50%" cy="45%" r="55%">
          <Stop offset="0" stopColor="#2D7A50" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#164530" stopOpacity="1" />
        </RadialGradient>
        {/* 高光球（顶部受月光照射） */}
        <RadialGradient id="canopyGlow" cx="45%" cy="35%" r="55%">
          <Stop offset="0" stopColor="#3D9B60" stopOpacity="0.7" />
          <Stop offset="1" stopColor="#1A5535" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* ── 枝条（比树冠先绘制，从树干分叉延伸到冠层后方） ── */}
      {/* 左主枝 */}
      <Path
        d={`M ${cx} ${trunkForkY} C ${cx - 40} ${trunkForkY - 40} ${cx - 100} ${svgH * 0.34} ${cx - 160} ${svgH * 0.28}`}
        stroke="#3B2008" strokeWidth="14" fill="none" strokeLinecap="round"
      />
      <Path
        d={`M ${cx - 100} ${svgH * 0.34} C ${cx - 120} ${svgH * 0.26} ${cx - 140} ${svgH * 0.20} ${cx - 155} ${svgH * 0.16}`}
        stroke="#3B2008" strokeWidth="8" fill="none" strokeLinecap="round"
      />
      {/* 右主枝 */}
      <Path
        d={`M ${cx} ${trunkForkY} C ${cx + 40} ${trunkForkY - 40} ${cx + 100} ${svgH * 0.33} ${cx + 165} ${svgH * 0.27}`}
        stroke="#3B2008" strokeWidth="14" fill="none" strokeLinecap="round"
      />
      <Path
        d={`M ${cx + 100} ${svgH * 0.33} C ${cx + 120} ${svgH * 0.25} ${cx + 145} ${svgH * 0.18} ${cx + 158} ${svgH * 0.14}`}
        stroke="#3B2008" strokeWidth="8" fill="none" strokeLinecap="round"
      />
      {/* 顶部中央枝 */}
      <Path
        d={`M ${cx} ${trunkForkY - 10} C ${cx - 10} ${svgH * 0.36} ${cx - 20} ${svgH * 0.24} ${cx - 18} ${svgH * 0.12}`}
        stroke="#3B2008" strokeWidth="10" fill="none" strokeLinecap="round"
      />
      {/* 次级分枝（左） */}
      <Path
        d={`M ${cx - 80} ${svgH * 0.36} C ${cx - 110} ${svgH * 0.30} ${cx - 130} ${svgH * 0.22} ${cx - 120} ${svgH * 0.17}`}
        stroke="#3B2008" strokeWidth="5" fill="none" strokeLinecap="round"
      />
      {/* 次级分枝（右） */}
      <Path
        d={`M ${cx + 80} ${svgH * 0.34} C ${cx + 115} ${svgH * 0.28} ${cx + 130} ${svgH * 0.21} ${cx + 122} ${svgH * 0.16}`}
        stroke="#3B2008" strokeWidth="5" fill="none" strokeLinecap="round"
      />

      {/* ── 树冠 — 多层叠加营造体积感 ── */}
      {/* 第1层（最外、最大、最浅）*/}
      <Ellipse cx={cx - 80} cy={svgH * 0.26} rx={W * 0.20} ry={svgH * 0.16} fill="url(#canopyOuter)" />
      <Ellipse cx={cx + 85} cy={svgH * 0.25} rx={W * 0.21} ry={svgH * 0.16} fill="url(#canopyOuter)" />
      <Ellipse cx={cx} cy={svgH * 0.14} rx={W * 0.19} ry={svgH * 0.15} fill="url(#canopyOuter)" />
      <Ellipse cx={cx} cy={svgH * 0.30} rx={W * 0.26} ry={svgH * 0.17} fill="url(#canopyOuter)" />
      <Ellipse cx={cx - 140} cy={svgH * 0.30} rx={W * 0.14} ry={svgH * 0.12} fill="url(#canopyOuter)" />
      <Ellipse cx={cx + 145} cy={svgH * 0.29} rx={W * 0.14} ry={svgH * 0.12} fill="url(#canopyOuter)" />

      {/* 第2层（中间深绿） */}
      <Ellipse cx={cx - 50} cy={svgH * 0.25} rx={W * 0.18} ry={svgH * 0.15} fill="url(#canopyMid)" />
      <Ellipse cx={cx + 55} cy={svgH * 0.24} rx={W * 0.18} ry={svgH * 0.14} fill="url(#canopyMid)" />
      <Ellipse cx={cx} cy={svgH * 0.12} rx={W * 0.16} ry={svgH * 0.13} fill="url(#canopyMid)" />
      <Ellipse cx={cx} cy={svgH * 0.29} rx={W * 0.22} ry={svgH * 0.15} fill="url(#canopyMid)" />

      {/* 第3层（最深，中心核心） */}
      <Ellipse cx={cx} cy={svgH * 0.24} rx={W * 0.28} ry={svgH * 0.20} fill="url(#canopyCore)" />

      {/* 月光高光叠加 */}
      <Ellipse cx={cx - 20} cy={svgH * 0.16} rx={W * 0.22} ry={svgH * 0.14} fill="url(#canopyGlow)" />

      {/* ── 树干 ── */}
      <Path
        d={`
          M ${cx - 22} ${trunkBaseY}
          C ${cx - 24} ${trunkBaseY - 40} ${cx - 18} ${trunkForkY + 30} ${cx - 9} ${trunkForkY}
          L ${cx + 9} ${trunkForkY}
          C ${cx + 18} ${trunkForkY + 30} ${cx + 24} ${trunkBaseY - 40} ${cx + 22} ${trunkBaseY}
          Z
        `}
        fill="url(#trunk)"
      />
      {/* 树干纹路 */}
      <Path
        d={`M ${cx - 5} ${trunkBaseY} C ${cx - 3} ${trunkBaseY - 50} ${cx + 2} ${trunkForkY + 20} ${cx + 2} ${trunkForkY}`}
        stroke="#2A1505" strokeWidth="2.5" fill="none" strokeOpacity="0.5"
      />

      {/* ── 草地 ── */}
      <Ellipse cx={cx} cy={trunkBaseY + 4} rx={W * 0.38} ry={18} fill="#0D2A1A" />
      <Ellipse cx={cx} cy={trunkBaseY + 2} rx={W * 0.28} ry={10} fill="#113520" />
    </Svg>
  );
}

// ── 单个发光叶片 ──────────────────────────────────────────
function LeafBubble({ leaf, index, onPress }: {
  leaf: HopeLeaf; index: number; onPress: () => void;
}) {
  const pos = LEAF_POSITIONS[index % LEAF_POSITIONS.length];
  const floatY = useSharedValue(0);
  const glowOpacity = useSharedValue(0.75);
  const treeContainerH = H * 0.60;

  useEffect(() => {
    const delay = (index % 7) * 280;
    floatY.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 2200 + delay, easing: Easing.inOut(Easing.sin) }),
        withTiming(7, { duration: 2200 + delay, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, true,
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600 + delay }),
        withTiming(0.5, { duration: 1600 + delay }),
      ),
      -1, true,
    );
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View
      style={[{
        position: 'absolute',
        left: pos.x * (W - 60) - 23,
        top: 30 + pos.y * treeContainerH,
        zIndex: 10,
      }, animStyle]}
    >
      <Pressable
        onPress={onPress}
        style={{
          width: 46, height: 46, borderRadius: 23,
          backgroundColor: leaf.leaf_color + 'CC',
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: leaf.leaf_color,
          shadowColor: leaf.leaf_color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.95,
          shadowRadius: 12,
          elevation: 10,
        }}
      >
        <Text style={{ fontSize: 20 }}>🍃</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── 心理学介绍页 ──────────────────────────────────────────
function IntroPage({ onStart }: { onStart: () => void }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{
        height: 180, borderRadius: 24, marginBottom: 28,
        backgroundColor: '#EAF5EE', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <Text style={{ fontSize: 80 }}>🌳</Text>
        <View style={{
          position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center',
        }}>
          <View style={{
            backgroundColor: 'rgba(122,155,140,0.18)', borderRadius: 20,
            paddingHorizontal: 14, paddingVertical: 4,
          }}>
            <Text style={{ fontSize: 12, color: '#4B7A65', fontWeight: '600' }}>体验即将开始</Text>
          </View>
        </View>
      </View>

      <Text style={{ fontSize: 26, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 }}>
        希望树共建
      </Text>
      <Text style={{ fontSize: 14, color: '#5C5C7A', lineHeight: 22, marginBottom: 28 }}>
        写下你对未来的美好期望，让它成为希望树上的一片叶子。积极期望能激活大脑的奖励回路，增强行动动力。
      </Text>

      <View style={{
        backgroundColor: '#F9F8F6', borderRadius: 20, padding: 20, marginBottom: 20,
        borderLeftWidth: 4, borderLeftColor: '#7A9B8C',
      }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 }}>
          💡 心理学解析
        </Text>
        <TheoryItem title="希望的本质" desc="希望是个体追求目标时拥有的「精神能量」和「路径能量」的总和，是驱使人不断进步的认知动机系统。" />
        <TheoryItem title="意志力（Will Power）" desc="推动个体实现目标的情绪驱力——写下你的期望，就是在激活这份驱力，让大脑开始相信它会发生。" />
        <TheoryItem title="路径能量（Way Power）" desc="实现目标的具体思维计划——当你写下「第一步行动」时，大脑会从愿望模式切换到执行模式。" />
        <TheoryItem title="罗森塔尔效应" desc="积极的期望会产生真实的改变。写下期望的那一刻，你已经开始重塑自己的神经回路。" isLast />
      </View>

      <View style={{
        backgroundColor: '#FFF9F0', borderRadius: 20, padding: 20, marginBottom: 32,
      }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#C07A30', marginBottom: 8 }}>
          📖 为什么写下希望有用？
        </Text>
        <Text style={{ fontSize: 13, color: '#7A5C3A', lineHeight: 21 }}>
          希望不是心灵鸡汤，而是大脑的动态认知动机系统。当你写下期望（意志力）并思考步骤（路径能量）时，你正在激活大脑的奖励回路，增强行动动力。这便是罗森塔尔效应的魔法——相信，即是创造。
        </Text>
      </View>

      <Pressable
        onPress={onStart}
        style={{
          backgroundColor: '#7A9B8C', borderRadius: 16, paddingVertical: 16,
          alignItems: 'center',
          shadowColor: '#7A9B8C', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>🌱 开始种下希望</Text>
      </Pressable>
    </ScrollView>
  );
}

function TheoryItem({ title, desc, isLast }: { title: string; desc: string; isLast?: boolean }) {
  return (
    <View style={{ marginBottom: isLast ? 0 : 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C4A3E', marginBottom: 4 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: '#5C7A6E', lineHeight: 19 }}>{desc}</Text>
    </View>
  );
}

// ── 主游戏页 ──────────────────────────────────────────────
function GamePage({ leaves, loading, onAddLeaf, onLeafPress, onShowList }: {
  leaves: HopeLeaf[];
  loading: boolean;
  onAddLeaf: () => void;
  onLeafPress: (leaf: HopeLeaf) => void;
  onShowList: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      {/* 夜空背景 */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0B1622' }} />

      {/* 星星粒子 */}
      {[...Array(18)].map((_, i) => (
        <StarDot key={i} index={i} />
      ))}

      {/* 萤火虫 */}
      {[...Array(8)].map((_, i) => (
        <FireflyDot key={i} index={i} />
      ))}

      {/* SVG 大树 */}
      <HopeTreeSVG />

      {/* 叶片气泡（浮在树上） */}
      {loading ? (
        <View style={{ position: 'absolute', top: H * 0.28, left: 0, right: 0, alignItems: 'center' }}>
          <ActivityIndicator color="#7FBA5C" />
        </View>
      ) : (
        leaves.slice(0, 15).map((leaf, i) => (
          <LeafBubble key={leaf.id} leaf={leaf} index={i} onPress={() => onLeafPress(leaf)} />
        ))
      )}

      {/* 草地延伸覆盖 */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 110,
        backgroundColor: '#091F10', borderTopLeftRadius: 50, borderTopRightRadius: 50,
      }} />
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 70,
        backgroundColor: '#0C2615',
      }} />

      {/* 底部操作区 */}
      <View style={{
        position: 'absolute', bottom: 24, left: 0, right: 0,
        alignItems: 'center', gap: 10,
      }}>
        <Pressable
          onPress={onAddLeaf}
          style={{
            backgroundColor: 'rgba(122,155,140,0.92)', borderRadius: 30,
            paddingHorizontal: 34, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', gap: 8,
            borderWidth: 1.5, borderColor: 'rgba(127,186,92,0.5)',
            shadowColor: '#7FBA5C', shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.7, shadowRadius: 18, elevation: 12,
          }}
        >
          <Text style={{ fontSize: 18 }}>🍃</Text>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>种下我的希望</Text>
        </Pressable>

        <Pressable onPress={onShowList} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <List size={13} color="rgba(255,255,255,0.45)" />
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            查看全部 {leaves.length} 个心愿
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function StarDot({ index }: { index: number }) {
  const x = ((index * 83 + 17) % 100) / 100;
  const y = ((index * 61 + 5) % 65) / 100;
  const opacity = useSharedValue(0.2);
  useEffect(() => {
    const delay = index * 250;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 1800 + delay }),
        withTiming(0.1, { duration: 1800 + delay }),
      ),
      -1, true,
    );
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{
      position: 'absolute', left: x * W, top: y * H,
      width: index % 3 === 0 ? 3 : 2,
      height: index % 3 === 0 ? 3 : 2,
      borderRadius: 2, backgroundColor: '#E8F0F8',
    }, style]} />
  );
}

function FireflyDot({ index }: { index: number }) {
  const x = (index * 97 % 80) / 100;
  const y = (index * 53 % 60) / 100;
  const opacity = useSharedValue(0.1);
  const scale = useSharedValue(0.5);
  useEffect(() => {
    const delay = index * 400;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 1200 + delay }),
        withTiming(0.05, { duration: 1200 + delay }),
      ),
      -1, true,
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1000 + delay }),
        withTiming(0.4, { duration: 1000 + delay }),
      ),
      -1, true,
    );
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[{
      position: 'absolute', left: x * W, top: y * H * 0.65,
      width: 5, height: 5, borderRadius: 3, backgroundColor: '#E5F55A',
    }, style]} />
  );
}

// ── 书写面板 Modal ────────────────────────────────────────
function WritePanel({ visible, onClose, onSubmit, submitting, initialWill, initialWay, editMode }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (will: string, way: string) => void;
  submitting: boolean;
  initialWill?: string;
  initialWay?: string;
  editMode?: boolean;
}) {
  const [will, setWill] = useState(initialWill ?? '');
  const [way, setWay] = useState(initialWay ?? '');

  useEffect(() => {
    setWill(initialWill ?? '');
    setWay(initialWay ?? '');
  }, [initialWill, initialWay, visible]);

  const handleSubmit = () => {
    if (!will.trim()) return;
    onSubmit(will.trim(), way.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView behavior="padding">
          <View style={{ backgroundColor: '#F9F8F6', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A1A2E', flex: 1 }}>
                {editMode ? '✏️ 修改心愿' : '🍃 注入希望能量'}
              </Text>
              <Pressable onPress={onClose}><X size={22} color="#9CA3AF" /></Pressable>
            </View>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 24 }}>
              {editMode ? '修改你的期望，让它更贴近内心所想' : '写下你的期望，它将成为希望树上永恒的叶子'}
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C', marginBottom: 8 }}>
              ✨ 意志力驱动 — 写下你对未来的美好期望
            </Text>
            <TextInput
              value={will}
              onChangeText={t => setWill(t.slice(0, 100))}
              placeholder="我希望..."
              placeholderTextColor="#C4B5A5"
              multiline
              style={{
                backgroundColor: '#F0EDE8', borderRadius: 14, padding: 14,
                fontSize: 14, color: '#1A1A2E', minHeight: 80, textAlignVertical: 'top',
                marginBottom: 4,
              }}
            />
            <Text style={{ fontSize: 11, color: '#C4B5A5', textAlign: 'right', marginBottom: 16 }}>
              {will.length}/100
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C', marginBottom: 8 }}>
              🚀 路径能量 — 你打算如何迈出第一步？（选填）
            </Text>
            <TextInput
              value={way}
              onChangeText={t => setWay(t.slice(0, 50))}
              placeholder="我的第一步..."
              placeholderTextColor="#C4B5A5"
              style={{
                backgroundColor: '#F0EDE8', borderRadius: 14, padding: 14,
                fontSize: 14, color: '#1A1A2E', marginBottom: 4,
              }}
            />
            <Text style={{ fontSize: 11, color: '#C4B5A5', textAlign: 'right', marginBottom: 24 }}>
              {way.length}/50
            </Text>

            <Pressable
              onPress={handleSubmit}
              disabled={!will.trim() || submitting}
              style={{
                backgroundColor: will.trim() ? '#7A9B8C' : '#D1D5DB',
                borderRadius: 16, paddingVertical: 16, alignItems: 'center',
              }}
            >
              {submitting
                ? <ActivityIndicator color="white" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                    {editMode ? '💾 保存修改' : '🌟 赋予希望'}
                  </Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── 叶片查看 Modal（支持编辑/删除自己的心愿）────────────────
function LeafDetailModal({ leaf, myUserId, onClose, onEdit, onDelete }: {
  leaf: HopeLeaf | null;
  myUserId?: string;
  onClose: () => void;
  onEdit: (leaf: HopeLeaf) => void;
  onDelete: (id: string) => void;
}) {
  const scale = useSharedValue(0.8);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (leaf) { scale.value = withSpring(1, { damping: 12 }); setConfirmDelete(false); }
    else scale.value = 0.8;
  }, [leaf]); // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (!leaf) return null;
  const isOwner = !!myUserId && leaf.user_id === myUserId;

  return (
    <Modal visible={!!leaf} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <Animated.View style={[{ backgroundColor: '#F9F8F6', borderRadius: 24, padding: 24, width: '100%' }, animStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: leaf.leaf_color, alignItems: 'center', justifyContent: 'center', marginRight: 10,
            }}>
              <Text style={{ fontSize: 18 }}>🍃</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A2E', flex: 1 }}>一片希望叶</Text>
            <Pressable onPress={onClose}><X size={20} color="#9CA3AF" /></Pressable>
          </View>

          <View style={{ backgroundColor: '#F0EDE8', borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 5 }}>✨ 期望</Text>
            <Text style={{ fontSize: 14, color: '#1A1A2E', lineHeight: 22 }}>{leaf.will_power}</Text>
          </View>
          {leaf.way_power ? (
            <View style={{ backgroundColor: '#EAF5EE', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 5 }}>🚀 第一步</Text>
              <Text style={{ fontSize: 14, color: '#1A1A2E', lineHeight: 22 }}>{leaf.way_power}</Text>
            </View>
          ) : null}

          <Text style={{ fontSize: 11, color: '#C4B5A5', textAlign: 'center', marginBottom: isOwner ? 16 : 0 }}>
            🌿 种下于 {new Date(leaf.created_at).toLocaleDateString('zh-CN')}
          </Text>

          {/* 仅自己的心愿显示编辑/删除 */}
          {isOwner && (
            confirmDelete ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, color: '#EF4444', textAlign: 'center', fontWeight: '600' }}>
                  确认删除这片心愿叶？
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={() => setConfirmDelete(false)}
                    style={{ flex: 1, backgroundColor: '#F0EDE8', borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#6B7280' }}>取消</Text>
                  </Pressable>
                  <Pressable onPress={() => { onDelete(leaf.id); onClose(); }}
                    style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '700' }}>确认删除</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => onEdit(leaf)}
                  style={{ flex: 1, backgroundColor: '#EAF5EE', borderRadius: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Pencil size={14} color="#4B7A65" />
                  <Text style={{ fontSize: 13, color: '#4B7A65', fontWeight: '600' }}>修改心愿</Text>
                </Pressable>
                <Pressable onPress={() => setConfirmDelete(true)}
                  style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Trash2 size={14} color="#EF4444" />
                  <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>取消心愿</Text>
                </Pressable>
              </View>
            )
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── 心愿列表 Modal（自己的心愿可编辑/删除）──────────────────
function WishListModal({ visible, leaves, myUserId, onClose, onEdit, onDelete }: {
  visible: boolean;
  leaves: HopeLeaf[];
  myUserId?: string;
  onClose: () => void;
  onEdit: (leaf: HopeLeaf) => void;
  onDelete: (id: string) => void;
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: '#F9F8F6', borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: H * 0.78,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A2E', flex: 1 }}>
              🍃 树上的所有心愿 ({leaves.length})
            </Text>
            <Pressable onPress={onClose}><X size={22} color="#9CA3AF" /></Pressable>
          </View>
          <FlatList
            data={leaves}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isOwner = !!myUserId && item.user_id === myUserId;
              return (
                <View style={{
                  backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
                  borderLeftWidth: 4, borderLeftColor: item.leaf_color,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{
                      width: 22, height: 22, borderRadius: 11,
                      backgroundColor: item.leaf_color + '40', alignItems: 'center', justifyContent: 'center', marginRight: 8,
                    }}>
                      <Text style={{ fontSize: 11 }}>🍃</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#9CA3AF', flex: 1 }}>
                      {new Date(item.created_at).toLocaleDateString('zh-CN')}
                    </Text>
                    {isOwner && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Pressable onPress={() => { onEdit(item); onClose(); }}
                          style={{ padding: 4 }}>
                          <Pencil size={14} color="#7A9B8C" />
                        </Pressable>
                        <Pressable onPress={() => setPendingDeleteId(item.id)}
                          style={{ padding: 4 }}>
                          <Trash2 size={14} color="#EF4444" />
                        </Pressable>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 20, marginBottom: item.way_power ? 6 : 0 }}>
                    {item.will_power}
                  </Text>
                  {item.way_power ? (
                    <Text style={{ fontSize: 12, color: '#7A9B8C', lineHeight: 18 }}>🚀 {item.way_power}</Text>
                  ) : null}

                  {/* 删除确认 */}
                  {pendingDeleteId === item.id && (
                    <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => setPendingDeleteId(null)}
                        style={{ flex: 1, backgroundColor: '#F0EDE8', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#6B7280' }}>取消</Text>
                      </Pressable>
                      <Pressable onPress={() => { onDelete(item.id); setPendingDeleteId(null); }}
                        style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>确认删除</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 32, marginBottom: 12 }}>🌱</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 14 }}>还没有心愿，成为第一个种下希望的人吧</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────
type PageType = 'intro' | 'game';

export default function HopeTreeScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [page, setPage] = useState<PageType>('intro');
  const [leaves, setLeaves] = useState<HopeLeaf[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [selectedLeaf, setSelectedLeaf] = useState<HopeLeaf | null>(null);
  const [showWrite, setShowWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showList, setShowList] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [localAudioUri, setLocalAudioUri] = useState<string | null>(null);
  // 编辑状态
  const [editingLeaf, setEditingLeaf] = useState<HopeLeaf | null>(null);

  useFocusEffect(useCallback(() => {
    void getUsageUri('hope_tree').then(uri => setLocalAudioUri(uri));
  }, []));

  const { musicOn, musicLoading, toggle: toggleMusic } =
    useMeditationMusic('meditation', false, localAudioUri);

  const loadLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    const data = await getHopeLeaves(40);
    setLeaves(data);
    setLoadingLeaves(false);
  }, []);

  useFocusEffect(useCallback(() => { loadLeaves(); }, [loadLeaves]));

  // 新增心愿
  const handleSubmit = async (will: string, way: string) => {
    setSubmitting(true);
    const color = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
    await addHopeLeaf(session?.user.id ?? null, will, way, color);
    await loadLeaves();
    setSubmitting(false);
    setShowWrite(false);
    setSuccessMsg('🌟 你的希望已种入树中，愿它生根发芽！');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // 修改心愿
  const handleEdit = async (will: string, way: string) => {
    if (!editingLeaf) return;
    setSubmitting(true);
    await updateHopeLeaf(editingLeaf.id, will, way);
    await loadLeaves();
    setSubmitting(false);
    setEditingLeaf(null);
    setSuccessMsg('✏️ 心愿已更新！');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // 删除心愿
  const handleDelete = async (id: string) => {
    await deleteHopeLeaf(id);
    await loadLeaves();
    setSuccessMsg('🍂 心愿已从树上飘落…');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // 触发编辑弹窗
  const openEdit = (leaf: HopeLeaf) => {
    setSelectedLeaf(null);
    setShowList(false);
    setEditingLeaf(leaf);
  };

  return (
    <View style={{ flex: 1, backgroundColor: page === 'game' ? '#0B1622' : '#F9F8F6' }}>
      <StatusBar style={page === 'game' ? 'light' : 'dark'} />

      {/* 顶部导航 */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, zIndex: 10,
      }}>
        <Pressable
          onPress={() => page === 'game' ? setPage('intro') : router.back()}
          style={{
            width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            backgroundColor: page === 'game' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
            marginRight: 12,
          }}
        >
          <ArrowLeft size={18} color={page === 'game' ? '#fff' : '#2C2C2C'} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: page === 'game' ? '#fff' : '#1A1A2E', flex: 1 }}>
          🌳 希望树共建
        </Text>
        <Pressable
          onPress={toggleMusic}
          style={{
            width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            backgroundColor: musicOn
              ? (page === 'game' ? 'rgba(127,186,92,0.3)' : 'rgba(122,155,140,0.15)')
              : (page === 'game' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'),
            marginRight: 8,
          }}
        >
          {musicLoading
            ? <ActivityIndicator size="small" color={page === 'game' ? '#7FBA5C' : '#7A9B8C'} />
            : musicOn
              ? <Music size={16} color={page === 'game' ? '#7FBA5C' : '#7A9B8C'} />
              : <VolumeX size={16} color={page === 'game' ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} />}
        </Pressable>
        {page === 'game' && (
          <Pressable
            onPress={() => setShowList(true)}
            style={{
              width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <List size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}
      </View>

      {/* 页面内容 */}
      {page === 'intro' ? (
        <IntroPage onStart={() => setPage('game')} />
      ) : (
        <GamePage
          leaves={leaves}
          loading={loadingLeaves}
          onAddLeaf={() => setShowWrite(true)}
          onLeafPress={setSelectedLeaf}
          onShowList={() => setShowList(true)}
        />
      )}

      {/* 成功提示 */}
      {!!successMsg && (
        <View style={{
          position: 'absolute', top: 110, left: 24, right: 24,
          backgroundColor: 'rgba(30,60,40,0.92)', borderRadius: 16, padding: 14,
          alignItems: 'center', zIndex: 99,
          borderWidth: 1, borderColor: 'rgba(127,186,92,0.4)',
        }}>
          <Text style={{ color: '#A8D87C', fontWeight: '600', fontSize: 14 }}>{successMsg}</Text>
        </View>
      )}

      {/* 书写面板 — 新增 */}
      <WritePanel
        visible={showWrite}
        onClose={() => setShowWrite(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      {/* 书写面板 — 编辑 */}
      <WritePanel
        visible={!!editingLeaf}
        onClose={() => setEditingLeaf(null)}
        onSubmit={handleEdit}
        submitting={submitting}
        initialWill={editingLeaf?.will_power}
        initialWay={editingLeaf?.way_power ?? ''}
        editMode
      />

      {/* 叶片详情弹窗 */}
      <LeafDetailModal
        leaf={selectedLeaf}
        myUserId={session?.user.id}
        onClose={() => setSelectedLeaf(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {/* 心愿列表 */}
      <WishListModal
        visible={showList}
        leaves={leaves}
        myUserId={session?.user.id}
        onClose={() => setShowList(false)}
        onEdit={openEdit}
        onDelete={handleDelete}
      />
    </View>
  );
}
