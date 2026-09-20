import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, FlatList, ActivityIndicator, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/ctx';
import { getTodayMood, checkInMood, getFeaturedArticles } from '@/db/api';
import { getMoodRecommendations } from '@/lib/utils';
import { useCrisis } from '@/components/CrisisProvider';
import type { MoodType, Article } from '@/types/types';

// ── 快速打卡心情（16种，4行×4列）────────────────────────────────
// 新增：失望/希望/害羞/幽默/勇敢/敬畏（来自《生活中的情绪心理学》）
const MOODS: { type: MoodType; emoji: string; label: string; gradient: [string, string] }[] = [
  { type: 'happy',        emoji: '😊', label: '开心',   gradient: ['#FFD97D', '#FFAA5B'] },
  { type: 'calm',         emoji: '😌', label: '平静',   gradient: ['#A8D8C0', '#6DB89B'] },
  { type: 'grateful',     emoji: '🙏', label: '感恩',   gradient: ['#B5E8A0', '#7EC96A'] },
  { type: 'hopeful',      emoji: '🌟', label: '充满希望', gradient: ['#FFE59D', '#F4C842'] },
  { type: 'excited',      emoji: '🤩', label: '激动',   gradient: ['#FFB3A0', '#F4845F'] },
  { type: 'brave',        emoji: '💪', label: '勇敢',   gradient: ['#FFA07A', '#E8855A'] },
  { type: 'humorous',     emoji: '😄', label: '幽默',   gradient: ['#A8E6CF', '#6DC8A0'] },
  { type: 'awe',          emoji: '✨', label: '敬畏',   gradient: ['#C5B8E8', '#A08ECC'] },
  { type: 'sad',          emoji: '😔', label: '低落',   gradient: ['#C5B8E8', '#9B8EC4'] },
  { type: 'anxious',      emoji: '😰', label: '焦虑',   gradient: ['#FFE08A', '#F4C35A'] },
  { type: 'angry',        emoji: '😠', label: '愤怒',   gradient: ['#FFAA99', '#E88A7D'] },
  { type: 'tired',        emoji: '😴', label: '疲惫',   gradient: ['#9EC8F0', '#5B9BD5'] },
  { type: 'disappointed', emoji: '😟', label: '失望',   gradient: ['#C8C8C0', '#A0A09A'] },
  { type: 'shy',          emoji: '😳', label: '害羞',   gradient: ['#FFD0C0', '#F0A898'] },
  { type: 'confused',     emoji: '😕', label: '困惑',   gradient: ['#C8C0E0', '#A89ED0'] },
  { type: 'depressed',    emoji: '😞', label: '压抑',   gradient: ['#B0BCC8', '#8896A8'] },
];

// ── 全量情绪库（约40种），按分类组织 ──────────────────────────────
const MOOD_LIBRARY: {
  category: string;
  color: string;
  items: { type: string; emoji: string; label: string }[];
}[] = [
  {
    category: '积极',
    color: '#7EC96A',
    items: [
      { type: 'happy',      emoji: '😊', label: '开心' },
      { type: 'excited',    emoji: '🤩', label: '激动' },
      { type: 'grateful',   emoji: '🙏', label: '感恩' },
      { type: 'joyful',     emoji: '😄', label: '喜悦' },
      { type: 'proud',      emoji: '😤', label: '自豪' },
      { type: 'hopeful',    emoji: '🌟', label: '充满希望' },
      { type: 'fulfilled',  emoji: '🌈', label: '充实' },
      { type: 'warm',       emoji: '🤗', label: '温暖' },
      { type: 'moved',      emoji: '🥺', label: '感动' },
      { type: 'blessed',    emoji: '✨', label: '幸福' },
    ],
  },
  {
    category: '平静',
    color: '#6DB89B',
    items: [
      { type: 'calm',       emoji: '😌', label: '平静' },
      { type: 'relaxed',    emoji: '🧘', label: '放松' },
      { type: 'peaceful',   emoji: '🕊', label: '安宁' },
      { type: 'cozy',       emoji: '🛋', label: '舒适' },
      { type: 'detached',   emoji: '🌊', label: '淡然' },
      { type: 'serene',     emoji: '🌅', label: '宁静' },
      { type: 'leisurely',  emoji: '🌿', label: '悠闲' },
      { type: 'free',       emoji: '🦋', label: '自在' },
    ],
  },
  {
    category: '负面',
    color: '#E88A7D',
    items: [
      { type: 'sad',        emoji: '😔', label: '悲伤' },
      { type: 'anxious',    emoji: '😰', label: '焦虑' },
      { type: 'angry',      emoji: '😤', label: '愤怒' },
      { type: 'tired',      emoji: '😴', label: '疲惫' },
      { type: 'depressed',  emoji: '😞', label: '压抑' },
      { type: 'lonely',     emoji: '🥺', label: '孤独' },
      { type: 'helpless',   emoji: '😿', label: '无助' },
      { type: 'fearful',    emoji: '😨', label: '恐惧' },
      { type: 'irritated',  emoji: '😣', label: '烦躁' },
      { type: 'empty',      emoji: '🌑', label: '空虚' },
      { type: 'numb',       emoji: '😶', label: '麻木' },
    ],
  },
  {
    category: '复杂',
    color: '#9B8EC4',
    items: [
      { type: 'confused',    emoji: '😕', label: '困惑' },
      { type: 'conflicted',  emoji: '🤔', label: '矛盾' },
      { type: 'tangled',     emoji: '🌀', label: '纠结' },
      { type: 'lost',        emoji: '🧭', label: '迷茫' },
      { type: 'uneasy',      emoji: '😟', label: '不安' },
      { type: 'guilty',      emoji: '😢', label: '愧疚' },
      { type: 'jealous',     emoji: '😒', label: '嫉妒' },
      { type: 'ashamed',     emoji: '😳', label: '羞愧' },
      { type: 'regretful',   emoji: '😮‍💨', label: '后悔' },
      { type: 'bored',       emoji: '😑', label: '无聊' },
      { type: 'disgusted',   emoji: '🙄', label: '厌倦' },
    ],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  emotion: '#E8A365', stress: '#9B8EC4', self: '#7A9D8C',
  frontier: '#5B9BD5', satir: '#C4856A', positive: '#E8C56A',
};
const CATEGORY_LABELS: Record<string, string> = {
  emotion: '情绪管理', stress: '压力适应', self: '自我探索',
  frontier: '前沿研究', satir: '沟通姿态', positive: '积极心理',
};

function getDateStr() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function getDayStr() {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date().getDay()];
}

// 本地日期字符串（非 UTC），保证跨时区用户每天 0 点正确重置
function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 今日心情本地缓存 key（用本地日期，避免 UTC 偏差）
const moodCacheKey = () => `mood_checkin_${localDateStr()}`;

export default function HomeScreen() {
  const { session } = useSession();
  const router = useRouter();
  const { showCrisisPanel } = useCrisis();

  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [checkedIn, setCheckedIn] = useState(false);
  const [editing, setEditing] = useState(false); // 修改模式
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  // 全屏心情选择器
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [modalSelected, setModalSelected] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const uid = session?.user.id;

        // 先从本地缓存恢复今日心情（避免退出重置）
        try {
          const cached = await AsyncStorage.getItem(moodCacheKey());
          if (cached) {
            const moods = cached.split(',').filter(Boolean);
            setSelectedMoods(moods);
            setCheckedIn(true);
          }
        } catch { /* ignore */ }

        const [moodData, articleData] = await Promise.all([
          uid ? getTodayMood(uid) : null,
          getFeaturedArticles(6),
        ]);
        // Supabase 数据优先（覆盖本地缓存）
        if (moodData?.mood) {
          const moods = moodData.mood.split(',').filter(Boolean);
          setSelectedMoods(moods);
          setCheckedIn(true);
          // 同步写入本地缓存
          try { await AsyncStorage.setItem(moodCacheKey(), moodData.mood); } catch { /* ignore */ }
        }
        setArticles(articleData);
        setLoading(false);
      })();
    }, [session])
  );

  const toggleMood = (mood: string) => {
    if (checkedIn && !editing) return;
    setSelectedMoods(prev =>
      prev.includes(mood) ? prev.filter(m => m !== mood) : [...prev, mood]
    );
  };

  const toggleModalMood = (mood: string) => {
    setModalSelected(prev =>
      prev.includes(mood) ? prev.filter(m => m !== mood) : [...prev, mood]
    );
  };

  const openModal = () => {
    setModalSelected([...selectedMoods]);
    setShowMoodModal(true);
  };

  const confirmModalSelection = () => {
    setSelectedMoods(modalSelected);
    setShowMoodModal(false);
  };

  const handleSubmitMood = async () => {
    if (!session || checking || selectedMoods.length === 0) return;
    if (checkedIn && !editing) return;
    setChecking(true);
    const moodStr = selectedMoods.join(',');
    await checkInMood(session.user.id, moodStr);
    // 同步本地缓存
    try { await AsyncStorage.setItem(moodCacheKey(), moodStr); } catch { /* ignore */ }
    setCheckedIn(true);
    setEditing(false);
    setChecking(false);
  };

  // 查找情绪的 emoji 和 label（兼容默认和扩展）
  const findMoodInfo = (type: string) => {
    const defaultMood = MOODS.find(m => m.type === type);
    if (defaultMood) return { emoji: defaultMood.emoji, label: defaultMood.label };
    for (const cat of MOOD_LIBRARY) {
      const item = cat.items.find(i => i.type === type);
      if (item) return { emoji: item.emoji, label: item.label };
    }
    return { emoji: '💭', label: type };
  };

  const recommendations = checkedIn && selectedMoods.length > 0
    ? getMoodRecommendations(selectedMoods as MoodType[])
    : [];

  const renderArticle = ({ item }: { item: Article }) => (
    <Pressable
      className="bg-card rounded-2xl overflow-hidden mr-4"
      style={{ width: 200, boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}
      onPress={() => router.push(`/(app)/article/${item.id}`)}
    >
      <View className="h-24 items-center justify-center"
        style={{ backgroundColor: CATEGORY_COLORS[item.category] + '25' }}>
        <Text className="text-3xl">
          {item.category === 'emotion' ? '💭' : item.category === 'stress' ? '🏔' :
           item.category === 'frontier' ? '🔬' : item.category === 'satir' ? '💬' :
           item.category === 'positive' ? '🌟' : '🪞'}
        </Text>
      </View>
      <View className="p-3">
        <View className="flex-row items-center gap-1 mb-1">
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: CATEGORY_COLORS[item.category] + '30' }}>
            <Text className="text-xs font-medium" style={{ color: CATEGORY_COLORS[item.category] }}>
              {CATEGORY_LABELS[item.category]}
            </Text>
          </View>
        </View>
        <Text className="text-foreground text-sm font-semibold leading-5" numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );

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
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        {/* 顶部问候 */}
        <View className="px-5 pt-14 pb-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-muted-foreground text-sm">{getDateStr()} {getDayStr()}</Text>
              <Text className="text-foreground text-2xl font-bold mt-0.5">微光心愈 🔆</Text>
            </View>
            <Pressable
              className="bg-destructive/10 rounded-2xl px-3 py-2"
              onPress={showCrisisPanel}
            >
              <Text className="text-destructive text-xs font-medium">🆘 求助</Text>
            </Pressable>
          </View>
        </View>

        {/* 心情打卡卡片 */}
        <View className="mx-5 bg-card rounded-3xl p-5 mb-4"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.06)' }] }}>
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-foreground font-bold text-base">今日心情打卡</Text>
            {checkedIn && !editing && (
              <Pressable
                className="flex-row items-center gap-1 rounded-xl px-2.5 py-1"
                style={{ backgroundColor: '#7A9D8C18', borderWidth: 1, borderColor: '#7A9D8C50' }}
                onPress={() => setEditing(true)}
              >
                <Text style={{ fontSize: 11 }}>✏️</Text>
                <Text style={{ fontSize: 11, color: '#7A9D8C', fontWeight: '600' }}>修改心情</Text>
              </Pressable>
            )}
            {editing && (
              <Pressable
                className="flex-row items-center gap-1 rounded-xl px-2.5 py-1"
                style={{ backgroundColor: '#F5F3EF', borderWidth: 1, borderColor: '#E5E0D8' }}
                onPress={() => setEditing(false)}
              >
                <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '600' }}>取消</Text>
              </Pressable>
            )}
          </View>
          <Text className="text-muted-foreground text-sm mb-4">
            {checkedIn && !editing
              ? `今天感觉：${selectedMoods.map(m => { const i = findMoodInfo(m); return i.emoji + i.label; }).join(' ')}，已打卡 ✓`
              : editing
                ? '重新选择你现在的心情，可多选'
                : '你今天感觉怎么样？可多选'}
          </Text>
          {/* 心情格子：4列×4行（16种） */}
          {[0, 1, 2, 3].map(row => (
            <View key={row} className="flex-row gap-2 mb-2">
              {MOODS.slice(row * 4, row * 4 + 4).map(({ type, emoji, label, gradient }) => {
                const isSelected = selectedMoods.includes(type);
                const locked = checkedIn && !editing;
                return (
                  <Pressable
                    key={type}
                    className="flex-1 items-center py-2.5 rounded-2xl"
                    style={{
                      backgroundColor: isSelected ? gradient[0] + 'EE' : '#F5F3EF',
                      borderWidth: 2,
                      borderColor: isSelected ? gradient[1] : 'transparent',
                      opacity: locked && !isSelected ? 0.3 : 1,
                    }}
                    onPress={() => toggleMood(type)}
                    disabled={locked}
                  >
                    <Text style={{ fontSize: 20, marginBottom: 1 }}>{emoji}</Text>
                    <Text style={{ fontSize: 10, fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? gradient[1] : '#64748B' }} numberOfLines={1}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* 扩展已选（超过默认10种的） */}
          {selectedMoods.filter(m => !MOODS.find(d => d.type === m)).length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mb-3">
              {selectedMoods.filter(m => !MOODS.find(d => d.type === m)).map(m => {
                const info = findMoodInfo(m);
                const locked = checkedIn && !editing;
                return (
                  <Pressable key={m} onPress={() => !locked && toggleMood(m)}
                    className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
                    style={{ backgroundColor: '#7A9D8C20', borderWidth: 1.5, borderColor: '#7A9D8C60' }}>
                    <Text style={{ fontSize: 14 }}>{info.emoji}</Text>
                    <Text style={{ fontSize: 11, color: '#7A9D8C', fontWeight: '600' }}>{info.label}</Text>
                    {!locked && <Text style={{ fontSize: 10, color: '#9CA3AF' }}>✕</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* 更多心情入口（未打卡或编辑模式下显示） */}
          {(!checkedIn || editing) && (
            <Pressable
              className="flex-row items-center justify-center gap-1.5 rounded-2xl py-2.5 mb-3"
              style={{ backgroundColor: '#F5F3EF', borderWidth: 1.5, borderColor: '#E5E0D8' }}
              onPress={openModal}
            >
              <Text style={{ fontSize: 16 }}>🌈</Text>
              <Text style={{ color: '#6B7280', fontSize: 13, fontWeight: '600' }}>更多心情（共{MOOD_LIBRARY.reduce((s, c) => s + c.items.length, 0)}种）</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>›</Text>
            </Pressable>
          )}

          {/* 提交 / 修改提交按钮（未打卡或编辑模式下显示） */}
          {(!checkedIn || editing) && (
            <Pressable
              className="bg-primary rounded-2xl py-3 items-center"
              onPress={handleSubmitMood}
              disabled={checking || selectedMoods.length === 0}
              style={{ opacity: selectedMoods.length === 0 ? 0.4 : 1 }}
            >
              {checking
                ? <ActivityIndicator color="white" size="small" />
                : <Text className="text-primary-foreground font-bold text-sm">
                    {selectedMoods.length === 0
                      ? '请选择心情'
                      : editing
                        ? `更新心情 (${selectedMoods.length}种)`
                        : `打卡 (${selectedMoods.length}种心情)`}
                  </Text>
              }
            </Pressable>
          )}
        </View>

        {/* Glimmer灯塔联动卡片 */}
        {checkedIn && recommendations.length > 0 && (
          <View className="mx-5 mb-4">
            <View className="flex-row items-center gap-2 mb-3">
              <Text className="text-xl">🗼</Text>
              <Text className="text-foreground font-bold text-base">Glimmer灯塔为你推荐</Text>
            </View>
            <View className="gap-2">
              {recommendations.map((rec, idx) => (
                <Pressable
                  key={idx}
                  className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                  onPress={() => router.push(rec.route as any)}
                >
                  <Text className="text-2xl mr-3">{rec.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-foreground font-semibold text-sm">{rec.title}</Text>
                  </View>
                  <View className="bg-primary rounded-xl px-3 py-1.5">
                    <Text className="text-primary-foreground text-xs font-medium">{rec.action}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* 精选文章 */}
        {articles.length > 0 && (
          <View className="mb-6">
            <View className="flex-row items-center justify-between px-5 mb-3">
              <Text className="text-foreground font-bold text-base">📚 精选科普</Text>
              <Pressable onPress={() => router.push('/(app)/(tabs)/academy')}>
                <Text className="text-primary text-sm">查看全部</Text>
              </Pressable>
            </View>
            <FlatList
              data={articles}
              renderItem={renderArticle}
              keyExtractor={i => i.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 20, paddingRight: 8 }}
            />
          </View>
        )}

        {/* 快速入口 */}
        <View className="mx-5 mb-8">
          <Text className="text-foreground font-bold text-base mb-3">🌿 快速入口</Text>
          <View className="flex-row flex-wrap gap-3">
            {[
              { label: '树洞倾诉', emoji: '🌳', route: '/(app)/(tabs)/heal' },
              { label: '心理测试', emoji: '🧪', route: '/(app)/(tabs)/play' },
              { label: '呼吸冥想', emoji: '🍃', route: '/(app)/breath' },
              { label: '幸福日志', emoji: '📖', route: '/(app)/(tabs)/academy' },
            ].map(item => (
              <Pressable
                key={item.label}
                className="bg-card rounded-2xl items-center py-3 px-2"
                style={{
                  width: '22%',
                  boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.05)' }],
                }}
                onPress={() => router.push(item.route as any)}
              >
                <Text className="text-2xl mb-1">{item.emoji}</Text>
                <Text className="text-xs text-muted-foreground font-medium">{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── 全屏心情选择模态 ── */}
      <Modal
        visible={showMoodModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMoodModal(false)}
      >
        <View className="flex-1 bg-background">
          {/* 模态顶栏 */}
          <View className="flex-row items-center justify-between px-5 pt-6 pb-4 border-b border-border">
            <Pressable onPress={() => setShowMoodModal(false)}>
              <Text className="text-muted-foreground text-sm">取消</Text>
            </Pressable>
            <Text className="text-foreground font-bold text-base">选择你的心情</Text>
            <Pressable onPress={confirmModalSelection}>
              <Text className="text-primary font-bold text-sm">确认 ({modalSelected.length})</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text className="text-muted-foreground text-xs text-center mb-4 leading-5">
              共 {MOOD_LIBRARY.reduce((s, c) => s + c.items.length, 0)} 种情绪 · 可多选 · 描述你此刻真实的感受
            </Text>

            {MOOD_LIBRARY.map(category => (
              <View key={category.category} className="mb-5">
                {/* 分类标题 */}
                <View className="flex-row items-center gap-2 mb-3">
                  <View className="h-4 w-1 rounded-full" style={{ backgroundColor: category.color }} />
                  <Text className="text-foreground font-bold text-sm">{category.category}</Text>
                  <Text className="text-muted-foreground text-xs">({category.items.length}种)</Text>
                </View>
                {/* 情绪网格 */}
                <View className="flex-row flex-wrap gap-2">
                  {category.items.map(item => {
                    const isSelected = modalSelected.includes(item.type);
                    return (
                      <Pressable
                        key={item.type}
                        onPress={() => toggleModalMood(item.type)}
                        className="flex-row items-center gap-1.5 rounded-full px-3 py-2"
                        style={{
                          backgroundColor: isSelected ? category.color + '25' : '#F5F3EF',
                          borderWidth: 1.5,
                          borderColor: isSelected ? category.color : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                        <Text style={{
                          fontSize: 13, fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? category.color : '#64748B',
                        }}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* 底部确认按钮 */}
          <View className="px-5 pb-8 pt-3 border-t border-border">
            <Pressable
              className="bg-primary rounded-2xl py-4 items-center"
              onPress={confirmModalSelection}
              style={{ opacity: modalSelected.length === 0 ? 0.4 : 1 }}
            >
              <Text className="text-primary-foreground font-bold text-base">
                {modalSelected.length === 0 ? '请至少选择一种心情' : `确认选择 ${modalSelected.length} 种心情`}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
