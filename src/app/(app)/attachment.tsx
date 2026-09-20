/**
 * attachment.tsx — 依恋预期任务
 *
 * 互动情景游戏：8 个关系场景 → 4 种选项 → 判断依恋风格
 * 安全型 / 焦虑型 / 回避型 / 混乱型
 */

import { useState, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, Animated, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Heart, RefreshCw } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { saveTestResult } from '@/db/api';

const { width: SW } = Dimensions.get('window');

// ── 依恋风格定义 ─────────────────────────────────────────────────
type AttachmentStyle = 'secure' | 'anxious' | 'avoidant' | 'disorganized';

const STYLE_INFO: Record<AttachmentStyle, {
  label: string; emoji: string; color: string; bg: string;
  desc: string; strength: string; growth: string;
}> = {
  secure: {
    label: '安全型依恋',
    emoji: '🕊️',
    color: '#10B981',
    bg: '#ECFDF5',
    desc: '你对亲密关系感到自在，能够信任他人，也能被他人依赖。你在独处时不会过度焦虑，在亲密时也不会感到不适。',
    strength: '你拥有稳定的自我感，能在关系中保持真实，既能给予支持，也善于接受关爱。',
    growth: '继续培养情感上的开放性，关注伴侣的依恋需求，成为对方的安全港湾。',
  },
  anxious: {
    label: '焦虑型依恋',
    emoji: '🌊',
    color: '#F59E0B',
    bg: '#FFFBEB',
    desc: '你渴望亲密，但常常担心被抛弃或不被爱。你对伴侣的情绪反应很敏感，有时会因为过度担忧而让关系变得紧张。',
    strength: '你对关系充满热情，共情能力强，深深在乎身边的人。这份真诚是关系的宝贵财富。',
    growth: '练习自我安抚和情绪调节，在关系中建立对自我价值的内在确认，减少对外部认可的依赖。',
  },
  avoidant: {
    label: '回避型依恋',
    emoji: '🏔️',
    color: '#6366F1',
    bg: '#EEF2FF',
    desc: '你重视独立性，在过度亲密时会感到不适。你倾向于用理性处理情感，有时会在关系中刻意保持距离。',
    strength: '你自给自足，情绪稳定，不轻易受他人情绪左右。你的独立性让你在困难时能够冷静应对。',
    growth: '试着让自己在安全的关系中练习脆弱，表达情感需求不是软弱，而是真实连接的开始。',
  },
  disorganized: {
    label: '混乱型依恋',
    emoji: '🌪️',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    desc: '你对亲密关系既渴望又恐惧，常常陷入矛盾之中。关系中的冲突会引发强烈的情绪反应，让你感到不知所措。',
    strength: '你对人性和关系有深刻的感悟，你的经历培养了丰富的内心世界和强大的生命力。',
    growth: '寻求专业心理支持，探索早期依恋经历的影响。通过稳定、安全的关系逐步建立内在安全感。',
  },
};

// ── 情景题目 ─────────────────────────────────────────────────────
interface Question {
  id: number;
  scene: string;
  situation: string;
  options: { text: string; style: AttachmentStyle }[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    scene: '📱 消息未读',
    situation: '你发了一条很重要的消息给伴侣，等了两小时还没有回复。你的第一反应是？',
    options: [
      { text: '他可能在忙，等他有空自然会回的', style: 'secure' },
      { text: '是不是我说了什么让他不高兴了？开始反复回看消息', style: 'anxious' },
      { text: '没关系，我自己处理就好，不想打扰他', style: 'avoidant' },
      { text: '又担心又想假装不在乎，内心很混乱', style: 'disorganized' },
    ],
  },
  {
    id: 2,
    scene: '🤝 需要帮助',
    situation: '你遇到了一件很难的事，情绪非常低落。你最可能怎么做？',
    options: [
      { text: '告诉伴侣或好友，请求他们的支持和陪伴', style: 'secure' },
      { text: '反复向对方确认"你会一直陪着我吗"', style: 'anxious' },
      { text: '独自消化，觉得麻烦别人让自己不舒服', style: 'avoidant' },
      { text: '想倾诉但又怕被拒绝，最终选择沉默', style: 'disorganized' },
    ],
  },
  {
    id: 3,
    scene: '💑 亲密时刻',
    situation: '伴侣想要和你来一次深入的情感交流，分享彼此的脆弱面。你感到？',
    options: [
      { text: '温暖，愿意敞开心扉，这让关系更深厚', style: 'secure' },
      { text: '既期待又紧张，担心说错话影响关系', style: 'anxious' },
      { text: '有些不适，觉得"没必要这么深入"', style: 'avoidant' },
      { text: '想靠近却本能地想逃离，感到矛盾', style: 'disorganized' },
    ],
  },
  {
    id: 4,
    scene: '😤 发生争吵',
    situation: '你和伴侣发生了一次小争吵，气氛变得冷淡。你会？',
    options: [
      { text: '冷静后主动沟通，寻找解决方案', style: 'secure' },
      { text: '担心关系就此破裂，主动道歉即使不是自己的错', style: 'anxious' },
      { text: '选择沉默或转移话题，等风头过去', style: 'avoidant' },
      { text: '情绪激烈爆发，之后又后悔自己的反应', style: 'disorganized' },
    ],
  },
  {
    id: 5,
    scene: '🌙 独处夜晚',
    situation: '伴侣因工作需要出差一周，你一个人在家。你的感受是？',
    options: [
      { text: '会想念，但也享受独处时光，安排自己的生活', style: 'secure' },
      { text: '很难受，不断刷他的朋友圈，期待消息', style: 'anxious' },
      { text: '感到轻松，一个人反而更自在', style: 'avoidant' },
      { text: '表面说没事，内心却充满不安和奇怪想象', style: 'disorganized' },
    ],
  },
  {
    id: 6,
    scene: '🎁 被人关心',
    situation: '伴侣突然送了你一份精心准备的礼物，说很在乎你。你的内心反应？',
    options: [
      { text: '感动，坦然接受，也想着怎么回馈', style: 'secure' },
      { text: '开心，但担心"他会不会之后变了"', style: 'anxious' },
      { text: '有些不知所措，觉得被关注让人不自在', style: 'avoidant' },
      { text: '内心充满怀疑，"他为什么突然这样，是不是有什么目的"', style: 'disorganized' },
    ],
  },
  {
    id: 7,
    scene: '🚪 对方疏远',
    situation: '近一周伴侣明显变得冷淡，联系减少。你会？',
    options: [
      { text: '找合适时机直接问他最近是否有烦心事', style: 'secure' },
      { text: '频繁发消息，刷存在感，甚至故意制造话题', style: 'anxious' },
      { text: '觉得"既然他想空间就给他空间"，自己也不联系', style: 'avoidant' },
      { text: '时而疯狂联系，时而突然消失，自己也不知道该怎么办', style: 'disorganized' },
    ],
  },
  {
    id: 8,
    scene: '💭 关系期待',
    situation: '描述你心中理想的亲密关系状态是？',
    options: [
      { text: '彼此信任，能自由表达真实感受，共同成长', style: 'secure' },
      { text: '对方随时在我身边，让我确信他不会离开', style: 'anxious' },
      { text: '保持适当距离，各自独立，不过度依赖', style: 'avoidant' },
      { text: '不太确定，有时想要完全融合，有时又想逃开', style: 'disorganized' },
    ],
  },
];

// ── 计算结果 ─────────────────────────────────────────────────────
function calcResult(answers: AttachmentStyle[]): AttachmentStyle {
  const count: Record<AttachmentStyle, number> = { secure: 0, anxious: 0, avoidant: 0, disorganized: 0 };
  answers.forEach(a => count[a]++);
  return (Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]) as AttachmentStyle;
}

// ── 进度条 ────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = (current / total) * 100;
  return (
    <View className="h-1.5 bg-muted rounded-full mx-5 mb-4">
      <View
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: '#D4A5C4' }}
      />
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function AttachmentScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<AttachmentStyle[]>([]);
  const [result, setResult] = useState<AttachmentStyle | null>(null);
  const [saving, setSaving] = useState(false);

  // 选项按下动画
  const scaleAnims = useRef(QUESTIONS[0].options.map(() => new Animated.Value(1))).current;

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateFade = (cb: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    setTimeout(cb, 180);
  };

  const handleOptionPress = (style: AttachmentStyle, idx: number) => {
    // 按下弹跳
    Animated.sequence([
      Animated.timing(scaleAnims[idx], { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnims[idx], { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    const newAnswers = [...answers, style];

    if (currentQ < QUESTIONS.length - 1) {
      animateFade(() => {
        setAnswers(newAnswers);
        setCurrentQ(q => q + 1);
      });
    } else {
      // 完成
      const finalResult = calcResult(newAnswers);
      setAnswers(newAnswers);
      setResult(finalResult);
      setSaving(true);
      if (session) {
        const info = STYLE_INFO[finalResult];
        saveTestResult(
          session.user.id,
          'htp',
          { style: finalResult, answers: newAnswers },
          0,
          `依恋预期任务：${info.label}`,
        ).finally(() => setSaving(false));
      } else {
        setSaving(false);
      }
      animateFade(() => setPhase('result'));
    }
  };

  const restart = () => {
    setPhase('intro');
    setCurrentQ(0);
    setAnswers([]);
    setResult(null);
  };

  // ── 介绍页 ──
  if (phase === 'intro') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <Pressable
          onPress={() => router.back()}
          className="absolute top-14 left-4 z-10 w-9 h-9 rounded-full bg-white/90 items-center justify-center"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.1)' }] }}
        >
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 80, paddingBottom: 48 }}>
          {/* Hero */}
          <View className="items-center mb-8">
            <View
              className="w-24 h-24 rounded-3xl items-center justify-center mb-5"
              style={{ backgroundColor: '#F5F0FF' }}
            >
              <Text style={{ fontSize: 52 }}>🐰</Text>
            </View>
            <Text className="text-foreground font-bold text-2xl mb-2 text-center">
              依恋预期任务
            </Text>
            <Text className="text-muted-foreground text-sm text-center leading-6">
              8 个真实关系情景 · 探索你的依恋模式
            </Text>
          </View>

          {/* 什么是依恋风格 */}
          <View
            className="bg-card rounded-3xl p-5 mb-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.06)' }] }}
          >
            <Text className="text-foreground font-bold text-base mb-3">💡 什么是依恋风格？</Text>
            <Text className="text-muted-foreground text-sm leading-7">
              依恋理论由约翰·鲍尔比提出，描述我们在亲密关系中形成的情感连结模式。
              早期的依恋经历会塑造我们成年后在爱情、友谊和家庭中的行为方式。
            </Text>
          </View>

          {/* 四种风格预览 */}
          <View className="gap-2.5 mb-8">
            {(Object.entries(STYLE_INFO) as [AttachmentStyle, typeof STYLE_INFO['secure']][]).map(([, info]) => (
              <View
                key={info.label}
                className="flex-row items-center rounded-2xl px-4 py-3.5"
                style={{ backgroundColor: info.bg }}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{info.emoji}</Text>
                <View className="flex-1">
                  <Text className="font-semibold text-sm" style={{ color: info.color }}>{info.label}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5 leading-4" numberOfLines={2}>
                    {info.desc.slice(0, 40)}…
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => setPhase('quiz')}
            className="rounded-2xl py-4 items-center"
            style={{ backgroundColor: '#D4A5C4' }}
          >
            <Text className="text-white font-bold text-base">开始探索</Text>
          </Pressable>
          <Text className="text-muted-foreground text-xs text-center mt-3">约 3 分钟 · 仅供自我探索参考</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 答题页 ──
  if (phase === 'quiz') {
    const q = QUESTIONS[currentQ];
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        {/* 顶栏 */}
        <View className="flex-row items-center px-5 py-3">
          <Pressable
            onPress={() => {
              if (currentQ === 0) router.back();
              else { animateFade(() => setCurrentQ(q2 => q2 - 1)); setAnswers(a => a.slice(0, -1)); }
            }}
            className="w-9 h-9 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
          >
            <ArrowLeft size={18} color="#6B7280" />
          </Pressable>
          <Text className="text-muted-foreground text-sm flex-1 text-center">
            {currentQ + 1} / {QUESTIONS.length}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* 进度条 */}
        <ProgressBar current={currentQ + 1} total={QUESTIONS.length} />

        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          {/* 情景卡 */}
          <View
            className="rounded-3xl p-5 mb-6"
            style={{ backgroundColor: '#FDF4FF', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.06)' }] }}
          >
            <Text className="text-xs font-semibold mb-2" style={{ color: '#D4A5C4' }}>{q.scene}</Text>
            <Text className="text-foreground font-semibold text-base leading-7">{q.situation}</Text>
          </View>

          {/* 选项 */}
          <View className="gap-3">
            {q.options.map((opt, idx) => (
              <Animated.View key={idx} style={{ transform: [{ scale: scaleAnims[idx] }] }}>
                <Pressable
                  onPress={() => handleOptionPress(opt.style, idx)}
                  className="bg-card rounded-2xl px-4 py-4 flex-row items-start active:opacity-80"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                >
                  <View
                    className="w-6 h-6 rounded-full items-center justify-center mr-3 mt-0.5 flex-shrink-0"
                    style={{ backgroundColor: '#F5F0FF' }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#D4A5C4' }}>
                      {String.fromCharCode(65 + idx)}
                    </Text>
                  </View>
                  <Text className="text-foreground text-sm leading-6 flex-1">{opt.text}</Text>
                  <ChevronRight size={16} color="#D1D5DB" style={{ marginTop: 2 }} />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  // ── 结果页 ──
  if (phase === 'result' && result) {
    const info = STYLE_INFO[result];
    // 各风格得票数
    const count: Record<AttachmentStyle, number> = { secure: 0, anxious: 0, avoidant: 0, disorganized: 0 };
    answers.forEach(a => count[a]++);
    const total = answers.length;

    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 }}>

          {/* 结果主卡 */}
          <View
            className="rounded-3xl p-6 mb-5 items-center"
            style={{ backgroundColor: info.bg, boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.07)' }] }}
          >
            <Text style={{ fontSize: 60, marginBottom: 12 }}>{info.emoji}</Text>
            <Text className="font-bold text-xl mb-1" style={{ color: info.color }}>{info.label}</Text>
            <Text className="text-muted-foreground text-xs mb-4">你的依恋预期模式</Text>
            <Text className="text-foreground text-sm leading-7 text-center">{info.desc}</Text>
          </View>

          {/* 优势 */}
          <View
            className="bg-card rounded-2xl p-4 mb-3"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Heart size={14} color={info.color} fill={info.color} />
              <Text className="font-semibold text-sm text-foreground">你的优势</Text>
            </View>
            <Text className="text-muted-foreground text-sm leading-6">{info.strength}</Text>
          </View>

          {/* 成长方向 */}
          <View
            className="bg-card rounded-2xl p-4 mb-5"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Text className="text-sm">🌱</Text>
              <Text className="font-semibold text-sm text-foreground">成长方向</Text>
            </View>
            <Text className="text-muted-foreground text-sm leading-6">{info.growth}</Text>
          </View>

          {/* 分布图 */}
          <View
            className="bg-card rounded-2xl p-4 mb-5"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
          >
            <Text className="font-semibold text-sm text-foreground mb-3">📊 答题分布</Text>
            {(Object.entries(count) as [AttachmentStyle, number][]).map(([style, n]) => {
              const si = STYLE_INFO[style];
              const pct = Math.round((n / total) * 100);
              return (
                <View key={style} className="mb-2.5">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-xs" style={{ color: si.color }}>{si.emoji} {si.label}</Text>
                    <Text className="text-xs text-muted-foreground">{pct}%</Text>
                  </View>
                  <View className="h-2 bg-muted rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: si.color }}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          {saving && (
            <View className="flex-row items-center justify-center gap-2 mb-4">
              <ActivityIndicator size="small" color="#D4A5C4" />
              <Text className="text-muted-foreground text-xs">保存记录中…</Text>
            </View>
          )}

          {/* 免责说明 */}
          <Text className="text-muted-foreground text-xs text-center leading-5 mb-6">
            ✨ 依恋风格并非固定不变，通过有意识的练习和成长，每个人都能发展出更安全的依恋模式
          </Text>

          {/* 操作按钮 */}
          <View className="gap-3">
            <Pressable
              onPress={restart}
              className="flex-row items-center justify-center gap-2 rounded-2xl py-4 bg-card border border-border"
            >
              <RefreshCw size={16} color="#6B7280" />
              <Text className="text-foreground font-semibold">重新探索</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              className="rounded-2xl py-4 items-center"
              style={{ backgroundColor: '#D4A5C4' }}
            >
              <Text className="text-white font-bold">完成</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}
