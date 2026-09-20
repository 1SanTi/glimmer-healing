import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, FlatList, Animated, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BookOpen, BookHeart } from 'lucide-react-native';
import { useSubscription } from '@/hooks/useSubscription';
import UpgradeModal from '@/components/UpgradeModal';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop, ClipPath, Rect } from 'react-native-svg';
import { useSession } from '@/ctx';
import {
  getHappinessLogs,
  getMyTasks, completeTask,
  getFeaturedArticles,
} from '@/db/api';
import { supabase } from '@/client/supabase';
import type { HappinessLog, PositiveTask, Article } from '@/types/types';

import { AnimatedTabBar } from '@/components/AnimatedTabBar';
import { SwipeTabView } from '@/components/SwipeTabView';
import { useHeron } from '@/components/heron/HeronProvider';
// 本地日期字符串（非 UTC），保证 UTC+8 等时区零点后正确归属当天
function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// created_at 是 UTC 时间戳，需转换为本地日期再比较
function createdAtToLocalDate(createdAt: string) {
  const d = new Date(createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const VIRTUES = [
  { id: 'wisdom', label: '智慧', emoji: '💡', strengths: ['创意', '好奇心', '判断力', '热爱学习', '洞察力'] },
  { id: 'courage', label: '勇气', emoji: '⚡', strengths: ['勇敢', '坚持', '诚实', '热情'] },
  { id: 'humanity', label: '仁爱', emoji: '💖', strengths: ['爱与被爱', '善良', '社会智慧'] },
  { id: 'justice', label: '正义', emoji: '⚖️', strengths: ['团队精神', '公平', '领导力'] },
  { id: 'temperance', label: '节制', emoji: '🛡️', strengths: ['宽恕', '谦逊', '谨慎', '自律'] },
  { id: 'transcendence', label: '超越', emoji: '✨', strengths: ['审美', '感恩', '希望', '幽默', '灵性'] },
];

const ARTICLES_CATEGORY_COLORS: Record<string, string> = {
  emotion: '#E8A365', stress: '#9B8EC4', self: '#7A9D8C',
  frontier: '#5B9BD5', satir: '#C4856A', positive: '#E8C56A',
};

const ACADEMY_TABS = [
  { id: 'positive', label: '🌟 积极心理学' },
  { id: 'science',  label: '📖 心理科普' },
  { id: 'course',   label: '📋 个人备课' },
];

export default function AcademyScreen() {
  const { session } = useSession();
  const router = useRouter();
  const { open: openHeron } = useHeron();
  const { width: screenW } = useWindowDimensions();
  // scrollX：SwipeTabView 实时写入水平偏移，AnimatedTabBar 实时读取插值
  const scrollX = useSharedValue(0);
  const [tab, setTab] = useState<'positive' | 'science' | 'course'>('positive');

  // 订阅拦截
  const { level: subLevel } = useSubscription();
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [upgradeReq, setUpgradeReq] = useState<{ level: 1 | 2; name: string; desc: string }>({
    level: 2, name: '', desc: '',
  });
  function requirePro(name: string, desc: string, go: () => void) {
    if (subLevel >= 2) { go(); return; }
    setUpgradeReq({ level: 2, name, desc });
    setUpgradeVisible(true);
  }
  const activeIndex = ACADEMY_TABS.findIndex(t => t.id === tab);
  const [logs, setLogs] = useState<HappinessLog[]>([]);
  const [tasks, setTasks] = useState<PositiveTask[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEvent, setNewEvent] = useState('');
  const [eventType, setEventType] = useState<'positive' | 'negative'>('positive');
  const [posting, setPosting] = useState(false);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  // 曲线进入动画：0→1 驱动 strokeDashoffset
  const curveAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const uid = session?.user.id;
        const [logsData, tasksData, articlesData] = await Promise.all([
          uid ? getHappinessLogs(uid, 50) : [],
          uid ? getMyTasks(uid) : [],
          getFeaturedArticles(12),
        ]);
        setLogs(logsData);
        setTasks(tasksData);
        setArticles(articlesData);
        setLoading(false);
        // 每次进入页面触发曲线绘制动画
        curveAnim.setValue(0);
        Animated.timing(curveAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }).start();
      })();
    }, [session, curveAnim])
  );

  const [addError, setAddError] = useState('');
  // 近期历史记录展开/收纳
  const [historyExpanded, setHistoryExpanded] = useState(false);
  // 今日记录展开/收纳（默认展开）
  const [todayExpanded, setTodayExpanded] = useState(true);

  const handleAddLog = async () => {
    if (!session || !newEvent.trim()) return;
    setPosting(true);
    setAddError('');
    const score = eventType === 'positive' ? 3 : -2;
    const { error } = await supabase.from('happiness_logs').insert({
      user_id: session.user.id,
      event_type: eventType,
      event_desc: newEvent.trim(),
      score,
      log_date: localDateStr(), // 本地日期，确保与过滤逻辑一致
    });
    if (error) {
      setAddError('记录失败，请重试');
      setPosting(false);
      return;
    }
    setNewEvent('');
    const updated = await getHappinessLogs(session.user.id, 50);
    setLogs(updated);
    setPosting(false);
    // 新增记录后重新触发曲线动画（好事/难事都要更新）
    curveAnim.setValue(0);
    Animated.timing(curveAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!session || completingTask) return;
    setCompletingTask(taskId);
    await completeTask(taskId);
    const updated = await getMyTasks(session.user.id);
    setTasks(updated);
    setCompletingTask(null);
  };

  const avgHappiness = logs.length > 0
    ? (logs.reduce((s, l) => s + l.score, 0) / logs.length).toFixed(1)
    : '--';

  const CATEGORY_LABELS: Record<string, string> = {
    emotion: '情绪管理', stress: '压力适应', self: '自我探索',
    frontier: '前沿研究', satir: '沟通姿态', positive: '积极心理',
  };
  const CATEGORY_EMOJI: Record<string, string> = {
    emotion: '💭', stress: '🏔', self: '🪞', frontier: '🔬', satir: '💬', positive: '🌟',
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#E8A365" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="px-5 pt-14 pb-4">
        <Text className="text-2xl font-bold text-foreground">学苑 📚</Text>
        <Text className="text-muted-foreground text-sm mt-1">积极成长，探索内在优势</Text>
        <View className="mt-4">
          <AnimatedTabBar
            tabs={ACADEMY_TABS}
            activeId={tab}
            onChange={(id) => setTab(id as 'positive' | 'science' | 'course')}
            scrollX={scrollX}
            screenW={screenW}
          />
        </View>
      </View>

      <SwipeTabView
        activeIndex={activeIndex}
        onIndexChange={(i) => setTab(ACADEMY_TABS[i].id as 'positive' | 'science' | 'course')}
        scrollX={scrollX}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" nestedScrollEnabled>
          <View className="px-5 pb-24 gap-4">
            {/* 幸福度日志 */}
            <View className="bg-card rounded-2xl p-4"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-foreground font-bold text-base">📈 幸福度追踪</Text>
                <View className="bg-primary/10 rounded-xl px-3 py-1">
                  <Text className="text-primary font-semibold text-sm">近7天均值 {avgHappiness}</Text>
                </View>
              </View>

              {/* 心理能量日内时刻曲线 —— X轴=一天时刻, 贝塞尔平滑 + 入场动画 */}
              {logs.length === 0 ? (
                <View className="items-center justify-center py-6 mb-4">
                  <Text className="text-3xl mb-2">📈</Text>
                  <Text className="text-muted-foreground text-xs text-center">记录事件后这里会生成能量曲线</Text>
                </View>
              ) : (() => {
                const W = 320, H = 130, PAD_L = 26, PAD_R = 12, PAD_TOP = 16, PAD_BOT = 22;
                const graphW = W - PAD_L - PAD_R;
                const graphH = H - PAD_TOP - PAD_BOT;

                // 严格只展示今天（本地日期）的记录，不回退到历史日期
                const todayLocal = localDateStr();
                const dayLogs = logs.filter(l => (l.log_date ?? createdAtToLocalDate(l.created_at)) === todayLocal);
                // 今日无记录 → 显示空状态（不回退历史，确保每日从零开始）
                if (dayLogs.length === 0) {
                  return (
                    <View className="items-center justify-center py-6 mb-4">
                      <Text className="text-3xl mb-2">🌅</Text>
                      <Text className="text-muted-foreground text-xs text-center">今日还没有记录{'\n'}快来记录第一件事吧 ✨</Text>
                    </View>
                  );
                }
                // 按时间升序
                const sorted = [...dayLogs].sort(
                  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );

                // 构造「累积能量 vs 小时」的折线点序列
                // 起始点：0时刻，累积=0
                type Pt = { hour: number; cumScore: number; eventType: 'start' | 'positive' | 'negative' };
                const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
                const points: Pt[] = [{ hour: 0, cumScore: 0, eventType: 'start' }];
                let cum = 0;
                sorted.forEach(l => {
                  const d = new Date(l.created_at);
                  const h = d.getHours() + d.getMinutes() / 60;
                  cum += l.event_type === 'positive' ? 3 : -2;
                  points.push({ hour: h, cumScore: cum, eventType: l.event_type as 'positive' | 'negative' });
                });
                // 结束点：延伸到当前时刻（保持最后一个分值）
                const lastHour = Math.min(24, Math.max(nowHour, points[points.length - 1].hour + 0.5));
                if (lastHour > points[points.length - 1].hour) {
                  points.push({ hour: lastHour, cumScore: cum, eventType: 'start' });
                }

                const n = points.length;
                // Y 轴范围：以 0 为基准，上下各留 headroom
                const scores = points.map(p => p.cumScore);
                const maxS = Math.max(0, ...scores);
                const minS = Math.min(0, ...scores);
                const yRange = Math.max(6, maxS - minS + 2); // 最小范围 6，避免平线时压缩
                const yMid = (maxS + minS) / 2;

                const toX = (h: number) => PAD_L + (h / 24) * graphW;
                const toY = (s: number) => PAD_TOP + ((yMid + yRange / 2 - s) / yRange) * graphH;
                const zeroY = toY(0);

                const buildPath = () => {
                  if (n < 2) return `M ${toX(points[0].hour)} ${toY(points[0].cumScore)}`;
                  const tension = 0.4;
                  let d = `M ${toX(points[0].hour)} ${toY(points[0].cumScore)}`;
                  for (let i = 0; i < n - 1; i++) {
                    const x0 = toX(points[i].hour),       y0 = toY(points[i].cumScore);
                    const x1 = toX(points[i + 1].hour),   y1 = toY(points[i + 1].cumScore);
                    const xp = i > 0 ? toX(points[i - 1].hour) : x0;
                    const yp = i > 0 ? toY(points[i - 1].cumScore) : y0;
                    const xn = i + 2 < n ? toX(points[i + 2].hour) : x1;
                    const yn = i + 2 < n ? toY(points[i + 2].cumScore) : y1;
                    const cp1x = x0 + (x1 - xp) * tension;
                    const cp1y = y0 + (y1 - yp) * tension;
                    const cp2x = x1 - (xn - x0) * tension;
                    const cp2y = y1 - (yn - y0) * tension;
                    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
                  }
                  return d;
                };

                const smoothPath = buildPath();
                const fillPath = `${smoothPath} L ${toX(points[n - 1].hour)} ${zeroY} L ${toX(points[0].hour)} ${zeroY} Z`;

                const DASH = 1400;
                const dashOffset = curveAnim.interpolate({ inputRange: [0, 1], outputRange: [DASH, 0] });
                const AnimatedPath = Animated.createAnimatedComponent(Path);

                // 今日标签 — 用本地日期
                const todayLabel = (() => {
                  const now = new Date();
                  return `${now.getMonth() + 1}月${now.getDate()}日`;
                })();

                return (
                  <View className="mb-3">
                    {/* 日期标题 */}
                    <View className="flex-row items-center justify-between mb-1 px-0.5">
                      <Text className="text-muted-foreground font-medium" style={{ fontSize: 10 }}>
                        🕐 {todayLabel} 能量时间线
                      </Text>
                      <Text style={{ fontSize: 10, color: cum >= 0 ? '#7A9D8C' : '#E88A7D', fontWeight: '700' }}>
                        今日合计 {cum >= 0 ? '+' : ''}{cum}
                      </Text>
                    </View>

                    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                      <Defs>
                        {/* 正向（曲线在零线上方）：从上到下淡出 */}
                        <LinearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor="#7A9D8C" stopOpacity="0.28" />
                          <Stop offset="1" stopColor="#7A9D8C" stopOpacity="0.02" />
                        </LinearGradient>
                        {/* 负向（曲线在零线下方）：从上到下加深，与正向镜像 */}
                        <LinearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor="#E88A7D" stopOpacity="0.02" />
                          <Stop offset="1" stopColor="#E88A7D" stopOpacity="0.28" />
                        </LinearGradient>
                        {/* 裁剪：只保留零线以上（正向区域）*/}
                        <ClipPath id="clipAbove">
                          <Rect x={0} y={0} width={W} height={zeroY} />
                        </ClipPath>
                        {/* 裁剪：只保留零线以下（负向区域）*/}
                        <ClipPath id="clipBelow">
                          <Rect x={0} y={zeroY} width={W} height={H - zeroY} />
                        </ClipPath>
                      </Defs>

                      {/* Y轴辅助线与标签 */}
                      {[zeroY].map(y => (
                        <Line key="zero" x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                          stroke="#D1D5DB" strokeWidth="1.2" strokeDasharray="5,4" />
                      ))}
                      <SvgText x={PAD_L - 4} y={zeroY + 3} fontSize="7.5" fill="#C0C4CC" textAnchor="end">0</SvgText>
                      {maxS > 0 && (
                        <SvgText x={PAD_L - 4} y={toY(maxS) + 3} fontSize="7.5" fill="#7A9D8C" textAnchor="end">+{maxS}</SvgText>
                      )}
                      {minS < 0 && (
                        <SvgText x={PAD_L - 4} y={toY(minS) + 3} fontSize="7.5" fill="#E88A7D" textAnchor="end">{minS}</SvgText>
                      )}

                      {/* X轴时刻刻度线 */}
                      {[0, 6, 12, 18, 24].map(h => (
                        <Line key={h} x1={toX(h)} y1={PAD_TOP} x2={toX(h)} y2={H - PAD_BOT + 4}
                          stroke="#F3F4F6" strokeWidth="0.8" />
                      ))}

                      {/* 面积填充：正向绿（零线以上）+ 负向红（零线以下） */}
                      <Path d={fillPath} fill="url(#gradPos)" clipPath="url(#clipAbove)" />
                      <Path d={fillPath} fill="url(#gradNeg)" clipPath="url(#clipBelow)" />

                      {/* 平滑贝塞尔曲线（动画描边）*/}
                      <AnimatedPath
                        d={smoothPath}
                        fill="none"
                        stroke="#E8A365"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={`${DASH} ${DASH}`}
                        strokeDashoffset={dashOffset as any}
                      />

                      {/* 事件数据点：好事=绿圆 / 难事=红圆 / start=不显示 */}
                      {points.map((p, i) => {
                        if (p.eventType === 'start') return null;
                        const cx = toX(p.hour), cy = toY(p.cumScore);
                        const isPos = p.eventType === 'positive';
                        return (
                          <Circle key={i} cx={cx} cy={cy} r="5"
                            fill={isPos ? '#7A9D8C' : '#E88A7D'}
                            stroke="white" strokeWidth="2" />
                        );
                      })}

                      {/* 最新事件点的分值气泡（排除start/end虚拟点）*/}
                      {(() => {
                        const eventPts = points.filter(p => p.eventType !== 'start');
                        if (eventPts.length === 0) return null;
                        const last = eventPts[eventPts.length - 1];
                        const lx = toX(last.hour), ly = toY(last.cumScore);
                        const label = last.cumScore >= 0 ? `+${last.cumScore}` : `${last.cumScore}`;
                        const bubbleColor = last.cumScore >= 0 ? '#7A9D8C' : '#E88A7D';
                        return (
                          <>
                            <Path
                              d={`M ${lx - 15} ${ly - 23} Q ${lx} ${ly - 27} ${lx + 15} ${ly - 23} L ${lx + 15} ${ly - 11} Q ${lx} ${ly - 7} ${lx - 15} ${ly - 11} Z`}
                              fill={bubbleColor} opacity="0.9" />
                            <SvgText x={lx} y={ly - 13} fontSize="9" fill="white"
                              textAnchor="middle" fontWeight="bold">{label}</SvgText>
                          </>
                        );
                      })()}

                      {/* X轴时刻标签 */}
                      {[0, 6, 12, 18, 24].map(h => (
                        <SvgText key={h} x={toX(h)} y={H - 5}
                          fontSize="8.5" fill="#9CA3AF" textAnchor="middle">
                          {h === 0 ? '0时' : h === 24 ? '24时' : `${h}时`}
                        </SvgText>
                      ))}
                    </Svg>

                    {/* 图例 */}
                    <View className="flex-row justify-between px-1 mt-1.5">
                      <View className="flex-row items-center gap-1">
                        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#7A9D8C' }} />
                        <Text className="text-muted-foreground" style={{ fontSize: 10 }}>好事 +3能量</Text>
                      </View>
                      <Text className="text-muted-foreground font-medium" style={{ fontSize: 10 }}>🌊 能量波动曲线</Text>
                      <View className="flex-row items-center gap-1">
                        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#E88A7D' }} />
                        <Text className="text-muted-foreground" style={{ fontSize: 10 }}>难事 -2能量</Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* 近期事件列表：今日默认展示，近期可收纳/展开 */}
              {(() => {
                if (logs.length === 0) return (
                  <View className="bg-muted/50 rounded-xl px-3 py-2 mb-3">
                    <Text className="text-muted-foreground text-xs text-center">暂无记录，快来记录第一件事吧 ✨</Text>
                  </View>
                );
                const todayLocal = localDateStr();
                const todayLogs = logs.filter(l => (l.log_date ?? createdAtToLocalDate(l.created_at)) === todayLocal);
                const prevLogs  = logs.filter(l => (l.log_date ?? createdAtToLocalDate(l.created_at)) !== todayLocal);
                return (
                  <View className="mb-3 gap-2">
                    {/* 今日事件 */}
                    {todayLogs.length > 0 ? (
                      <View className="gap-1.5">
                        {/* 可点击的「今日」标题行（支持收纳/展开） */}
                        <Pressable
                          className="flex-row items-center gap-1"
                          onPress={() => setTodayExpanded(v => !v)}
                        >
                          <Text className="text-foreground text-xs font-semibold">📅 今日</Text>
                          <Text className="text-muted-foreground" style={{ fontSize: 10 }}>
                            （{todayLogs.length}条）
                          </Text>
                          <Text className="text-muted-foreground" style={{ fontSize: 10 }}>
                            {todayExpanded ? '▲ 收起' : '▼ 展开'}
                          </Text>
                        </Pressable>
                        {todayExpanded && todayLogs.map(l => (
                          <View key={l.id} className="flex-row items-center gap-2 rounded-xl px-3 py-2"
                            style={{ backgroundColor: l.event_type === 'positive' ? '#F0FAF5' : '#FFF2F0' }}>
                            <Text style={{ fontSize: 14 }}>{l.event_type === 'positive' ? '😊' : '😔'}</Text>
                            <View className="flex-1">
                              <Text className="text-xs font-medium" numberOfLines={1}
                                style={{ color: l.event_type === 'positive' ? '#3D7A5A' : '#B05040' }}>
                                {l.event_desc}
                              </Text>
                              <Text style={{ fontSize: 9, color: l.event_type === 'positive' ? '#7A9D8C' : '#E88A7D' }}>
                                {l.event_type === 'positive' ? '好事 · +3能量' : '难事 · -2能量'}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 11, color: l.event_type === 'positive' ? '#7A9D8C' : '#E88A7D', fontWeight: '700' }}>
                              {l.event_type === 'positive' ? '+3' : '-2'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text className="text-muted-foreground text-xs text-center py-1">今日还没有记录 ✨</Text>
                    )}

                    {/* 近期历史：可收纳/展开 */}
                    {prevLogs.length > 0 && (
                      <View className="gap-1.5">
                        {/* 可点击的「近期」标题行 */}
                        <Pressable
                          className="flex-row items-center gap-1"
                          onPress={() => setHistoryExpanded(v => !v)}
                        >
                          <Text className="text-foreground text-xs font-semibold">🗓 近期</Text>
                          <Text className="text-muted-foreground" style={{ fontSize: 10 }}>
                            （{prevLogs.length}条）
                          </Text>
                          <Text className="text-muted-foreground" style={{ fontSize: 10 }}>
                            {historyExpanded ? '▲ 收起' : '▼ 展开'}
                          </Text>
                        </Pressable>
                        {/* 历史列表：仅展开时渲染 */}
                        {historyExpanded && prevLogs.map(l => {
                          const d = new Date(l.created_at);
                          const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                          return (
                            <View key={l.id} className="flex-row items-center gap-2 rounded-xl px-3 py-2 bg-muted/40">
                              <Text style={{ fontSize: 13 }}>{l.event_type === 'positive' ? '😊' : '😔'}</Text>
                              <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>{l.event_desc}</Text>
                              <Text style={{ fontSize: 9, color: '#9CA3AF' }}>{dateStr}</Text>
                              <Text style={{ fontSize: 10, color: l.event_type === 'positive' ? '#7A9D8C' : '#E88A7D', fontWeight: '700', minWidth: 20, textAlign: 'right' }}>
                                {l.event_type === 'positive' ? '+3' : '-2'}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* 添加事件 */}
              {session && (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    <Pressable
                      className={`flex-row items-center gap-1 px-3 py-1.5 rounded-xl border ${eventType === 'positive' ? 'bg-green-50 border-green-300' : 'bg-muted border-border'}`}
                      onPress={() => setEventType('positive')}
                    >
                      <Text className="text-sm">😊</Text>
                      <Text className={`text-xs font-medium ${eventType === 'positive' ? 'text-green-700' : 'text-muted-foreground'}`}>好事</Text>
                    </Pressable>
                    <Pressable
                      className={`flex-row items-center gap-1 px-3 py-1.5 rounded-xl border ${eventType === 'negative' ? 'bg-orange-50 border-orange-300' : 'bg-muted border-border'}`}
                      onPress={() => setEventType('negative')}
                    >
                      <Text className="text-sm">😔</Text>
                      <Text className={`text-xs font-medium ${eventType === 'negative' ? 'text-orange-700' : 'text-muted-foreground'}`}>难事</Text>
                    </Pressable>
                  </View>
                  <View className="flex-row gap-2">
                    <TextInput
                      className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-foreground text-sm"
                      placeholder="记录今天发生的事..."
                      placeholderTextColor="#9CA3AF"
                      value={newEvent}
                      onChangeText={setNewEvent}
                    />
                    <Pressable
                      className="bg-primary rounded-xl px-4 items-center justify-center"
                      onPress={handleAddLog}
                      disabled={posting || !newEvent.trim()}
                      style={{ opacity: posting || !newEvent.trim() ? 0.5 : 1 }}
                    >
                      {posting ? <ActivityIndicator color="white" size="small" /> : <Text className="text-primary-foreground text-sm font-medium">记录</Text>}
                    </Pressable>
                  </View>
                  {addError ? <Text className="text-destructive text-xs mt-1">{addError}</Text> : null}
                </View>
              )}
            </View>

            {/* 品格优势美德 */}
            <View>
              <Text className="text-foreground font-bold text-base mb-3">⭐ 六大美德</Text>
              <View className="flex-row flex-wrap gap-2">
                {VIRTUES.map(v => (
                  <View key={v.id} className="bg-card rounded-2xl p-3"
                    style={{ width: '47%', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.05)' }] }}>
                    <Text className="text-xl mb-1">{v.emoji}</Text>
                    <Text className="text-foreground font-semibold text-sm mb-1">{v.label}</Text>
                    <Text className="text-muted-foreground text-xs leading-4">{v.strengths.join(' · ')}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 美德微行动任务 */}
            <View>
              <Text className="text-foreground font-bold text-base mb-3">🎯 今日微行动</Text>
              {tasks.length === 0 ? (
                <View className="bg-card rounded-2xl p-6 items-center">
                  <Text className="text-3xl mb-2">✨</Text>
                  <Text className="text-muted-foreground text-sm text-center">暂无任务，去测玩中心完成测评解锁专属任务</Text>
                </View>
              ) : (
                <View className="gap-2">
                  {tasks.slice(0, 5).map(task => (
                    <View key={task.id} className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center"
                      style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.04)' }] }}>
                      <View className="flex-1">
                        <Text className={`text-sm font-medium ${task.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.task_title}</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">{task.task_type}</Text>
                      </View>
                      <Pressable
                        className={`rounded-xl px-3 py-1.5 ml-3 ${task.is_completed ? 'bg-muted' : 'bg-primary'}`}
                        onPress={() => !task.is_completed && handleCompleteTask(task.id)}
                        disabled={task.is_completed || completingTask === task.id}
                      >
                        {completingTask === task.id
                          ? <ActivityIndicator size="small" color="white" />
                          : <Text className={`text-xs font-medium ${task.is_completed ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
                              {task.is_completed ? '已完成 ✓' : '完成'}
                            </Text>
                        }
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" nestedScrollEnabled>
          <View className="px-5 pb-24">
            {/* 分类专栏 */}
            {[
              { key: 'emotion', title: '💭 情绪管理' },
              { key: 'stress', title: '🏔 压力适应' },
              { key: 'self', title: '🪞 自我探索' },
              { key: 'frontier', title: '🔬 前沿研究' },
              { key: 'satir', title: '💬 沟通姿态' },
              { key: 'positive', title: '🌟 积极心理' },
            ].map(cat => {
              const catArticles = articles.filter(a => a.category === cat.key);
              if (catArticles.length === 0) return null;
              return (
                <View key={cat.key} className="mb-5">
                  <Text className="text-foreground font-bold text-sm mb-3">{cat.title}</Text>
                  <View className="gap-2">
                    {catArticles.slice(0, 4).map(article => (
                      <Pressable key={article.id}
                        className="bg-card rounded-2xl p-4 flex-row items-center active:opacity-80"
                        style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.04)' }] }}
                        onPress={() => router.push(`/(app)/article/${article.id}`)}>
                        <View className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                          style={{ backgroundColor: ARTICLES_CATEGORY_COLORS[article.category] + '20' }}>
                          <Text className="text-lg">{CATEGORY_EMOJI[article.category]}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-foreground text-sm font-medium leading-5" numberOfLines={2}>{article.title}</Text>
                          {article.summary && (
                            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{article.summary}</Text>
                          )}
                        </View>
                        <Text className="text-muted-foreground text-base ml-2">›</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}

            {/* 萨提亚沟通姿态卡片 */}
            <View className="bg-card rounded-2xl p-4 mb-5"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
              <Text className="text-foreground font-bold text-base mb-3">💬 萨提亚四大沟通姿态</Text>
              {[
                { label: '讨好型', emoji: '🙇', desc: '为了让别人满意，忽视自己的感受', color: '#E8A365' },
                { label: '指责型', emoji: '👆', desc: '忽视他人感受，单向输出强势批判', color: '#E88A7D' },
                { label: '超理智型', emoji: '🤓', desc: '只讲规则，忽视自己与他人感受', color: '#9B8EC4' },
                { label: '打岔型', emoji: '🙃', desc: '回避主题，不断转移或玩笑化处理', color: '#5B9BD5' },
              ].map(item => (
                <View key={item.label} className="flex-row items-center gap-3 py-2.5 border-b border-border last:border-b-0">
                  <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: item.color + '20' }}>
                    <Text className="text-base">{item.emoji}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground text-sm font-semibold">{item.label}</Text>
                    <Text className="text-muted-foreground text-xs">{item.desc}</Text>
                  </View>
                </View>
              ))}
              <View className="bg-green-50 rounded-xl p-3 mt-3">
                <Text className="text-green-800 font-semibold text-sm mb-1">✅ 一致型沟通</Text>
                <Text className="text-green-700 text-xs leading-4">同时尊重自己、他人和情境，是健康沟通的目标模式</Text>
              </View>
            </View>

            {/* 可折叠心理科普知识卡片 */}
            <CollapsibleScienceCards />

          </View>
        </ScrollView>
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" nestedScrollEnabled>
          <View className="px-5 pb-24 gap-4">

            {/* 心绘小屋入口 — pro 级 */}
            <Pressable
              onPress={() => requirePro('心绘小屋', 'AI一键生成心理教学漫画、科普图与可视化内容', () => router.push('/(app)/painting-house' as any))}
              className="bg-card rounded-2xl p-5 flex-row items-center gap-4"
              style={{
                boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(155,142,196,0.18)' }],
                opacity: subLevel < 2 ? 0.72 : 1,
              }}
            >
              <View className="w-14 h-14 rounded-2xl items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(155,142,196,0.12)' }}>
                <Text style={{ fontSize: 28 }}>🎨</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-foreground font-bold text-base">🎨 心绘小屋</Text>
                  {subLevel < 2 && (
                    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(232,163,101,0.15)' }}>
                      <Text style={{ fontSize: 9, color: '#E8A365', fontWeight: '700' }}>🔒 AI工作台版</Text>
                    </View>
                  )}
                </View>
                <Text className="text-muted-foreground text-xs mt-0.5">AI 一键生成教学漫画与科普图</Text>
              </View>
              <Text className="text-2xl">›</Text>
            </Pressable>

            {/* 备课中心入口 — pro 级 */}
            <Pressable
              onPress={() => requirePro('个人备课中心', '管理课程资源、PPT素材、活动方案，构建个人教学知识库', () => router.push('/(app)/lesson-center' as any))}
              className="bg-card rounded-2xl p-5 flex-row items-center gap-4"
              style={{
                boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }],
                opacity: subLevel < 2 ? 0.72 : 1,
              }}
            >
              <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center flex-shrink-0">
                <BookOpen size={28} color="#9B8EC4" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-foreground font-bold text-base">📚 个人备课中心</Text>
                  {subLevel < 2 && (
                    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(232,163,101,0.15)' }}>
                      <Text style={{ fontSize: 9, color: '#E8A365', fontWeight: '700' }}>🔒 AI工作台版</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text className="text-2xl">›</Text>
            </Pressable>

            {/* 苍鹭医生 AI 助手入口卡片 — 调整为最高级会员（AI工作台版）权限 */}
            <Pressable
              onPress={() =>
                requirePro(
                  '🦢 苍鹭医生 AI 智能体',
                  '苍鹭医生是最高等级 AI 备课与心愈陪伴智能体，支持深度互动、手记生成、知识库检索与全能工具调度。需开通 AI工作台版权限或使用兑换码激活。',
                  openHeron
                )
              }
              className="bg-card rounded-2xl p-5 flex-row items-center gap-4"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(122,157,140,0.18)' }] }}
            >
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(122,157,140,0.12)' }}
              >
                <Text style={{ fontSize: 28 }}>🦢</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-foreground font-bold text-base">🦢 苍鹭医生</Text>
                  <View className="bg-amber-100 rounded-full px-2 py-0.5 flex-row items-center gap-0.5">
                    <Text style={{ fontSize: 10, color: '#D4845A', fontWeight: '800' }}>🔒 AI工作台版</Text>
                  </View>
                </View>
                <Text className="text-muted-foreground text-xs mt-0.5">全能备课智能体，随时答疑解惑 · 需工作台权限</Text>
              </View>
              <Text className="text-2xl">›</Text>
            </Pressable>

            {/* 备课资源共享平台入口 — 免费可用 */}
            <Pressable
              onPress={() => router.push('/(app)/browser' as any)}
              className="bg-card rounded-2xl p-5 flex-row items-center gap-4"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }] }}
            >
              <View className="w-14 h-14 rounded-2xl bg-amber-50 items-center justify-center flex-shrink-0">
                <Text style={{ fontSize: 28 }}>🌐</Text>
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-bold text-base">🌐 备课资源共享平台</Text>
              </View>
              <Text className="text-2xl">›</Text>
            </Pressable>

            {/* 愈心手记入口卡片 — 免费可用 */}
            <Pressable
              onPress={() => router.push('/(app)/notes' as RelativePathString)}
              className="bg-card rounded-2xl p-5 flex-row items-center gap-4"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }] }}
            >
              <View className="w-14 h-14 rounded-2xl items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#FFF4E0' }}>
                <BookHeart size={28} color="#E8A365" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-bold text-base">📝 愈心手记</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">记录心路历程，富文本随心书写</Text>
              </View>
              <Text className="text-2xl">›</Text>
            </Pressable>

            {/* AI工作台入口 — pro 级 */}
            <Pressable
              onPress={() => requirePro('AI开发工作台', '借助AI智能体快速构建心理健康应用，多模型驱动，一键运行预览', () => router.push('/(app)/ai-workbench' as any))}
              className="rounded-2xl p-5 flex-row items-center gap-4 overflow-hidden"
              style={{
                backgroundColor: '#1A1A2E',
                boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(155,142,196,0.25)' }],
                opacity: subLevel < 2 ? 0.72 : 1,
              }}
            >
              <View className="w-14 h-14 rounded-2xl items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(155,142,196,0.2)' }}>
                <Text style={{ fontSize: 28 }}>🤖</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text style={{ color: '#E0D9FF', fontWeight: '700', fontSize: 15 }}>AI开发工作台</Text>
                  {subLevel < 2 ? (
                    <View style={{ backgroundColor: 'rgba(232,163,101,0.25)', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#E8A365', fontSize: 9, fontWeight: '700' }}>🔒 AI工作台版</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: 'rgba(155,142,196,0.3)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#C4B5FD', fontSize: 10, fontWeight: '700' }}>NEW</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 17 }}>借助AI智能体，快速构建心理健康应用</Text>
                <View className="flex-row items-center gap-1 mt-1.5">
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#1DB954' }} />
                  <Text style={{ color: '#1DB954', fontSize: 11 }}>多模型驱动 · 一键运行预览</Text>
                </View>
              </View>
              <Text style={{ color: '#9B8EC4', fontSize: 24 }}>›</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SwipeTabView>

      {/* 升级引导弹窗 */}
      <UpgradeModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        requiredLevel={upgradeReq.level}
        featureName={upgradeReq.name}
        featureDesc={upgradeReq.desc}
      />
    </View>
  );
}

const CATEGORY_EMOJI: Record<string, string> = {
  emotion: '💭', stress: '🏔', self: '🪞', frontier: '🔬', satir: '💬', positive: '🌟',
};

// ── 心理科普知识数据 ────────────────────────────────────────────
const SCIENCE_CARDS = [
  {
    id: 'emotion_reg',
    title: '🧠 情绪调节的神经科学',
    color: '#E8A365',
    points: [
      { title: '杏仁核与情绪警报', body: '大脑的杏仁核是情绪的"报警中心"，当感知到威胁时会在0.1秒内触发恐惧反应，比理性思考快10倍。' },
      { title: '前额叶皮层的调节作用', body: '前额叶皮层负责理性思考和情绪调节，练习正念和深呼吸可以增强前额叶对杏仁核的控制能力。' },
      { title: '情绪粒度：命名即驯化', body: '研究发现，能精确区分和命名情绪（如"失望"vs"沮丧"）的人，情绪调节能力更强，负面情绪持续时间更短。' },
      { title: '情绪传染效应', body: '情绪会在人与人之间"传染"，这是因为镜像神经元的存在。积极情绪也同样具有感染力。' },
    ],
  },
  {
    id: 'cognitive_bias',
    title: '🔍 常见认知偏误',
    color: '#9B8EC4',
    points: [
      { title: '确认偏误', body: '我们倾向于只寻找支持自己既有观点的信息，忽略与之相反的证据，形成认知茧房。' },
      { title: '灾难化思维', body: '将小问题想象成最坏结果的倾向。CBT中常用"去灾难化技术"：问自己"最坏情况真的会发生吗？发生了又怎样？"' },
      { title: '全或无思维', body: '用"总是""从不""完全失败"等极端词语评价事物。这种非黑即白的思维方式是焦虑和抑郁的常见认知模式。' },
      { title: '思维反刍', body: '反复回忆负面事件或担忧未来。研究发现，设定专属的"担忧时间"（如每天15分钟）能有效减少全天的反刍思维。' },
      { title: '标签化偏误', body: '用单一标签定义自己或他人（"我是个失败者"），忽视行为的具体性和可改变性。' },
    ],
  },
  {
    id: 'attachment',
    title: '💑 依恋理论与亲密关系',
    color: '#E88A7D',
    points: [
      { title: '四种依恋风格', body: '安全型（约50%）：能舒适地亲密与独立；焦虑型：害怕被抛弃；回避型：不适应亲密；混乱型：同时渴望和恐惧亲密。' },
      { title: '依恋风格的可塑性', body: '依恋风格并非固定不变。良好的伴侣关系、心理咨询、以及对依恋模式的自我认知，都能促进向安全型转变。' },
      { title: '内部工作模型', body: '早年与照顾者的关系会形成对自我和他人的"内部工作模型"，影响成年后对关系的预期和行为模式。' },
      { title: '共依存与边界', body: '健康关系需要清晰的心理边界。共依存关系中，个人的情绪和自我价值感高度依赖于另一人的状态。' },
    ],
  },
  {
    id: 'stress_science',
    title: '🏔 压力的科学',
    color: '#7A9D8C',
    points: [
      { title: '良性压力 vs 恶性压力', body: '适度压力（良性压力）能提升专注度和表现，被称为"适度应激效应"。长期高压（恶性压力）则损害免疫系统和记忆功能。' },
      { title: '皮质醇的双面作用', body: '压力激素皮质醇短期内有保护和动员作用；但长期高皮质醇会损伤海马体，影响记忆和学习能力。' },
      { title: '社会支持的缓冲效应', body: '研究证明，强大的社会支持网络能显著降低压力对健康的负面影响，孤独感与高皮质醇水平正相关。' },
      { title: '压力的认知评估模型', body: '压力不是事件本身，而是"事件要求"与"个人资源"之间的差距评估。提升对自身资源的认知，是减压的关键路径。' },
    ],
  },
  {
    id: 'positive_psych',
    title: '🌟 积极心理学核心概念',
    color: '#E8C56A',
    points: [
      { title: 'PERMA幸福框架', body: '塞利格曼提出幸福的五大要素：积极情绪（Positive Emotion）、投入（Engagement）、关系（Relationships）、意义（Meaning）、成就（Achievement）。' },
      { title: '心流体验', body: '当挑战与能力完全匹配时产生的"心流"状态是幸福感的高峰体验，表现为时间感消失、全神贯注。主动寻找属于你的心流活动。' },
      { title: '感恩的神经机制', body: '每天写下3件感恩的事，持续3周，可显著提升幸福感并维持6个月以上。感恩激活大脑奖励回路，并增强社会联结。' },
      { title: '成长型思维 vs 固定型思维', body: '卡罗尔·德韦克的研究：相信能力可以通过努力发展的"成长型思维"，与更高的学业成就、更强的心理韧性密切相关。' },
      { title: '品格优势与最佳自我', body: '发现并每天以新方式运用自己的"签名优势"，是提升幸福感最有力的积极干预之一（VIA品格优势量表测评你的优势）。' },
    ],
  },
  {
    id: 'social_psych',
    title: '👥 社会心理学趣知',
    color: '#5B9BD5',
    points: [
      { title: '旁观者效应', body: '紧急情况下，在场人数越多，个人出手帮助的可能性反而越低（责任分散）。明确指向某人请求帮助可以打破这一效应。' },
      { title: '自我服务偏误', body: '成功时归因于自己的能力，失败时归因于外部因素——这是一种保护自尊的无意识倾向，在所有文化中普遍存在。' },
      { title: '晕轮效应', body: '对一个人某一特质（如外表吸引力）的正面评价会扩散到其他特质的评价上，影响面试、教学评价等现实决策。' },
      { title: '互惠原则', body: '人们倾向于回报他人给予的好意，这是深植于人类社会化的基本规范。小小的善意往往能引发更大的善意回应。' },
      { title: '社会比较理论', body: '我们通过与他人比较来评估自己，向上比较可激励成长但也可能降低自我价值感；向下比较提升满足感但可能减少动力。' },
    ],
  },
  {
    id: 'sleep_mind',
    title: '🌙 睡眠与心理健康',
    color: '#6366F1',
    points: [
      { title: '睡眠与情绪调节', body: '睡眠剥夺会导致杏仁核对负面刺激的反应增强60%，使人更易焦虑、易怒。7-9小时高质量睡眠是情绪健康的基石。' },
      { title: '梦的功能', body: 'REM睡眠中的梦境有助于处理情绪记忆，减少创伤性记忆的情绪强度——这也是EMDR疗法的神经基础之一。' },
      { title: '睡前仪式的力量', body: '固定的睡前放松仪式（阅读、冥想、温水浴）可以训练大脑将特定行为与睡眠关联，缩短入睡时间。' },
      { title: '手机蓝光与褪黑素', body: '屏幕蓝光会抑制褪黑素分泌，睡前1小时减少屏幕使用可使入睡速度提升31%，深睡眠时间增加。' },
    ],
  },
  {
    id: 'mindfulness',
    title: '🧘 正念与冥想科学',
    color: '#10B981',
    points: [
      { title: '正念的大脑改变', body: '8周正念减压训练（MBSR）可显著减小杏仁核体积、增厚前额叶皮层，这些变化在神经影像中清晰可见。' },
      { title: '观察者视角技术', body: '将自己的情绪和想法视为"可观察的对象"而非自身的一部分（"我注意到有一种焦虑的感觉"），能降低情绪的控制力。' },
      { title: '呼吸与迷走神经', body: '缓慢的腹式深呼吸（4-7-8法则）激活副交感神经系统，通过迷走神经降低心率和皮质醇水平，产生即时的平静效果。' },
      { title: 'RAIN技术', body: 'Recognize（认出）→ Allow（允许）→ Investigate（探索）→ Nurture（滋养）——处理困难情绪的正念四步法。' },
    ],
  },
];

// ── 可折叠心理科普知识卡片组件 ────────────────────────────────
function CollapsibleScienceCards() {
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <View className="mb-4">
      <Text className="text-foreground font-bold text-sm mb-3">📚 心理科普知识库</Text>
      <View className="gap-3">
        {SCIENCE_CARDS.map(card => {
          const isOpen = openCards.has(card.id);
          return (
            <View key={card.id} className="bg-card rounded-2xl overflow-hidden"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}>
              {/* 标题行（可点击收纳/展开） */}
              <Pressable
                className="flex-row items-center px-4 py-3.5"
                onPress={() => toggle(card.id)}
              >
                <View className="w-2 h-2 rounded-full mr-3 flex-shrink-0"
                  style={{ backgroundColor: card.color }} />
                <Text className="text-foreground font-semibold text-sm flex-1">{card.title}</Text>
                <View className="w-6 h-6 rounded-full items-center justify-center ml-2"
                  style={{ backgroundColor: card.color + '20' }}>
                  <Text style={{ color: card.color, fontSize: 14, fontWeight: '700', lineHeight: 18 }}>
                    {isOpen ? '−' : '+'}
                  </Text>
                </View>
              </Pressable>
              {/* 展开内容 */}
              {isOpen && (
                <View className="border-t border-border px-4 pb-4 pt-3 gap-3">
                  {card.points.map((pt, i) => (
                    <View key={i} className="flex-row items-start gap-2">
                      <View className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: card.color }} />
                      <View className="flex-1">
                        <Text className="text-foreground text-xs font-semibold mb-0.5">{pt.title}</Text>
                        <Text className="text-muted-foreground text-xs leading-5">{pt.body}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
