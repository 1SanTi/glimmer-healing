import { useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TEST_CONFIGS } from '@/lib/constants';
import { AnimatedTabBar } from '@/components/AnimatedTabBar';
import { SwipeTabView } from '@/components/SwipeTabView';
import { useSubscription } from '@/hooks/useSubscription';
import UpgradeModal from '@/components/UpgradeModal';

const GAMES = [
  { id: 'love_lab', title: '亲密关系研究室', desc: '关系网络图·理论科普·关系日历·定位地图', emoji: '💑', color: '#E06A8C', tag: '关系', isNew: true },
  { id: 'oh_card', title: 'O卡疗愈室', desc: '拖拽OH卡至桌面，投射内心图景，AI解读牌阵', emoji: '🃏', color: '#8B5CF6', tag: '单人' },
  { id: 'music_healing', title: '音乐粒子疗愈室', desc: '10万粒子随旋律律动，沉浸式音乐疗愈体验', emoji: '🎇', color: '#7C3AED', tag: '单人' },
  { id: 'sandbox', title: '沙盘游戏室', desc: '搭建你的3D心灵沙盘，探索内心世界', emoji: '🏖', color: '#C8A46A', tag: '单人' },
  { id: 'balloon', title: '压力气球', desc: '吹出你的压力，让它砰然消散', emoji: '🎈', color: '#E8A365', tag: '单人' },
  { id: 'sketch', title: '心灵速写', desc: '用色彩线条描绘此刻情绪，AI为你解读', emoji: '🎨', color: '#9B8EC4', tag: '单人' },
  { id: 'breath', title: '呼吸冥想', desc: '随音频节奏，让心平静下来', emoji: '🍃', color: '#7A9D8C', tag: '单人' },
  { id: 'bigwind', title: '大风吹', desc: '团体破冰游戏，发现共同点', emoji: '💨', color: '#5B9BD5', tag: '团体' },
  { id: 'gratitude', title: '感恩清单', desc: '写下今日三件好事，培养感恩心态', emoji: '✨', color: '#E8C56A', tag: '单人' },
  { id: 'hope_tree', title: '希望树共建', desc: '写下你对未来的美好期望', emoji: '🌱', color: '#7A9D8C', tag: '单人' },
  { id: 'dream_analysis', title: '梦境解析', desc: '用弗洛伊德精神分析理论，解读你的梦境密码', emoji: '🌙', color: '#6B7EC8', tag: '单人' },
  { id: 'immersive_sleep', title: '沉浸式睡眠', desc: '定制睡眠时间与背景音，进入深度休眠', emoji: '💤', color: '#7A9D8C', tag: '单人' },
];

const EXPERIMENTS = [
  { id: 'attachment',  title: '依恋预期任务',      desc: '像素风小游戏，探索你的依恋模式',              emoji: '🐰',  color: '#D4A5C4' },
  { id: 'memory',      title: '集体记忆实验',      desc: '参与讨论，观察记忆如何被重构',                emoji: '🧠',  color: '#5B9BD5' },
  { id: 'skinner',     title: '斯金纳箱实验',      desc: '操作性条件反射经典实验回顾',                  emoji: '🔬',  color: '#7A9D8C' },
  { id: 'milgram',     title: '米尔格拉姆服从',    desc: '权威与服从——经典社会心理实验',               emoji: '⚡',  color: '#9B8EC4' },
  { id: 'diy',         title: '生活实验DIY',        desc: '设计你自己的情绪与睡眠相关性实验',            emoji: '📓',  color: '#C4856A' },
  { id: 'iceberg',     title: '冰山隐喻解析器',    desc: '输入冲突描述，AI逐层拆解你的内在冰山',        emoji: '🧊',  color: '#E06A8C', isNew: true },
  { id: 'nvc',         title: '非暴力沟通翻译机',  desc: '把评判性语言翻译成观察·感受·需要·请求',       emoji: '🕊️', color: '#5B9BD5', isNew: true },
];

const CATEGORY_TABS = [
  { id: '测评舱', label: '🧪 测评舱' },
  { id: '游戏舱', label: '🎮 游戏舱' },
  { id: '实验舱', label: '🔬 实验舱' },
];

export default function PlayScreen() {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const [activeTab, setActiveTab] = useState('测评舱');

  // 订阅拦截
  const { level: subLevel } = useSubscription();
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState({ name: '', desc: '' });

  // basic 级功能集合（需要 level >= 1）
  const BASIC_GAMES = new Set(['love_lab', 'oh_card', 'music_healing', 'sandbox', 'dream_analysis', 'sketch']);
  // basic 级实验（iceberg、nvc 需要 AI，归入 basic）
  const BASIC_EXPERIMENTS = new Set(['iceberg', 'nvc']);

  function requireBasic(name: string, desc: string, go: () => void) {
    if (subLevel >= 1) { go(); return; }
    setUpgradeFeature({ name, desc });
    setUpgradeVisible(true);
  }

  const activeIndex = CATEGORY_TABS.findIndex(t => t.id === activeTab);

  const testsByCategory: Record<string, typeof TEST_CONFIGS> = {
    '专业筛查': TEST_CONFIGS.filter(t => t.category === '专业筛查'),
    '青少年专区': TEST_CONFIGS.filter(t => t.category === '青少年专区'),
    '性格测评': TEST_CONFIGS.filter(t => t.category === '性格测评'),
    '人格探索': TEST_CONFIGS.filter(t => t.category === '人格探索'),
    '人际关系': TEST_CONFIGS.filter(t => t.category === '人际关系'),
    '幸福感': TEST_CONFIGS.filter(t => t.category === '幸福感'),
    '趣味探索': TEST_CONFIGS.filter(t => t.category !== '专业筛查' && t.category !== '性格测评' && t.category !== '青少年专区' && t.category !== '人格探索' && t.category !== '人际关系' && t.category !== '幸福感'),
  };

  const CATEGORY_COLORS: Record<string, string> = {
    '专业筛查': '#E8A365',
    '青少年专区': '#9B8EC4',
    '性格测评': '#7A9D8C',
    '人格探索': '#C4856A',
    '人际关系': '#D4A5C4',
    '幸福感': '#E8C56A',
    '趣味探索': '#5B9BD5',
  };

  const getTestEmoji = (id: string) => {
    const map: Record<string, string> = {
      scl90: '📊', mht: '💚', stress: '⚡', mbti: '🎭',
      via: '⭐', confidence: '🏆', htp: '🖼', mental_age: '⏰',
      phq9: '💊', gad7: '😰', burnout: '🔋', social_anxiety: '🫣', loneliness: '🫂',
      aas: '💑', enneagram: '🔮', big5: '🧬', ses: '🌟', sleep: '🌙', maas: '🧘',
    };
    return map[id] ?? '🧠';
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      {/* 顶部 */}
      <View className="px-5 pt-14 pb-4">
        <Text className="text-2xl font-bold text-foreground">测玩中心 🧪</Text>
        <Text className="text-muted-foreground text-sm mt-1">测试·游戏·实验，有趣地了解自己</Text>
        {/* AnimatedTabBar — 滑动指示器 */}
        <View className="mt-4">
          <AnimatedTabBar
            tabs={CATEGORY_TABS}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id)}
            scrollX={scrollX}
            screenW={screenW}
          />
        </View>
      </View>

      {/* SwipeTabView — 手势滑动切换内容 */}
      <SwipeTabView
        activeIndex={activeIndex}
        onIndexChange={(i) => setActiveTab(CATEGORY_TABS[i].id)}
        scrollX={scrollX}
      >
        {/* 测评舱 */}
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" nestedScrollEnabled>
          <View className="px-5 pb-24">
            {Object.entries(testsByCategory).map(([catName, tests]) => (
              <View key={catName} className="mb-5">
                <View className="flex-row items-center gap-2 mb-3 ml-1">
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[catName] ?? '#94A3B8' }} />
                  <Text className="text-foreground font-bold text-sm">{catName}</Text>
                  {catName === '青少年专区' && (
                    <View className="bg-purple-100 rounded-full px-2 py-0.5">
                      <Text style={{ fontSize: 10, color: '#9B8EC4', fontWeight: '600' }}>新增</Text>
                    </View>
                  )}
                </View>
                <View className="gap-3">
                  {tests.map(test => {
                    const isFreeTest = ['scl90', 'sds', 'mht'].includes(test.id);
                    const isUnlocked = isFreeTest || subLevel >= 1;

                    return (
                      <Pressable
                        key={test.id}
                        className="bg-card rounded-2xl p-4 flex-row items-center"
                        style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                        onPress={() => {
                          if (!isUnlocked) {
                            requireBasic(
                              test.title,
                              '开通心愈版会员，解锁全套专业心理测评与深度分析报告，支持无限次测试与档案留存。',
                              () => {
                                if (test.id === 'htp') router.push('/(app)/htp');
                                else router.push(`/(app)/test/${test.id}`);
                              }
                            );
                            return;
                          }
                          if (test.id === 'htp') {
                            router.push('/(app)/htp');
                          } else {
                            router.push(`/(app)/test/${test.id}`);
                          }
                        }}
                      >
                        <View className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                          style={{ backgroundColor: test.color + '25' }}>
                          <Text className="text-xl">{getTestEmoji(test.id)}</Text>
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-foreground font-semibold text-sm">{test.title}</Text>
                            {isFreeTest ? (
                              <View className="bg-emerald-100 rounded-full px-2 py-0.5">
                                <Text style={{ fontSize: 10, color: '#059669', fontWeight: '800' }}>免费体验</Text>
                              </View>
                            ) : (
                              <View className="bg-purple-100 rounded-full px-2 py-0.5">
                                <Text style={{ fontSize: 10, color: '#7C6FCD', fontWeight: '800' }}>🔒 心愈版</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-muted-foreground text-xs mt-0.5 leading-4">{test.description}</Text>
                          <View className="flex-row items-center gap-2 mt-1.5">
                            <Text className="text-muted-foreground text-xs">🕐 {test.duration}</Text>
                            <Text className="text-muted-foreground text-xs">·</Text>
                            <Text className="text-muted-foreground text-xs">{test.questionCount}题</Text>
                          </View>
                        </View>
                        <View className={`rounded-xl px-2.5 py-1 ml-2 ${isUnlocked ? 'bg-primary' : 'bg-muted'}`}>
                          <Text className={`text-xs font-semibold ${isUnlocked ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                            {isUnlocked ? '开始' : '解锁'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* 游戏舱 */}
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" nestedScrollEnabled>
          <View className="px-5 pb-24">
            <View className="flex-row flex-wrap gap-3">
              {GAMES.map(game => {
                const needBasic = BASIC_GAMES.has(game.id);
                const locked = needBasic && subLevel < 1;
                return (
                  <Pressable
                    key={game.id}
                    className="bg-card rounded-2xl p-4"
                    style={{
                      width: '47%',
                      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }],
                      opacity: locked ? 0.72 : 1,
                    }}
                    onPress={() => {
                      const GAME_DESC: Record<string, string> = {
                        love_lab: '关系网络图·理论科普·关系日历·定位地图',
                        oh_card: '拖拽OH卡至桌面，投射内心图景，AI解读牌阵',
                        music_healing: '10万粒子随旋律律动，沉浸式音乐疗愈体验',
                        sandbox: '搭建你的3D心灵沙盘，探索内心世界',
                        dream_analysis: '用弗洛伊德精神分析理论，解读你的梦境密码',
                        sketch: '用色彩线条描绘此刻情绪，AI为你解读',
                      };
                      if (locked) {
                        requireBasic(game.title, GAME_DESC[game.id] ?? game.desc, () => {});
                        return;
                      }
                      if (game.id === 'love_lab') return router.push('/(app)/love-lab' as RelativePathString);
                      if (game.id === 'oh_card') return router.push('/(app)/oh-card-room' as RelativePathString);
                      if (game.id === 'music_healing') return router.push('/(app)/music-healing' as RelativePathString);
                      if (game.id === 'sandbox') return router.push('/(app)/sandbox-intro' as RelativePathString);
                      if (game.id === 'hope_tree') return router.push('/(app)/hope-tree' as RelativePathString);
                      if (game.id === 'breath') return router.push('/(app)/breath' as RelativePathString);
                      if (game.id === 'sketch') return router.push('/(app)/sketch' as RelativePathString);
                      if (game.id === 'attachment') return router.push('/(app)/attachment' as RelativePathString);
                      if (game.id === 'dream_analysis') return router.push('/(app)/dream-analysis' as RelativePathString);
                      if (game.id === 'immersive_sleep') return router.push('/(app)/immersive-sleep' as RelativePathString);
                      router.push(`/(app)/test/${game.id}` as RelativePathString);
                    }}
                  >
                    <View className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
                      style={{ backgroundColor: game.color + '20' }}>
                      <Text className="text-2xl">{game.emoji}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text className="text-foreground font-semibold text-sm">{game.title}</Text>
                      {'isNew' in game && game.isNew && (
                        <View style={{ backgroundColor: game.color + '25', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 9, color: game.color, fontWeight: '700' }}>NEW</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-muted-foreground text-xs leading-4">{game.desc}</Text>
                    <View className="mt-2 self-start flex-row items-center gap-1">
                      <View className="bg-muted rounded-full px-2 py-0.5">
                        <Text className="text-muted-foreground text-xs">{game.tag}</Text>
                      </View>
                      {locked && (
                        <View className="rounded-full px-2 py-0.5"
                          style={{ backgroundColor: 'rgba(124,111,205,0.12)' }}>
                          <Text style={{ fontSize: 9, color: '#7C6FCD', fontWeight: '700' }}>🔒 心愈版</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* 实验舱 */}
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" nestedScrollEnabled>
          <View className="px-5 pb-24 gap-3">
            <View className="bg-accent/10 rounded-2xl p-4 mb-1">
              <Text className="text-foreground font-semibold text-sm mb-1">🔬 心理实验室</Text>
              <Text className="text-muted-foreground text-xs leading-5">
                亲身体验心理学研究，或了解那些改变我们对人性认知的经典实验。
              </Text>
            </View>
            {EXPERIMENTS.map(exp => {
              const needBasic = BASIC_EXPERIMENTS.has(exp.id);
              const locked = needBasic && subLevel < 1;
              return (
              <Pressable
                key={exp.id}
                className="bg-card rounded-2xl p-4 flex-row items-center"
                style={{
                  boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }],
                  opacity: locked ? 0.72 : 1,
                }}
                onPress={() => {
                  if (locked) {
                    requireBasic(exp.title, exp.desc, () => {});
                    return;
                  }
                  if (exp.id === 'iceberg') return router.push('/(app)/iceberg-analyzer' as RelativePathString);
                  if (exp.id === 'nvc')     return router.push('/(app)/nvc-translator' as RelativePathString);
                  router.push(`/(app)/test/${exp.id}` as RelativePathString);
                }}
              >
                <View className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                  style={{ backgroundColor: exp.color + '20' }}>
                  <Text className="text-2xl">{exp.emoji}</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-foreground font-semibold text-sm">{exp.title}</Text>
                    {'isNew' in exp && exp.isNew && (
                      <View style={{ backgroundColor: exp.color + '25', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: exp.color, fontWeight: '700' }}>NEW</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-muted-foreground text-xs mt-0.5 leading-4">{exp.desc}</Text>
                </View>
                <Text className="text-muted-foreground text-lg ml-2">›</Text>
                {locked && (
                  <View className="ml-1 rounded-full px-2 py-0.5"
                    style={{ backgroundColor: 'rgba(124,111,205,0.12)' }}>
                    <Text style={{ fontSize: 9, color: '#7C6FCD', fontWeight: '700' }}>🔒</Text>
                  </View>
                )}
              </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SwipeTabView>

      {/* 升级引导弹窗 */}
      <UpgradeModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        requiredLevel={1}
        featureName={upgradeFeature.name}
        featureDesc={upgradeFeature.desc}
      />
    </View>
  );
}


