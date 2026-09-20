import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming,
  Easing, cancelAnimation,
} from 'react-native-reanimated';
import { ArrowLeft } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useAudioPlayer } from 'expo-audio';
import { useMeditationMusic } from '@/lib/useMeditationMusic';
import { getUsageUri } from '@/lib/audioStore';

// 呼吸训练背景图
const BREATH_BG = 'https://miaoda-image.cdn.bcebos.com/img/corpus/a9e1f0957b0741aabaa553c81258baa8.jpg';

// ── 提示音（风铃声，步骤切换使用） ────────────────────────────────
// 选用清脆风铃 MP3，短促悦耳，iOS/Android 均兼容
const BELL_URL = 'https://cdn.freesound.org/previews/411/411089_5121236-lq.mp3';

// ── 呼吸模式配置 ──────────────────────────────────────────────────
const MODES = [
  {
    id: '478',
    label: '4-7-8 呼吸法',
    desc: '吸气4秒，屏息7秒，呼气8秒。激活副交感神经，快速平静焦虑。',
    steps: [
      { name: '吸气', duration: 4, color: '#7A9D8C', scale: 1.5 },
      { name: '屏息', duration: 7, color: '#E8C56A', scale: 1.5 },
      { name: '呼气', duration: 8, color: '#9B8EC4', scale: 0.7 },
    ],
    emoji: '🌊',
  },
  {
    id: 'box',
    label: '箱式呼吸',
    desc: '吸气4秒，屏息4秒，呼气4秒，屏息4秒。平衡自主神经系统。',
    steps: [
      { name: '吸气', duration: 4, color: '#7A9D8C', scale: 1.5 },
      { name: '屏息', duration: 4, color: '#E8C56A', scale: 1.5 },
      { name: '呼气', duration: 4, color: '#9B8EC4', scale: 0.7 },
      { name: '屏息', duration: 4, color: '#E8A365', scale: 0.7 },
    ],
    emoji: '📦',
  },
  {
    id: 'belly',
    label: '腹式呼吸',
    desc: '吸气5秒，呼气5秒。深度腹式呼吸，增加氧气供应，放松身体。',
    steps: [
      { name: '吸气', duration: 5, color: '#7A9D8C', scale: 1.55 },
      { name: '呼气', duration: 5, color: '#9B8EC4', scale: 0.65 },
    ],
    emoji: '🌸',
  },
];

const DURATIONS = [
  { label: '3 分钟', seconds: 180 },
  { label: '5 分钟', seconds: 300 },
  { label: '10 分钟', seconds: 600 },
];

type ModeId = '478' | 'box' | 'belly';
type Phase = 'select' | 'ready' | 'breathing' | 'done';

export default function BreathScreen() {
  const router = useRouter();
  const { returnExpertId } = useLocalSearchParams<{ returnExpertId?: string }>();

  const [phase, setPhase] = useState<Phase>('select');
  const [selectedMode, setSelectedMode] = useState<ModeId>('478');
  const [selectedDuration, setSelectedDuration] = useState(180);
  const [stepIdx, setStepIdx] = useState(0);
  const [stepCountdown, setStepCountdown] = useState(0);
  const [totalCountdown, setTotalCountdown] = useState(0);
  const [breathCount, setBreadCount] = useState(0);
  const [localAudioUri, setLocalAudioUri] = useState<string | null>(null);

  // 加载用户配置的本地音频
  useFocusEffect(
    useCallback(() => {
      void getUsageUri('breath').then(uri => setLocalAudioUri(uri));
    }, []),
  );

  // AI / 本地 冥想背景音乐
  const { musicOn, musicLoading, aiReady, isLocal, toggle: toggleMusic, pause: pauseMusic, startIfOff } =
    useMeditationMusic('meditation', false, localAudioUri);
  // 步骤切换提示音（短铃声，不适合用 AI 音乐生成）
  const bellPlayer = useAudioPlayer(BELL_URL);
  const prevStepIdx = useRef<number>(-1);

  const mode = MODES.find(m => m.id === selectedMode)!;
  const currentStep = mode.steps[stepIdx % mode.steps.length];

  // Reanimated
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 冥想音乐控制（由 useMeditationMusic Hook 统一管理） ────────────
  // 进入呼吸阶段时自动开启音乐；离开时暂停
  useEffect(() => {
    if (phase === 'breathing') {
      startIfOff();   // 若已手动关闭则不强制，若从未开启则自动开启
    } else {
      pauseMusic();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 手动切换时即时响应（Hook 内部已处理播放/暂停）
  useEffect(() => {
    if (phase !== 'breathing') return;
    // musicOn 变化由 Hook 内部 useEffect 处理，此处无需额外操作
  }, [musicOn, phase]);

  // ── 步骤切换提示音 ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'breathing') return;
    if (prevStepIdx.current === stepIdx) return; // 初始不响
    prevStepIdx.current = stepIdx;
    bellPlayer.seekTo(0);
    bellPlayer.play();
  }, [stepIdx, phase, bellPlayer]);

  // 页面离开时停止所有音频
  useEffect(() => {
    return () => {
      pauseMusic();
      bellPlayer.pause();
    };
  }, [pauseMusic, bellPlayer]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // 单步动画
  const animateStep = useCallback((step: typeof mode.steps[0]) => {
    cancelAnimation(scale);
    cancelAnimation(opacity);
    scale.value = withTiming(step.scale, {
      duration: step.duration * 1000,
      easing: Easing.inOut(Easing.sin),
    });
    opacity.value = withTiming(step.scale > 1 ? 1 : 0.6, {
      duration: step.duration * 1000,
      easing: Easing.inOut(Easing.sin),
    });
  }, [scale, opacity]);

  // 启动呼吸循环
  const startBreathing = useCallback(() => {
    const steps = mode.steps;
    let si = 0;
    let countdown = steps[0].duration;
    let total = selectedDuration;
    let bc = 0;

    prevStepIdx.current = 0; // 重置，避免第一个步骤误触发提示音
    setStepIdx(0);
    setStepCountdown(steps[0].duration);
    setTotalCountdown(selectedDuration);
    setBreadCount(0);
    animateStep(steps[0]);
    setPhase('breathing');

    timerRef.current = setInterval(() => {
      countdown--;
      total--;

      setStepCountdown(countdown);
      setTotalCountdown(total);

      if (total <= 0) {
        clearTimer();
        cancelAnimation(scale);
        cancelAnimation(opacity);
        scale.value = withTiming(1, { duration: 600 });
        opacity.value = withTiming(0.7, { duration: 600 });
        setBreadCount(bc);
        setPhase('done');
        return;
      }

      if (countdown <= 0) {
        si = (si + 1) % steps.length;
        if (si === 0) bc++;
        countdown = steps[si].duration;
        setStepIdx(si);
        setStepCountdown(countdown);
        setBreadCount(bc);
        animateStep(steps[si]);
      }
    }, 1000);
  }, [mode, selectedDuration, animateStep, clearTimer, scale, opacity]);

  // 停止 — 先清定时器 + 取消动画，用 withTiming 平滑归位后再切换 phase
  // 避免 cancelAnimation 直接 setPhase 导致 Reanimated worklet 与 React 状态竞争白屏
  const stopBreathing = useCallback((onDone?: () => void) => {
    clearTimer();
    cancelAnimation(scale);
    cancelAnimation(opacity);
    scale.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    opacity.value = withTiming(0.7, { duration: 350, easing: Easing.out(Easing.quad) });
    // 等动画平滑结束后再执行后续逻辑，防止状态竞争白屏
    if (onDone) setTimeout(onDone, 380);
  }, [clearTimer, scale, opacity]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="light" />

      {/* 全屏背景图（呼吸训练专属氛围感） */}
      <Image
        source={{ uri: BREATH_BG }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
      />
      {/* 半透明蒙层，保证文字可读 */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,30,20,0.52)' }} />

      {/* 顶部导航 */}
      <View className="flex-row items-center px-4 pt-14 pb-4">
        <Pressable onPress={() => { stopBreathing(() => router.back()); }}
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <ArrowLeft size={18} color="#FFFFFF" />
        </Pressable>
        <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 17, flex: 1 }}>呼吸冥想 🍃</Text>
        {/* 音乐开关（呼吸过程中显示） */}
        {phase === 'breathing' && (
          <Pressable
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: musicOn ? 'rgba(122,157,140,0.35)' : 'rgba(255,255,255,0.15)', borderWidth: 1.5, borderColor: musicOn ? '#7A9D8C' : 'rgba(255,255,255,0.3)' }}
            onPress={toggleMusic}
          >
            <Text style={{ fontSize: 16 }}>{musicLoading ? '⏳' : musicOn ? isLocal ? '🎵' : aiReady ? '🎵' : '🔄' : '🔇'}</Text>
          </Pressable>
        )}
      </View>

      {/* 选择模式页 */}
      {phase === 'select' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 20, lineHeight: 20 }}>
            选择一种呼吸方式，让心跳慢下来，找回当下的平静。
          </Text>

          {/* 模式选择 */}
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>🌀 呼吸模式</Text>
          <View className="gap-3 mb-6">
            {MODES.map(m => (
              <Pressable key={m.id}
                className="rounded-2xl p-4 border-2"
                style={{
                  backgroundColor: selectedMode === m.id ? 'rgba(122,157,140,0.28)' : 'rgba(255,255,255,0.12)',
                  borderColor: selectedMode === m.id ? '#7A9D8C' : 'rgba(255,255,255,0.2)',
                }}
                onPress={() => setSelectedMode(m.id as ModeId)}>
                <View className="flex-row items-center gap-3">
                  <Text style={{ fontSize: 28 }}>{m.emoji}</Text>
                  <View className="flex-1">
                    <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>{m.label}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2, lineHeight: 16 }}>{m.desc}</Text>
                    <View className="flex-row gap-2 mt-2 flex-wrap">
                      {m.steps.map((s, i) => (
                        <View key={i} className="rounded-full px-2 py-0.5" style={{ backgroundColor: s.color + '50' }}>
                          <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600' }}>{s.name} {s.duration}s</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {selectedMode === m.id && (
                    <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
                      <Text className="text-white text-xs">✓</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>

          {/* 时长选择 */}
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>⏱ 冥想时长</Text>
          <View className="flex-row gap-3 mb-8">
            {DURATIONS.map(d => (
              <Pressable key={d.seconds}
                className="flex-1 py-3 rounded-2xl items-center border-2"
                style={{
                  borderColor: selectedDuration === d.seconds ? '#7A9D8C' : 'rgba(255,255,255,0.2)',
                  backgroundColor: selectedDuration === d.seconds ? 'rgba(122,157,140,0.28)' : 'rgba(255,255,255,0.1)',
                }}
                onPress={() => setSelectedDuration(d.seconds)}>
                <Text style={{ fontWeight: 'bold', fontSize: 13, color: selectedDuration === d.seconds ? '#7DCEAA' : 'rgba(255,255,255,0.75)' }}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            className="bg-primary rounded-2xl py-4 items-center"
            onPress={() => setPhase('ready')}>
            <Text className="text-primary-foreground font-bold text-base">开始冥想 ✨</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* 准备倒计时 */}
      {phase === 'ready' && (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-6xl mb-6">🌿</Text>
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 20, marginBottom: 12 }}>找一个舒适的姿势</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 24, marginBottom: 32 }}>
            放松肩膀，闭上眼睛{'\n'}将注意力带到你的呼吸上{'\n'}准备好后点击开始
          </Text>
          <Pressable className="bg-primary rounded-2xl px-8 py-4" onPress={startBreathing}>
            <Text className="text-primary-foreground font-bold text-base">我准备好了</Text>
          </Pressable>
          <Pressable className="mt-4" onPress={() => setPhase('select')}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>返回选择</Text>
          </Pressable>
        </View>
      )}

      {/* 呼吸动画页 */}
      {phase === 'breathing' && (
        <View className="flex-1 items-center justify-center px-6">
          {/* 总时长 */}
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 32, fontWeight: '600' }}>
            剩余 {fmtTime(totalCountdown)} · {mode.label}
          </Text>

          {/* 动画圆圈 */}
          <View className="items-center justify-center mb-8" style={{ width: 240, height: 240 }}>
            <Animated.View
              style={[{
                position: 'absolute',
                width: 200, height: 200,
                borderRadius: 100,
                backgroundColor: currentStep.color + '30',
              }, animStyle]}
            />
            <Animated.View
              style={[{
                width: 150, height: 150,
                borderRadius: 75,
                backgroundColor: currentStep.color + '50',
                borderWidth: 3,
                borderColor: currentStep.color,
                alignItems: 'center',
                justifyContent: 'center',
              }, animStyle]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 26 }}>{stepCountdown}</Text>
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15, marginTop: 4 }}>{currentStep.name}</Text>
            </Animated.View>
          </View>

          {/* 步骤进度指示 */}
          <View className="flex-row gap-2 mb-6">
            {mode.steps.map((s, i) => (
              <View key={i} className="items-center gap-1">
                <View className="h-1.5 rounded-full" style={{
                  width: 40,
                  backgroundColor: i === stepIdx % mode.steps.length ? s.color : s.color + '35',
                }} />
                <Text style={{ fontSize: 9, color: i === stepIdx % mode.steps.length ? s.color : 'rgba(255,255,255,0.4)' }}>
                  {s.name}
                </Text>
              </View>
            ))}
          </View>

          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 24 }}>
            已完成 {breathCount} 次完整呼吸
          </Text>

          <Pressable
            className="rounded-2xl px-6 py-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}
            onPress={() => { stopBreathing(() => setPhase('done')); }}>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>结束冥想</Text>
          </Pressable>
        </View>
      )}

      {/* 完成总结页 */}
      {phase === 'done' && (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="text-5xl mb-5">🎉</Text>
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 24, marginBottom: 8 }}>冥想完成</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 32, textAlign: 'center', lineHeight: 20 }}>
            你完成了本次呼吸冥想练习{'\n'}身心已得到充分的放松
          </Text>

          {/* 统计卡片 */}
          <View className="w-full rounded-3xl p-5 mb-6 gap-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>📊 本次冥想统计</Text>
            <View className="flex-row justify-between">
              {[
                { label: '冥想时长', value: fmtTime(selectedDuration), emoji: '⏱' },
                { label: '完整呼吸', value: `${breathCount} 次`, emoji: '💨' },
                { label: '呼吸方式', value: mode.emoji, emoji: '' },
              ].map(item => (
                <View key={item.label} className="flex-1 items-center">
                  <Text className="text-2xl mb-1">{item.emoji || item.value}</Text>
                  <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>{item.emoji ? item.value : mode.label.split(' ')[0]}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 心理学知识卡 */}
          <View className="w-full rounded-2xl p-4 mb-6"
            style={{ backgroundColor: 'rgba(122,157,140,0.2)', borderWidth: 1, borderColor: 'rgba(122,157,140,0.4)' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13, marginBottom: 6 }}>🧠 心理学小知识</Text>
            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, lineHeight: 18 }}>
              {mode.id === '478'
                ? '4-7-8 呼吸法由安德鲁·韦尔博士推广，通过延长呼气激活迷走神经，降低心率与皮质醇水平，帮助快速进入放松状态。'
                : mode.id === 'box'
                ? '箱式呼吸（Box Breathing）是美国海军特种部队（Navy SEAL）的标准减压技术，通过四等分节律平衡自主神经系统，提升专注力与情绪调节能力。'
                : '腹式呼吸激活副交感神经系统，降低交感神经兴奋，减少肾上腺素分泌，是正念减压（MBSR）的核心练习技术之一。'
              }
            </Text>
          </View>

          <View className="w-full flex-row gap-3">
            <Pressable
              className="flex-1 rounded-2xl py-3.5 items-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}
              onPress={() => setPhase('select')}>
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }}>再次练习</Text>
            </Pressable>
            {returnExpertId ? (
              /* 从咨询师推荐来：一键回流 */
              <Pressable
                className="flex-1 rounded-2xl py-3.5 items-center"
                style={{ backgroundColor: '#7A9D8C' }}
                onPress={() => {
                  const ctx = encodeURIComponent(JSON.stringify({
                    modeName: mode.label,
                    duration: selectedDuration,
                    breathCount,
                  }));
                  router.replace(`/(app)/chat/${returnExpertId}?breathContext=${ctx}` as RelativePathString);
                }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>返回咨询师 💬</Text>
              </Pressable>
            ) : (
              /* 独立使用：智能匹配咨询师（呼吸→沃尔普/行为主义） */
              <Pressable
                className="flex-1 rounded-2xl py-3.5 items-center"
                style={{ backgroundColor: '#5B9BD5' }}
                onPress={() => {
                  const ctx = encodeURIComponent(JSON.stringify({
                    modeName: mode.label,
                    duration: selectedDuration,
                    breathCount,
                  }));
                  // 呼吸冥想完成 → 推荐行为主义咨询师（沃尔普）
                  router.push(`/(app)/chat/wolpe?breathContext=${ctx}` as RelativePathString);
                }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>与咨询师探讨 💬</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
