/**
 * immersive-sleep.tsx — 沉浸式睡眠（重设计版）
 *
 * 功能：
 * - 自定义入睡时间 / 起床时间（上下点击步进，流畅响应）
 * - 系统推送通知提醒（按钮开关，精简显示）
 * - 从音频库选择"沉浸式睡眠背景音"（按钮打开选择器）
 * - 配置持久化到 Supabase sleep_config
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, FlatList,
  ActivityIndicator, Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, BellOff, Music2, Check, Moon, Sunrise, Play, StopCircle, ChevronUp, ChevronDown } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useSession } from '@/ctx';
import { supabase } from '@/client/supabase';
import { getAllAudios, type AudioItem } from '@/lib/audioStore';
import { useBgMusic } from '@/lib/bgMusicContext';

// ── 通知配置 ────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── 辅助：解析时间字符串 ───────────────────────────────────────
function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(':').map(Number);
  return { h: h ?? 22, m: m ?? 30 };
}
function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── +/- 数字步进选择器（上下箭头图标版，跨平台稳定） ───────────
function NumberSpinner({
  value, max, onChange,
}: { value: number; max: number; onChange: (v: number) => void }) {
  const prev = ((value - 1) + (max + 1)) % (max + 1);
  const next = (value + 1) % (max + 1);

  const step = (delta: 1 | -1) => {
    const newVal = ((value + delta) + (max + 1)) % (max + 1);
    onChange(newVal);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <View style={{ alignItems: 'center', width: 72, gap: 0 }}>
      {/* 上 */}
      <Pressable onPress={() => step(-1)}
        style={{ paddingVertical: 8, alignItems: 'center', width: '100%' }}
        hitSlop={{ top: 8, bottom: 4, left: 12, right: 12 }}>
        <ChevronUp size={20} color="rgba(255,255,255,0.35)" />
        <Text style={{ fontSize: 20, fontWeight: '400', color: 'rgba(255,255,255,0.28)', letterSpacing: 1, marginTop: 2 }}>
          {String(prev).padStart(2, '0')}
        </Text>
      </Pressable>

      {/* 当前选中值 */}
      <View style={{
        width: '100%', height: 56, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.13)',
        borderRadius: 16,
        borderWidth: 1.5, borderColor: 'rgba(165,173,222,0.45)',
      }}>
        <Text style={{ fontSize: 32, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1 }}>
          {String(value).padStart(2, '0')}
        </Text>
      </View>

      {/* 下 */}
      <Pressable onPress={() => step(1)}
        style={{ paddingVertical: 8, alignItems: 'center', width: '100%' }}
        hitSlop={{ top: 4, bottom: 8, left: 12, right: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '400', color: 'rgba(255,255,255,0.28)', letterSpacing: 1, marginBottom: 2 }}>
          {String(next).padStart(2, '0')}
        </Text>
        <ChevronDown size={20} color="rgba(255,255,255,0.35)" />
      </Pressable>
    </View>
  );
}

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { h, m } = parseTime(value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
      <NumberSpinner value={h} max={23} onChange={(nh) => onChange(formatTime(nh, m))} />
      <Text style={{ fontSize: 32, fontWeight: '900', color: 'rgba(199,203,217,0.9)', marginBottom: 4 }}>:</Text>
      <NumberSpinner value={m} max={59} onChange={(nm) => onChange(formatTime(h, nm))} />
    </View>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function ImmersiveSleepScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { startBgMusic } = useBgMusic();

  const [bedTime, setBedTime] = useState('22:30');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [sleepAudioId, setSleepAudioId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // 音频选择弹窗
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [sleepAudios, setSleepAudios] = useState<AudioItem[]>([]);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // ── 沉浸式睡眠运行态 ─────────────────────────────────────────
  const [isSleeping, setIsSleeping]       = useState(false);
  const [sleepStart, setSleepStart]       = useState<Date | null>(null);
  const [nowTime, setNowTime]             = useState(new Date());
  const [stopHoldPct, setStopHoldPct]     = useState(0); // 长按进度 0‥1
  const stopHoldTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 当前时间 HH:MM:SS */
  const fmtClock = (d: Date) =>
    `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;

  /** 已入睡时长 */
  const elapsedLabel = (start: Date, now: Date) => {
    const s   = Math.floor((now.getTime() - start.getTime()) / 1000);
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}小时 ${String(m).padStart(2,'0')}分 ${String(sec).padStart(2,'0')}秒`;
    return `${String(m).padStart(2,'0')}分 ${String(sec).padStart(2,'0')}秒`;
  };

  // 睡眠时钟 tick
  useEffect(() => {
    if (isSleeping) {
      clockTimer.current = setInterval(() => setNowTime(new Date()), 1000);
    } else {
      if (clockTimer.current) clearInterval(clockTimer.current);
    }
    return () => { if (clockTimer.current) clearInterval(clockTimer.current); };
  }, [isSleeping]);

  // ── 发送锁屏持久通知（每分钟更新） ───────────────────────────
  const sleepNotifId  = useRef<string | null>(null);
  const notifInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendSleepNotif = async (start: Date) => {
    if (process.env.EXPO_OS === 'web') return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const updateNotif = async () => {
      const now   = new Date();
      const s     = Math.floor((now.getTime() - start.getTime()) / 1000);
      const h     = Math.floor(s / 3600);
      const m     = Math.floor((s % 3600) / 60);
      const label = h > 0 ? `${h}小时${m}分` : `${m}分钟`;
      if (sleepNotifId.current) {
        await Notifications.dismissNotificationAsync(sleepNotifId.current).catch(() => {});
      }
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🌙 睡眠进行中',
          body: `已入睡 ${label} · 计划起床 ${wakeTime}`,
          sticky: true,
        },
        trigger: null,
      });
      sleepNotifId.current = id;
    };
    await updateNotif();
    notifInterval.current = setInterval(updateNotif, 60_000);
  };

  const clearSleepNotif = async () => {
    if (notifInterval.current) clearInterval(notifInterval.current);
    if (sleepNotifId.current) {
      await Notifications.dismissNotificationAsync(sleepNotifId.current).catch(() => {});
      sleepNotifId.current = null;
    }
  };

  // ── 开始睡眠 ─────────────────────────────────────────────────
  const startSleep = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const now = new Date();
    setSleepStart(now);
    setNowTime(now);
    setIsSleeping(true);
    // 启动背景音乐
    const audio = sleepAudios.find(a => a.id === sleepAudioId);
    if (audio) await startBgMusic(audio.uri, audio.name);
    // 发送锁屏通知
    await sendSleepNotif(now);
  };

  // ── 结束睡眠（长按2秒确认） ──────────────────────────────────
  const onStopPressIn = () => {
    let pct = 0;
    stopHoldTimer.current = setInterval(() => {
      pct += 0.05;
      setStopHoldPct(Math.min(pct, 1));
      if (pct >= 1) {
        clearInterval(stopHoldTimer.current!);
        finishSleep();
      }
    }, 100);
  };
  const onStopPressOut = () => {
    if (stopHoldTimer.current) clearInterval(stopHoldTimer.current);
    setStopHoldPct(0);
  };
  const finishSleep = async () => {
    setIsSleeping(false);
    setSleepStart(null);
    setStopHoldPct(0);
    await clearSleepNotif();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast('睡眠结束，早安 ☀️');
  };

  // 离开页面时清理
  useEffect(() => () => {
    if (clockTimer.current)    clearInterval(clockTimer.current);
    if (stopHoldTimer.current) clearInterval(stopHoldTimer.current);
    if (notifInterval.current) clearInterval(notifInterval.current);
  }, []);

  // ── 加载配置 ──────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    const { data } = await supabase
      .from('sleep_config')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (data) {
      setBedTime(data.bed_time ?? '22:30');
      setWakeTime(data.wake_time ?? '07:00');
      setNotifEnabled(data.notification_enabled ?? true);
      setSleepAudioId(data.sleep_audio_id ?? null);
      setConfigId(data.id);
    }
    // 加载睡眠用途音频
    const audios = await getAllAudios();
    setSleepAudios(audios.filter(a => a.usages.includes('sleep')));
    setLoading(false);
  }, [session]);

  useFocusEffect(useCallback(() => { loadConfig(); }, [loadConfig]));

  // 每次打开音频选择器时刷新列表
  useEffect(() => {
    if (showAudioPicker) {
      (async () => {
        const audios = await getAllAudios();
        setSleepAudios(audios.filter(a => a.usages.includes('sleep')));
      })();
    }
  }, [showAudioPicker]);

  // ── 申请通知权限 ──────────────────────────────────────────────
  const requestNotifPermission = async (): Promise<boolean> => {
    if (process.env.EXPO_OS === 'web') return false;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  };

  // ── 计算睡前/起床提醒触发时间 ────────────────────────────────
  const scheduleNotifications = async () => {
    if (process.env.EXPO_OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!notifEnabled) return;
    const { h: bH, m: bM } = parseTime(bedTime);
    const { h: wH, m: wM } = parseTime(wakeTime);
    await Notifications.scheduleNotificationAsync({
      content: { title: '🌙 该睡觉啦', body: `设定入睡时间 ${bedTime}，好好休息，明天又是新的开始 ✨` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: bH, minute: bM },
    });
    await Notifications.scheduleNotificationAsync({
      content: { title: '☀️ 早安，新的一天', body: `起床时间 ${wakeTime} 到啦，微光陪你开启美好清晨 🌸` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: wH, minute: wM },
    });
  };

  // ── 保存配置 ──────────────────────────────────────────────────
  const saveConfig = async () => {
    if (!session) return;
    setSaving(true);
    // 申请通知权限
    if (notifEnabled) {
      const granted = await requestNotifPermission();
      if (!granted) {
        showToast('未获得通知权限，已关闭提醒');
        setNotifEnabled(false);
        setSaving(false);
        return;
      }
    }
    // 写入数据库
    const payload = {
      user_id: session.user.id,
      bed_time: bedTime,
      wake_time: wakeTime,
      notification_enabled: notifEnabled,
      sleep_audio_id: sleepAudioId,
      updated_at: new Date().toISOString(),
    };
    if (configId) {
      await supabase.from('sleep_config').update(payload).eq('id', configId);
    } else {
      const { data } = await supabase.from('sleep_config').insert(payload).select().single();
      if (data) setConfigId(data.id);
    }
    // 安排通知
    await scheduleNotifications();
    setSaving(false);
    showToast('睡眠计划已保存 ✓');
  };

  const selectedAudio = sleepAudios.find(a => a.id === sleepAudioId);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F1035', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#A5ADDE" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0F1035' }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* 导航栏 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
          <Pressable onPress={() => router.back()}
            style={{ marginRight: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={18} color="#E8E9F0" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF' }}>沉浸式睡眠 💤</Text>
            <Text style={{ fontSize: 12, color: '#8B90C4', marginTop: 1 }}>定制你的专属入眠仪式</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
          {/* 星空装饰 */}
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Text style={{ fontSize: 56, marginBottom: 8 }}>🌌</Text>
            <Text style={{ fontSize: 13, color: '#8B90C4', textAlign: 'center', lineHeight: 20 }}>
              科学作息 · 沉浸背景音{'\n'}让每一夜都成为深度修复之旅
            </Text>
          </View>

          {/* 入睡时间 */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 24, padding: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Moon size={18} color="#A5ADDE" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>入睡时间</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TimePicker value={bedTime} onChange={setBedTime} />
            </View>
          </View>

          {/* 起床时间 */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 24, padding: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Sunrise size={18} color="#FFD97A" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>起床时间</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TimePicker value={wakeTime} onChange={setWakeTime} />
            </View>
            {/* 睡眠时长提示 */}
            {(() => {
              const { h: bH, m: bM } = parseTime(bedTime);
              const { h: wH, m: wM } = parseTime(wakeTime);
              let mins = (wH * 60 + wM) - (bH * 60 + bM);
              if (mins < 0) mins += 24 * 60;
              const hours = Math.floor(mins / 60);
              const remainMin = mins % 60;
              const label = `${hours}小时${remainMin > 0 ? ` ${remainMin}分钟` : ''}`;
              const color = hours >= 7 ? '#5DD6B3' : hours >= 6 ? '#FFD97A' : '#FF8A8A';
              return (
                <View style={{ backgroundColor: `${color}18`, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color, fontWeight: '600' }}>
                    预计睡眠 {label} {hours >= 7 ? '✨ 充足' : hours >= 6 ? '⚠️ 略少' : '❗ 不足'}
                  </Text>
                </View>
              );
            })()}
          </View>

          {/* ── 精简功能按钮行：系统提醒 + 睡眠背景音 ── */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>

            {/* 系统提醒开关按钮 */}
            <Pressable
              onPress={() => setNotifEnabled(v => !v)}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: notifEnabled ? 'rgba(107,126,200,0.25)' : 'rgba(255,255,255,0.06)',
                borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: notifEnabled ? 'rgba(107,126,200,0.5)' : 'rgba(255,255,255,0.1)',
              }}>
              {notifEnabled
                ? <Bell size={16} color="#A5ADDE" />
                : <BellOff size={16} color="#6B7280" />}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: notifEnabled ? '#A5ADDE' : '#6B7280' }}>
                  定时提醒
                </Text>
                <Text style={{ fontSize: 10, color: notifEnabled ? '#6B7EC8' : '#4B5563', marginTop: 1 }}>
                  {notifEnabled ? '已开启' : '已关闭'}
                </Text>
              </View>
            </Pressable>

            {/* 背景音选择按钮 */}
            <Pressable
              onPress={() => setShowAudioPicker(true)}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: selectedAudio ? 'rgba(107,126,200,0.25)' : 'rgba(255,255,255,0.06)',
                borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: selectedAudio ? 'rgba(107,126,200,0.5)' : 'rgba(255,255,255,0.1)',
              }}>
              <Music2 size={16} color={selectedAudio ? '#A5ADDE' : '#6B7280'} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: selectedAudio ? '#A5ADDE' : '#6B7280' }}>
                  背景音乐
                </Text>
                <Text style={{ fontSize: 10, color: selectedAudio ? '#6B7EC8' : '#4B5563', marginTop: 1 }} numberOfLines={1}>
                  {selectedAudio ? selectedAudio.name : '未选择'}
                </Text>
              </View>
              {selectedAudio && <Check size={13} color="#A5ADDE" />}
            </Pressable>
          </View>

          {/* 按钮组：保存 + 开始 */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
            <Pressable onPress={saveConfig} disabled={saving}
              style={{ flex: 1, backgroundColor: 'rgba(107,126,200,0.35)', borderRadius: 22, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(107,126,200,0.5)' }}>
              {saving
                ? <ActivityIndicator color="#A5ADDE" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: '#A5ADDE' }}>保存计划</Text>}
            </Pressable>
            <Pressable onPress={startSleep}
              style={{ flex: 1.3, backgroundColor: '#6B7EC8', borderRadius: 22, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Play size={16} color="#FFFFFF" />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>开始睡眠</Text>
            </Pressable>
          </View>

          {process.env.EXPO_OS === 'web' && (
            <Text style={{ fontSize: 11, color: '#8B90C4', textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
              系统通知在真机上生效，Web 预览环境仅支持设置保存
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── 音频选择弹窗 ── */}
      <Modal visible={showAudioPicker} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#1A1D3C', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 36, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>选择睡眠背景音</Text>
              <Pressable onPress={() => setShowAudioPicker(false)}>
                <Text style={{ fontSize: 22, color: '#8B90C4' }}>✕</Text>
              </Pressable>
            </View>

            {sleepAudios.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 13, color: '#8B90C4', textAlign: 'center', lineHeight: 20 }}>
                  音频库中暂无「睡眠背景音」{'\n'}前往声音库为音频添加睡眠标签
                </Text>
                <Pressable onPress={() => { setShowAudioPicker(false); router.push('/(app)/audio-library' as any); }}
                  style={{ backgroundColor: 'rgba(107,126,200,0.4)', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, color: '#A5ADDE', fontWeight: '600' }}>前往声音库</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={sleepAudios}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 8 }}
                renderItem={({ item: audio }) => {
                  const isSelected = audio.id === sleepAudioId;
                  return (
                    <Pressable onPress={() => { setSleepAudioId(audio.id); setShowAudioPicker(false); }}
                      style={{ backgroundColor: isSelected ? 'rgba(107,126,200,0.3)' : 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isSelected ? '#6B7EC8' : 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                        <Music2 size={16} color={isSelected ? '#FFFFFF' : '#8B90C4'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '600' }} numberOfLines={1}>{audio.name}</Text>
                      </View>
                      {isSelected && <Check size={16} color="#A5ADDE" />}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── 沉浸式睡眠运行态全屏覆盖 ── */}
      <Modal visible={isSleeping} animationType="fade" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#080B26' }}>
          <StatusBar style="light" />
          <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 40, paddingHorizontal: 24 }}>

            {/* 顶部标识 */}
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: 'rgba(107,126,200,0.25)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(107,126,200,0.4)' }}>
                <Text style={{ fontSize: 12, color: '#A5ADDE', fontWeight: '700', letterSpacing: 1 }}>🌙 睡眠进行中</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#4B52A0' }}>
                {sleepStart
                  ? `${String(sleepStart.getHours()).padStart(2,'0')}:${String(sleepStart.getMinutes()).padStart(2,'0')} 开始入睡`
                  : ''}
              </Text>
            </View>

            {/* 主气泡：当前时间 */}
            <View style={{ alignItems: 'center', gap: 20 }}>
              {/* 发光气泡 */}
              <View style={{
                width: 240, height: 240, borderRadius: 120,
                backgroundColor: 'rgba(107,126,200,0.12)',
                borderWidth: 1.5, borderColor: 'rgba(107,126,200,0.3)',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#6B7EC8', shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6, shadowRadius: 40,
              }}>
                <Text style={{ fontSize: 13, color: '#6B7EC8', fontWeight: '600', marginBottom: 4, letterSpacing: 2 }}>当前时间</Text>
                <Text style={{ fontSize: 44, fontWeight: '200', color: '#FFFFFF', letterSpacing: 4, fontVariant: ['tabular-nums'] }}>
                  {fmtClock(nowTime).slice(0, 5)}
                </Text>
                <Text style={{ fontSize: 22, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontVariant: ['tabular-nums'] }}>
                  :{fmtClock(nowTime).slice(6)}
                </Text>
              </View>

              {/* 已入睡时长 */}
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 12, color: '#4B52A0', letterSpacing: 1 }}>已入睡</Text>
                <Text style={{ fontSize: 28, fontWeight: '300', color: '#A5ADDE', letterSpacing: 2, fontVariant: ['tabular-nums'] }}>
                  {sleepStart ? elapsedLabel(sleepStart, nowTime) : '00:00'}
                </Text>
              </View>

              {/* 计划起床时间 */}
              <View style={{ backgroundColor: 'rgba(255,217,122,0.1)', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,217,122,0.2)' }}>
                <Text style={{ fontSize: 13, color: '#FFD97A', textAlign: 'center' }}>
                  ☀️ 计划起床 <Text style={{ fontWeight: '700' }}>{wakeTime}</Text>
                </Text>
              </View>
            </View>

            {/* 底部：长按2秒结束 */}
            <View style={{ alignItems: 'center', gap: 12, width: '100%' }}>
              <Text style={{ fontSize: 11, color: '#4B52A0' }}>长按下方按钮2秒以结束睡眠</Text>
              <View style={{ width: '100%', height: 58, borderRadius: 29, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                {/* 进度条背景 */}
                <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${stopHoldPct * 100}%`, backgroundColor: 'rgba(255,100,100,0.25)', borderRadius: 29 }} />
                <Pressable
                  onPress={() => {}}
                  onPressIn={onStopPressIn}
                  onPressOut={onStopPressOut}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <StopCircle size={18} color={stopHoldPct > 0 ? '#FF8A8A' : '#6B7280'} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: stopHoldPct > 0 ? '#FF8A8A' : '#6B7280' }}>
                    {stopHoldPct > 0 ? `结束中 ${Math.round(stopHoldPct * 100)}%` : '结束睡眠'}
                  </Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 10, color: '#2D3460', textAlign: 'center', lineHeight: 16 }}>
                手机可正常熄屏，锁屏将持续显示睡眠进度通知{'\n'}背景音乐将持续播放
              </Text>
            </View>

          </SafeAreaView>
        </View>
      </Modal>

      {/* Toast */}
      {toast && (
        <View style={{ position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
