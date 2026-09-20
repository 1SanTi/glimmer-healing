import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, CheckCircle, Music2, VolumeX, MessageCircle, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { Image } from 'expo-image';
import { useSession } from '@/ctx';
import { saveTestResult } from '@/db/api';
import { TEST_CONFIGS, EXPERTS } from '@/lib/constants';
import { useMeditationMusic } from '@/lib/useMeditationMusic';
import { getUsageUri } from '@/lib/audioStore';
import { useSubscription } from '@/hooks/useSubscription';
import UpgradeModal from '@/components/UpgradeModal';

// ── 测评-专家推荐映射 ─────────────────────────────────────────────
const TEST_EXPERT_MAP: Record<string, string[]> = {
  phq9:           ['beck', 'hayes'],
  gad7:           ['beck', 'hayes'],
  scl90:          ['freud', 'beck'],
  burnout:        ['frankl', 'deshazer'],
  stress:         ['hayes', 'wolpe'],
  social_anxiety: ['wolpe', 'beck'],
  loneliness:     ['rogers', 'white'],
  confidence:     ['deshazer', 'perls'],
  via:            ['rogers', 'frankl'],
  mbti:           ['rogers', 'perls'],
  mht:            ['beck', 'rogers'],
  mental_age:     ['rogers', 'deshazer'],
  sds:            ['beck', 'hayes'],
  sas:            ['wolpe', 'hayes'],
  cesd:           ['rogers', 'beck'],
  hads:           ['beck', 'hayes'],
  grit:           ['frankl', 'deshazer'],
  mlq:            ['frankl', 'rogers'],
  ssrs:           ['rogers', 'white'],
  // 新增量表
  holland:        ['frankl', 'deshazer'],  // 职业兴趣 → 意义治疗 + 焦点解决
  scsq:           ['hayes', 'rogers'],     // 应对方式 → ACT + 人本
};

// ── 专家推荐卡片 ──────────────────────────────────────────────────
function ExpertRecommendCard({
  testId, testTitle, summary, answers, themeColor,
}: {
  testId: string;
  testTitle: string;
  summary: string;
  answers: Record<number, number>;
  themeColor: string;
}) {
  const router = useRouter();
  const expertIds = TEST_EXPERT_MAP[testId] ?? ['rogers', 'beck'];
  const recommended = expertIds
    .map(id => EXPERTS.find(e => e.id === id))
    .filter(Boolean) as typeof EXPERTS;

  if (recommended.length === 0) return null;

  // 构建测评上下文，传给聊天页
  const testContext = encodeURIComponent(JSON.stringify({
    testTitle,
    summary,
    answersSnippet: Object.entries(answers)
      .slice(0, 8)
      .map(([q, v]) => `Q${parseInt(q, 10) + 1}:${v}`)
      .join(' '),
  }));

  return (
    <View className="mb-6">
      {/* 标题 */}
      <View className="flex-row items-center gap-2 mb-3">
        <View className="w-1.5 h-5 rounded-full" style={{ backgroundColor: themeColor }} />
        <Text className="text-foreground font-bold text-base">🧑‍⚕️ 为你推荐的专家</Text>
      </View>
      <Text className="text-muted-foreground text-xs mb-3 leading-5">
        基于你的测评结果，以下专家的治疗流派最适合深入探索你的状态
      </Text>
      {recommended.map(expert => (
        <Pressable
          key={expert.id}
          onPress={() => router.push(`/(app)/chat/${expert.id}?testContext=${testContext}`)}
          className="bg-card rounded-2xl p-4 mb-3 flex-row items-center"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }] } as any}
        >
          {/* 头像 */}
          <View className="w-12 h-12 rounded-full items-center justify-center mr-3 flex-shrink-0"
            style={{ backgroundColor: expert.color + '22' }}>
            <Text style={{ fontSize: 24 }}>{expert.emoji}</Text>
          </View>
          {/* 信息 */}
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-0.5">
              <Text className="text-foreground font-bold text-base">{expert.name}</Text>
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: expert.color + '22' }}>
                <Text className="text-xs font-medium" style={{ color: expert.color }}>{expert.school}</Text>
              </View>
            </View>
            <Text className="text-muted-foreground text-xs">{expert.description}</Text>
            <Text className="text-xs mt-1 font-medium" style={{ color: expert.color }}>
              💬 可针对你的{testTitle}结果深入谈话
            </Text>
          </View>
          <ChevronRight size={16} color="#9CA3AF" className="ml-2" />
        </Pressable>
      ))}
    </View>
  );
}

// ── 心理测试背景图（宇宙星云）
const TEST_BG = 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_bc510fca-a227-4d94-8e4b-13a600700003.jpg';

// ── 浮动音乐开关按钮 ──────────────────────────────────────────────
function MusicToggleButton({ musicOn, loading, aiReady, isLocal, onToggle }: {
  musicOn: boolean; loading: boolean; aiReady: boolean; isLocal: boolean; onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={{
        position: 'absolute', bottom: 24, right: 20, zIndex: 20,
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: musicOn ? 'rgba(124,58,237,0.15)' : 'rgba(0,0,0,0.07)',
        borderWidth: 1.5,
        borderColor: musicOn ? '#7C3AED40' : '#D1D5DB',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.1)' }],
      } as any}
    >
      {loading
        ? <ActivityIndicator size="small" color="#7C3AED" />
        : musicOn
          ? <Music2 size={18} color={(isLocal || aiReady) ? '#7C3AED' : '#A78BFA'} />
          : <VolumeX size={18} color="#9CA3AF" />}
    </Pressable>
  );
}

// ── 工具函数 ─────────────────────────────────────────────────────
/** 根据十六进制颜色生成更浅的渐变起始色 */
function lightenHex(hex: string, amount = 0.55): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2,'0')}${lg.toString(16).padStart(2,'0')}${lb.toString(16).padStart(2,'0')}`;
}

/** 根据测评ID获取对应大图标 */
function getTestEmoji(id: string): string {
  const MAP: Record<string, string> = {
    scl90: '📊', mbti: '🎭', via: '⭐', mht: '💚',
    stress: '⚡', confidence: '🏆', phq9: '💙',
    gad7: '😰', burnout: '🔥', social_anxiety: '🌿',
    loneliness: '🫂', mental_age: '🧠',
  };
  return MAP[id] ?? '🧪';
}

/** 渐变头图：LinearGradient + SVG 浮动装饰圆 */
function GradientHeroHeader({ color, emoji, height = 220 }: { color: string; emoji: string; height?: number }) {
  const lightColor = lightenHex(color, 0.6);
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <LinearGradient
        colors={[lightColor, color]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* 装饰性 SVG 圆形泡泡 */}
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height={height}>
        <Circle cx="10%" cy="20%" r="56" fill="rgba(255,255,255,0.12)" />
        <Circle cx="85%" cy="15%" r="40" fill="rgba(255,255,255,0.1)" />
        <Circle cx="70%" cy="75%" r="70" fill="rgba(255,255,255,0.09)" />
        <Circle cx="20%" cy="80%" r="30" fill="rgba(255,255,255,0.13)" />
        <Circle cx="50%" cy="50%" r="90" fill="rgba(255,255,255,0.05)" />
        <Ellipse cx="95%" cy="50%" rx="45" ry="60" fill="rgba(255,255,255,0.08)" />
      </Svg>
      {/* 中心 Emoji */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 72, textShadowColor: 'rgba(0,0,0,0.08)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 }}>
          {emoji}
        </Text>
      </View>
    </View>
  );
}

// ── 通用题目渲染与问卷流程 ───────────────────────────────────────
export default function TestScreen() {
  const { type, returnExpertId } = useLocalSearchParams<{ type: string; returnExpertId?: string }>();
  const router = useRouter();
  const { session } = useSession();

  const config = TEST_CONFIGS.find(t => t.id === type);
  const { level: subLevel } = useSubscription();
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const FREE_TEST_IDS = new Set(['scl90', 'sds', 'mht']);
  const isFreeTest = FREE_TEST_IDS.has(type ?? '');

  const [step, setStep] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  // AI / 本地 背景音乐（scene='test'，autoPlay=true 进入页面即开始播放）
  const [localAudioUri, setLocalAudioUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getUsageUri('test').then(uri => setLocalAudioUri(uri));
    }, []),
  );

  const { musicOn, musicLoading, aiReady, isLocal, toggle: toggleMusic } =
    useMeditationMusic('test', true, localAudioUri);

  // 如果不是真实测评（游戏/实验），显示简介卡片
  const isGame = ['balloon', 'sketch', 'breath', 'bigwind', 'gratitude', 'hope_tree'].includes(type ?? '');
  const isExperiment = ['attachment', 'memory', 'skinner', 'milgram', 'diy'].includes(type ?? '');

  if (!config && !isGame && !isExperiment) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Pressable onPress={() => router.back()} className="absolute top-14 left-4 w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="text-muted-foreground">内容暂未开放，敬请期待</Text>
      </View>
    );
  }

  const handleAnswer = (qIdx: number, val: number) => {
    setAnswers(prev => ({ ...prev, [qIdx]: val }));
    if (config && qIdx < config.questions.length - 1) {
      setTimeout(() => setCurrentQ(qIdx + 1), 300);
    } else {
      setTimeout(() => finishQuiz(), 300);
    }
  };

  const finishQuiz = async () => {
    if (!config) return;
    setStep('result');
    if (session) {
      setSaving(true);
      const totalScore = Object.values(answers).reduce((a, b) => a + b, 0);
      const summary = config.getSummary?.(answers) ?? `总分 ${totalScore}`;
      await saveTestResult(session.user.id, config.id, answers, totalScore, summary);
      setSaving(false);
    }
  };

  // ── 游戏/实验简介页 ──
  if (isGame || isExperiment) {
    const INFO: Record<string, { title: string; emoji: string; desc: string; color: string; coming: string }> = {
      balloon: { title: '压力气球', emoji: '🎈', color: '#E8A365', coming: '体验即将上线',
        desc: '深吸一口气，对着话筒吹，看着气球慢慢膨胀，砰！压力随气球一起消散。这是一个通过具身体验帮助释放压力的小游戏。' },
      sketch: { title: '心灵速写', emoji: '🎨', color: '#9B8EC4', coming: '体验即将上线',
        desc: '在数字画板上用颜色和线条描绘你此刻的情绪。没有对错，只有真实的感受。完成后AI会给你一段色彩心理解读。' },
      breath: { title: '呼吸冥想', emoji: '🍃', color: '#7A9D8C', coming: '体验即将上线',
        desc: '跟随呼吸引导，4秒吸气，7秒屏息，8秒呼出。这是军事特种部队使用的"4-7-8呼吸法"，帮助快速平复焦虑。' },
      bigwind: { title: '大风吹', emoji: '💨', color: '#5B9BD5', coming: '团体活动场景',
        desc: '经典团体破冰游戏。主持人说"大风吹"，参与者问"吹什么"，然后找到和自己有共同点的伙伴一起站队。适合团建、班会等场景。' },
      gratitude: { title: '感恩清单', emoji: '✨', color: '#E8C56A', coming: '体验即将上线',
        desc: '每天写下三件让你感到感激的事，不论大小。研究表明坚持感恩记录能在4周内显著提升主观幸福感（Emmons & McCullough, 2003）。' },
      hope_tree: { title: '希望树共建', emoji: '🌱', color: '#7A9D8C', coming: '体验即将上线',
        desc: '写下你对未来的美好期望，让它成为你的"希望树"的一片叶子。积极期望能激活大脑的奖励回路，增强行动动力。' },
      attachment: { title: '依恋预期任务', emoji: '🐰', color: '#D4A5C4', coming: '体验即将上线',
        desc: '在这个像素风小游戏中，你化身一只小兔子。妈妈兔在另一头，你选择靠近还是等待，记录你的选择和心跳。测量你的依恋预期与支持意愿。' },
      memory: { title: '集体记忆实验', emoji: '🧠', color: '#5B9BD5', coming: '体验即将上线',
        desc: '复现经典"聊天室记忆形成"实验。你会和其他用户阅读同一份材料，然后一起讨论。看看你们的记忆是否会相互影响、发生重构？' },
      skinner: { title: '斯金纳箱实验', emoji: '🔬', color: '#7A9D8C', coming: '知识回顾',
        desc: 'B.F.斯金纳用鸽子证明了操作性条件反射：行为因其后果而改变。奖励强化行为，惩罚抑制行为。这一发现深刻影响了教育、管理和行为治疗。' },
      milgram: { title: '米尔格拉姆服从实验', emoji: '⚡', color: '#9B8EC4', coming: '知识回顾',
        desc: '1961年，米尔格拉姆发现65%的普通人会在权威要求下对他人施加"致命电击"。这揭示了"服从权威"这一人类天性，引发了对道德与责任的深刻反思。' },
      diy: { title: '生活实验DIY', emoji: '📓', color: '#C4856A', coming: '体验即将上线',
        desc: '设计你自己的心理学实验！例如：记录一周内每天的睡眠时长和次日情绪评分，看看相关性有多强。只需纸笔，就能探索科学规律。' },
    };
    const info = INFO[type ?? ''] ?? { title: '敬请期待', emoji: '🌱', desc: '这个功能正在开发中', color: '#9CA3AF', coming: '即将上线' };
    return (
      <View className="flex-1 bg-background">
        <StatusBar style="light" />
        <Pressable onPress={() => router.back()}
          className="absolute top-14 left-4 z-10 w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
          <ArrowLeft size={18} color="white" />
        </Pressable>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {/* 渐变头图 */}
          <GradientHeroHeader color={info.color} emoji={info.emoji} height={240} />
          <View className="px-6 pt-6 pb-24">
            <View className="flex-row items-center gap-2 mb-2">
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: info.color + '20' }}>
                <Text className="text-xs font-bold" style={{ color: info.color }}>{info.coming}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: '#1F2937', marginBottom: 8, letterSpacing: -0.5 }}>{info.title}</Text>
            <Text className="text-foreground text-base leading-7 mb-6">{info.desc}</Text>
            <View className="rounded-2xl p-4 mt-2" style={{ backgroundColor: info.color + '12' }}>
              <Text className="font-bold text-sm mb-1" style={{ color: info.color }}>💡 心理学解析</Text>
              <Text className="text-muted-foreground text-sm leading-5">
                这个体验背后有深刻的心理学依据。持续关注本模块，更多内容将陆续上线。
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── 正式测评 ──
  const questions = config!.questions;
  const totalQ = questions.length;

  if (step === 'intro') {
    const themeColor = config!.color;
    const testEmoji = getTestEmoji(config!.id);
    return (
      <View className="flex-1 bg-background">
        <StatusBar style="light" />
        <Pressable onPress={() => router.back()}
          className="absolute top-14 left-4 z-10 w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
          <ArrowLeft size={18} color="white" />
        </Pressable>
        {/* 音乐开关按钮 */}
        <MusicToggleButton musicOn={musicOn} loading={musicLoading} aiReady={aiReady} isLocal={isLocal} onToggle={toggleMusic} />
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {/* 背景图 */}
          <Image source={{ uri: TEST_BG }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }} contentFit="cover" />
          {/* 头图区蒙层 */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220, backgroundColor: 'rgba(20,10,40,0.38)' }} />
          {/* 渐变头图 */}
          <GradientHeroHeader color={themeColor} emoji={testEmoji} height={220} />

          <View className="px-6 pt-6 pb-24">
            {/* 大标题 */}
            <View className="flex-row items-center flex-wrap gap-2 mb-2">
              <Text style={{ fontSize: 26, fontWeight: '900', color: '#1F2937', letterSpacing: -0.5 }}>
                {config!.title}
              </Text>
              {isFreeTest ? (
                <View className="bg-emerald-100 rounded-full px-2.5 py-0.5">
                  <Text style={{ fontSize: 11, color: '#059669', fontWeight: '800' }}>免费体验</Text>
                </View>
              ) : (
                <View className="bg-purple-100 rounded-full px-2.5 py-0.5">
                  <Text style={{ fontSize: 11, color: '#7C6FCD', fontWeight: '800' }}>🔒 心愈版</Text>
                </View>
              )}
            </View>
            <Text className="text-muted-foreground text-sm leading-6 mb-6">{config!.description}</Text>

            {/* 信息卡三格 */}
            <View className="flex-row gap-3 mb-6">
              {[
                { icon: '📝', label: `${totalQ} 道题目` },
                { icon: '⏱', label: config!.duration },
                { icon: '📊', label: config!.category },
              ].map(item => (
                <View key={item.label} className="flex-1 rounded-2xl p-3 items-center"
                  style={{ backgroundColor: themeColor + '12' }}>
                  <Text className="text-lg mb-1">{item.icon}</Text>
                  <Text className="text-xs text-center font-medium" style={{ color: themeColor }}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* 注意事项 */}
            <View className="bg-amber-50 rounded-2xl p-4 mb-6">
              <Text className="text-amber-800 font-semibold text-sm mb-1">⚠️ 注意事项</Text>
              <Text className="text-amber-700 text-xs leading-5">
                本测评仅供自我了解和参考，不能作为临床诊断依据。若您感到持续困扰，请及时寻求专业心理健康服务。
              </Text>
            </View>

            {/* 开始按钮 — 使用主题色渐变 */}
            <Pressable
              onPress={() => {
                if (!isFreeTest && subLevel < 1) {
                  setUpgradeVisible(true);
                  return;
                }
                setStep('quiz');
              }}
              style={{ borderRadius: 18, overflow: 'hidden' }}
            >
              <LinearGradient
                colors={[lightenHex(themeColor, 0.15), themeColor]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 }}>
                  {isFreeTest || subLevel >= 1 ? '开始测评 →' : '🔒 解锁心愈版并开始测评 →'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
        <UpgradeModal
          visible={upgradeVisible}
          onClose={() => setUpgradeVisible(false)}
          requiredLevel={1}
          featureName={config!.title}
          featureDesc="测评舱心理测试除 SCL-90、SDS、MHT 外均为心愈版专享功能，开通后可解锁全套量表与深度分析报告。"
        />
      </View>
    );
  }

  if (step === 'quiz') {
    const q = questions[currentQ];
    const progress = (currentQ + 1) / totalQ;
    const themeColor = config!.color;
    return (
      <View className="flex-1 bg-background">
        <StatusBar style="dark" />
        {/* 音乐开关按钮 */}
        <MusicToggleButton musicOn={musicOn} loading={musicLoading} aiReady={aiReady} isLocal={isLocal} onToggle={toggleMusic} />
        <View className="px-5 pt-14 pb-3 bg-card"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] as any }}>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => currentQ > 0 ? setCurrentQ(currentQ - 1) : setStep('intro')}
              className="w-9 h-9 rounded-full bg-muted items-center justify-center">
              <ArrowLeft size={18} color="#6B7280" />
            </Pressable>
            {/* 主题色进度条 */}
            <View className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <LinearGradient
                colors={[lightenHex(themeColor, 0.25), themeColor]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: '100%', width: `${progress * 100}%`, borderRadius: 4 }} />
            </View>
            <Text className="text-xs font-semibold w-14 text-right" style={{ color: themeColor }}>
              {currentQ + 1}/{totalQ}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 16 }}>
          {/* 题目卡片 — 顶部主题色细线 */}
          <View className="bg-card rounded-3xl overflow-hidden mb-5"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.07)' }] as any }}>
            <View style={{ height: 4, backgroundColor: themeColor }} />
            <View className="p-6">
              <Text className="text-xs font-bold mb-3" style={{ color: themeColor }}>
                第 {currentQ + 1} 题 · 共 {totalQ} 题
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#1F2937', lineHeight: 28 }}>
                {q.text}
              </Text>
            </View>
          </View>

          {/* 选项 */}
          <View className="gap-2.5">
            {q.options.map(opt => {
              const selected = answers[currentQ] === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  className="rounded-2xl px-5 py-4 flex-row items-center"
                  style={{
                    borderWidth: 2,
                    borderColor: selected ? themeColor : '#E5E7EB',
                    backgroundColor: selected ? themeColor + '12' : 'white',
                    boxShadow: selected ? [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: themeColor + '30' }] : undefined,
                  } as any}
                  onPress={() => handleAnswer(currentQ, opt.value)}
                >
                  {/* 选中圆点 */}
                  <View style={{
                    width: 20, height: 20, borderRadius: 10, marginRight: 12,
                    borderWidth: 2, borderColor: selected ? themeColor : '#D1D5DB',
                    backgroundColor: selected ? themeColor : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'white' }} />}
                  </View>
                  <Text style={{
                    fontSize: 14, lineHeight: 22, flex: 1,
                    color: selected ? '#1F2937' : '#374151',
                    fontWeight: selected ? '700' : '400',
                  }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── 结果页 ──
  const totalScore = Object.values(answers).reduce((a, b) => a + b, 0);
  const summary = config!.getSummary?.(answers) ?? `总分 ${totalScore}`;
  const dimensions = config!.getDimensions?.(answers) ?? [];
  const themeColor = config!.color;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="light" />
      {/* 音乐开关按钮 */}
      <MusicToggleButton musicOn={musicOn} loading={musicLoading} aiReady={aiReady} isLocal={isLocal} onToggle={toggleMusic} />
      {/* 背景图 */}
      <Image source={{ uri: TEST_BG }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 180 }} contentFit="cover" />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 180, backgroundColor: 'rgba(20,10,40,0.38)' }} />
      {/* 渐变结果头图 */}
      <View style={{ height: 180, overflow: 'hidden' }}>
        <LinearGradient
          colors={[lightenHex(themeColor, 0.5), themeColor]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Svg style={{ position: 'absolute' }} width="100%" height={180}>
          <Circle cx="15%" cy="30%" r="50" fill="rgba(255,255,255,0.1)" />
          <Circle cx="80%" cy="70%" r="65" fill="rgba(255,255,255,0.08)" />
        </Svg>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20 }}>
          <Text style={{ color: 'white', fontSize: 26, fontWeight: '900', letterSpacing: -0.3 }}>测评完成 🎉</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 }}>{config!.title}</Text>
        </View>
        {/* 返回按钮 */}
        <Pressable onPress={() => router.back()}
          className="absolute top-14 left-4 w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
          <ArrowLeft size={18} color="white" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        {/* 综合结果卡 */}
        <View className="bg-card rounded-3xl overflow-hidden mb-4"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.07)' }] as any }}>
          <View style={{ height: 4, backgroundColor: themeColor }} />
          <View className="p-5">
            <Text className="font-bold text-base mb-3" style={{ color: themeColor }}>📊 综合结果</Text>
            <Text className="text-foreground text-sm leading-7">{summary}</Text>
          </View>
        </View>

        {/* 维度得分 */}
        {dimensions.length > 0 && (
          <View className="bg-card rounded-3xl p-5 mb-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] as any }}>
            <Text className="text-foreground font-bold text-base mb-4">📈 各维度得分</Text>
            {dimensions.map((dim: any) => (
              <View key={dim.name} className="mb-3">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-foreground text-sm font-medium">{dim.name}</Text>
                  <Text className="text-sm font-bold" style={{ color: dim.color ?? themeColor }}>{dim.score}</Text>
                </View>
                <View className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <LinearGradient
                    colors={[lightenHex(dim.color ?? themeColor, 0.3), dim.color ?? themeColor]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ height: '100%', width: `${Math.min(100, (dim.score / dim.max) * 100)}%`, borderRadius: 6 }} />
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="bg-amber-50 rounded-2xl p-4 mb-6">
          <Text className="text-amber-800 font-semibold text-sm mb-1">💡 专业提示</Text>
          <Text className="text-amber-700 text-xs leading-5">
            本测评结果仅供自我了解参考，不构成心理诊断。如您的得分处于需要关注的范围，建议及时联系专业心理咨询师。
          </Text>
        </View>

        {/* 专家推荐卡 */}
        <ExpertRecommendCard
          testId={config!.id}
          testTitle={config!.title}
          summary={summary}
          answers={answers}
          themeColor={themeColor}
        />

        {saving && (
          <View className="flex-row items-center justify-center gap-2 mb-4">
            <ActivityIndicator size="small" color={themeColor} />
            <Text className="text-muted-foreground text-sm">正在保存到心灵档案...</Text>
          </View>
        )}

        {/* 双向回流：若从咨询对话中推荐而来，展示返回按钮 */}
        {returnExpertId && (() => {
          const returnExpert = EXPERTS.find(e => e.id === returnExpertId);
          if (!returnExpert) return null;
          const tc = encodeURIComponent(JSON.stringify({
            testTitle: config!.title,
            summary,
            answersSnippet: Object.entries(answers)
              .slice(0, 8)
              .map(([q, v]) => `Q${parseInt(q, 10) + 1}:${v}`)
              .join(' '),
          }));
          return (
            <Pressable
              onPress={() => router.push(`/(app)/chat/${returnExpert.id}?testContext=${tc}` as import('expo-router').RelativePathString)}
              style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 12 }}
            >
              <LinearGradient
                colors={[returnExpert.color + 'DD', returnExpert.color]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <MessageCircle size={18} color="white" />
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                  返回与{returnExpert.name}继续对话
                </Text>
              </LinearGradient>
            </Pressable>
          );
        })()}

        <Pressable onPress={() => router.back()} style={{ borderRadius: 18, overflow: 'hidden' }}>
          <LinearGradient
            colors={[lightenHex(themeColor, 0.15), themeColor]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ paddingVertical: 16, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>返回测玩中心</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}
