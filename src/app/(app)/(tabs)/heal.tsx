import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Modal, useWindowDimensions, Platform,
} from 'react-native';
import { supabase } from '@/client/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Send, X, Trash2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useSession } from '@/ctx';
import { getPublicPosts, createPost, addReaction, deletePost, getPostComments, addComment, deleteComment, getBatchReactionCounts, getUserReactionsForPosts } from '@/db/api';
import { useCrisis } from '@/components/CrisisProvider';
import { detectCrisis, formatDate } from '@/lib/utils';
import { TREE_HOLE_CATEGORIES, REACTIONS, EXPERTS } from '@/lib/constants';
import type { TreeHolePost, TreeHoleCategory, TreeHoleComment } from '@/types/types';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, interpolate,
} from 'react-native-reanimated';
import { AnimatedTabBar } from '@/components/AnimatedTabBar';
import { SwipeTabView } from '@/components/SwipeTabView';
import { useSubscription } from '@/hooks/useSubscription';
import UpgradeModal from '@/components/UpgradeModal';

// 树洞内容最大长度限制（安全防护，避免超长内容入库）
const POST_MAX_LEN = 500;


function ToggleChip({ emoji, label, isActive, activeColor = '#E8A365', onPress }: {
  emoji?: string; label: string; isActive: boolean;
  activeColor?: string; onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 14, paddingVertical: 8,
        minHeight: 36,
        borderRadius: 999,
        borderWidth: 1.5,
        backgroundColor: isActive ? activeColor : '#FFFFFF',
        borderColor:     isActive ? activeColor : '#E5E0D8',
        opacity: pressed ? 0.72 : 1,
      }}
    >
      {emoji ? <Text style={{ fontSize: 13, lineHeight: 18 }}>{emoji}</Text> : null}
      <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#FFFFFF' : '#374151', lineHeight: 18 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── CollapsePanel：辅助筛选区弹性展开/收起 ──────────────────
// 点击时 maxHeight + opacity + translateY 三轴联动，形成自然的展开感
const FILTER_MAX_H = 98; // 两排内容的估算高度（px）

function CollapsePanel({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(visible ? 1 : 0, {
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    });
  }, [visible]);

  const wrapStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(progress.value, [0, 1], [0, FILTER_MAX_H]),
    opacity:   interpolate(progress.value, [0, 1], [0, 1]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [-10, 0]) }],
    overflow: 'hidden',
  }));

  return <Reanimated.View style={wrapStyle}>{children}</Reanimated.View>;
}

// ── FilterChevron：展开/收起旋转箭头（独立组件，避免在 JSX 中调用 hook） ──
function FilterChevron({ open }: { open: boolean }) {
  const rot = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    rot.value = withSpring(open ? 1 : 0, { damping: 16, stiffness: 260 });
  }, [open]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rot.value, [0, 1], [0, 180])}deg` }],
  }));

  return (
    <Reanimated.View style={style}>
      <ChevronDown size={16} color="#94A3B8" />
    </Reanimated.View>
  );
}

export default function HealScreen() {
  const { session } = useSession();
  const router = useRouter();
  const { showCrisisPanel } = useCrisis();

  // 订阅拦截
  const { level: subLevel } = useSubscription();
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const [tab, setTab] = useState<'trehole' | 'consult'>('trehole');
  const { width: screenW } = useWindowDimensions();
  // scrollX：SwipeTabView 实时写入，AnimatedTabBar 指示器实时跟随
  const scrollX = useSharedValue(0);
  const [category, setCategory] = useState<TreeHoleCategory | 'all'>('all');
  const [posts, setPosts] = useState<TreeHolePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<TreeHoleCategory>('general');
  const [isPublic, setIsPublic] = useState(true);
  const [posting, setPosting] = useState(false);
  // 我的树洞（含私密帖）
  const [myPosts, setMyPosts] = useState<TreeHolePost[]>([]);
  const [treeSubTab, setTreeSubTab] = useState<'public' | 'mine'>('public');
  // 辅助筛选区展开/收起状态
  const [filterOpen, setFilterOpen] = useState(true);

  const [reacted, setReacted] = useState<Set<string>>(new Set());
  // 互动计数：postId -> {hug, empathy, brave}
  const [reactionCounts, setReactionCounts] = useState<Record<string, { hug: number; empathy: number; brave: number }>>({});
  // 当前用户对每帖的互动选择：postId -> type | null
  const [userReactions, setUserReactions] = useState<Record<string, 'hug' | 'empathy' | 'brave' | null>>({});

  // ── 留言功能 state ──────────────────────────────────────
  // 展开留言区的 postId 集合
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  // 每条帖子的留言列表
  const [commentsMap, setCommentsMap] = useState<Record<string, TreeHoleComment[]>>({});
  // 每条帖子的留言输入内容
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  // 正在提交留言的 postId
  const [commentPosting, setCommentPosting] = useState<string | null>(null);
  // 长按菜单
  const [longPressMenu, setLongPressMenu] = useState<{ comment: TreeHoleComment; postId: string } | null>(null);
  // 删除确认弹窗
  const [deleteConfirm, setDeleteConfirm] = useState<{ comment: TreeHoleComment; postId: string } | null>(null);
  // 轻提示
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  async function loadPosts() {
    setLoading(true);
    const data = await getPublicPosts(category === 'all' ? undefined : category, 30);
    setPosts(data);
    // 批量加载互动计数与当前用户的互动状态
    if (data.length > 0) {
      const ids = data.map(p => p.id);
      const [counts, userRxns] = await Promise.all([
        getBatchReactionCounts(ids),
        session ? getUserReactionsForPosts(session.user.id, ids) : Promise.resolve({} as Record<string, 'hug' | 'empathy' | 'brave' | null>),
      ]);
      setReactionCounts(counts);
      setUserReactions(userRxns);
    }
    setLoading(false);
  }

  async function loadMyPosts() {
    if (!session) return;
    const { data } = await supabase
      .from('tree_hole_posts')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setMyPosts(Array.isArray(data) ? data : []);
  }

  useFocusEffect(
    useCallback(() => {
      loadPosts();
      loadMyPosts();
    }, [category, session]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handlePost = async () => {
    if (!session || !newContent.trim()) return;
    if (newContent.trim().length > POST_MAX_LEN) return;
    if (detectCrisis(newContent)) { showCrisisPanel(); return; }
    setPosting(true);
    await createPost(session.user.id, newContent.trim(), newCategory, isPublic);
    setNewContent('');
    setShowCompose(false);
    setPosting(false);
    await loadPosts();
    await loadMyPosts();
  };

  const handleReact = async (postId: string, type: 'hug' | 'empathy' | 'brave') => {
    if (!session) return;
    const prev = userReactions[postId] ?? null;
    // 乐观更新：立刻更新本地状态
    setUserReactions(u => ({ ...u, [postId]: type }));
    setReactionCounts(c => {
      const cur = c[postId] ?? { hug: 0, empathy: 0, brave: 0 };
      const next = { ...cur };
      if (prev && prev !== type) next[prev] = Math.max(0, next[prev] - 1); // 撤销旧选择
      if (prev !== type) next[type] = next[type] + 1;                       // 累加新选择
      return { ...c, [postId]: next };
    });
    await addReaction(session.user.id, postId, type);
    // 同步服务端真实数据
    const [counts, userRxns] = await Promise.all([
      getBatchReactionCounts([postId]),
      getUserReactionsForPosts(session.user.id, [postId]),
    ]);
    setReactionCounts(c => ({ ...c, ...counts }));
    setUserReactions(u => ({ ...u, ...userRxns }));
  };

  const handleDeleteMyPost = async (postId: string) => {
    await deletePost(postId);
    setMyPosts(prev => prev.filter(p => p.id !== postId));
  };

  // ── 留言操作 ──────────────────────────────────────────
  const toggleComments = async (postId: string) => {
    const isOpen = expandedComments.has(postId);
    if (isOpen) {
      setExpandedComments(prev => { const s = new Set(prev); s.delete(postId); return s; });
    } else {
      setExpandedComments(prev => new Set([...prev, postId]));
      // 如果还没有加载过，立即加载
      if (!commentsMap[postId]) {
        const data = await getPostComments(postId);
        setCommentsMap(prev => ({ ...prev, [postId]: data }));
      }
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!session) return;
    const text = (commentInputs[postId] ?? '').trim();
    if (!text) return;
    setCommentPosting(postId);
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    await addComment(session.user.id, postId, text);
    const fresh = await getPostComments(postId);
    setCommentsMap(prev => ({ ...prev, [postId]: fresh }));
    setCommentPosting(null);
    showToast('留言已发送 ✓');
  };

  const handleCopyComment = async (comment: TreeHoleComment) => {
    await Clipboard.setStringAsync(comment.content);
    setLongPressMenu(null);
    showToast('已复制到剪贴板 ✓');
  };

  const handleDeleteComment = async (comment: TreeHoleComment, postId: string) => {
    setDeleteConfirm(null);
    setLongPressMenu(null);
    await deleteComment(comment.id);
    const fresh = await getPostComments(postId);
    setCommentsMap(prev => ({ ...prev, [postId]: fresh }));
    showToast('留言已删除');
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}小时前`;
    return formatDate(dateStr);
  };

  const CATEGORY_MAP: Record<string, string> = {
    academic: '学业压力', interpersonal: '人际困扰',
    workplace: '职场调节', emotion: '情绪宣泄', general: '随心倾诉',
  };

  // 每个回应按钮的独立配色
  const REACTION_STYLES: Record<string, { bg: string; activeBg: string; textColor: string; activeTextColor: string; border: string }> = {
    hug:     { bg: '#FFF0ED', activeBg: '#FFCFC7', textColor: '#C4614E', activeTextColor: '#A0422F', border: '#FFCFC7' },
    empathy: { bg: '#EDF5FF', activeBg: '#C2DEFF', textColor: '#3A72B8', activeTextColor: '#2558A0', border: '#C2DEFF' },
    brave:   { bg: '#FFFBE8', activeBg: '#FFE97A', textColor: '#9A7A00', activeTextColor: '#7A6000', border: '#FFE97A' },
  };

  const renderPost = ({ item }: { item: TreeHolePost }) => {
    const commentsOpen = expandedComments.has(item.id);
    const comments = commentsMap[item.id] ?? [];
    const commentInput = commentInputs[item.id] ?? '';
    const isPosting = commentPosting === item.id;
    const counts = reactionCounts[item.id] ?? { hug: 0, empathy: 0, brave: 0 };
    const myReaction = userReactions[item.id] ?? null;

    return (
      <View style={{
        backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 12,
        borderRadius: 20, padding: 16,
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.07)' }],
      }}>
        {/* 头部 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0F7EC', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16 }}>🌿</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 12, color: '#9CA3AF' }}>匿名用户 · {timeAgo(item.created_at)}</Text>
          <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: '#E8A36550' }}>
            <Text style={{ fontSize: 11, color: '#E8A365', fontWeight: '600' }}>{CATEGORY_MAP[item.category] || '随心倾诉'}</Text>
          </View>
        </View>

        {/* 正文 */}
        <Text style={{ fontSize: 14, color: '#1F2937', lineHeight: 22, marginBottom: 14 }}>{item.content}</Text>

        {/* 分隔线 */}
        <View style={{ height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 }} />

        {/* 回应按钮行 */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {REACTIONS.map(r => {
            const s = REACTION_STYLES[r.type] ?? REACTION_STYLES.hug;
            const done = myReaction === r.type;
            const cnt = counts[r.type as keyof typeof counts] ?? 0;
            return (
              <Pressable key={r.type} onPress={() => handleReact(item.id, r.type)} style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 4, paddingVertical: 9, borderRadius: 14,
                backgroundColor: done ? s.activeBg : s.bg,
                borderWidth: 1.5, borderColor: done ? s.border : s.border + '80',
              }}>
                <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: done ? s.activeTextColor : s.textColor }}>
                  {r.label}{cnt > 0 ? ` ${cnt}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 留言入口 */}
        <Pressable onPress={() => toggleComments(item.id)} style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12,
          backgroundColor: '#F8F8F8', borderWidth: 1, borderColor: '#EFEFEF',
          alignSelf: 'flex-start',
        }}>
          <MessageCircle size={14} color="#9CA3AF" />
          <Text style={{ fontSize: 12, color: '#9CA3AF', fontWeight: '500' }}>
            {comments.length > 0 ? `${comments.length} 条留言` : '留言'}
          </Text>
          {commentsOpen ? <ChevronUp size={13} color="#9CA3AF" /> : <ChevronDown size={13} color="#9CA3AF" />}
        </Pressable>

        {/* 展开留言区 */}
        {commentsOpen && (
          <View style={{ marginTop: 12 }}>
            <View style={{ height: 1, backgroundColor: '#F3F4F6', marginBottom: 10 }} />
            {comments.length === 0 ? (
              <Text style={{ fontSize: 12, color: '#C4C9D4', textAlign: 'center', paddingVertical: 8 }}>
                还没有留言，来说第一句话吧 🌱
              </Text>
            ) : (
              [...comments].reverse().map(c => {
                const isMine = session?.user.id === c.user_id;
                const bubble = (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isMine ? '#FFF0D8' : '#F0F7EC', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Text style={{ fontSize: 13 }}>{isMine ? '🙂' : '🌿'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{
                        backgroundColor: isMine ? '#FFF8EE' : '#F8F9FA',
                        borderRadius: 12, borderTopLeftRadius: isMine ? 12 : 3, borderTopRightRadius: isMine ? 3 : 12,
                        paddingHorizontal: 12, paddingVertical: 8,
                        borderWidth: 1, borderColor: isMine ? '#F5E6CC' : '#EFEFEF',
                      }}>
                        <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>{c.content}</Text>
                      </View>
                      <Text style={{ fontSize: 10, color: '#C4C9D4', marginTop: 3, marginLeft: 4 }}>
                        {isMine ? '我' : '匿名'} · {timeAgo(c.created_at)}
                        {isMine && <Text style={{ color: '#E8A365' }}>  长按可操作</Text>}
                      </Text>
                    </View>
                  </View>
                );
                return isMine ? (
                  <Pressable key={c.id} delayLongPress={400}
                    onPress={() => {}}
                    onLongPress={() => setLongPressMenu({ comment: c, postId: item.id })}>
                    {bubble}
                  </Pressable>
                ) : (
                  <View key={c.id}>{bubble}</View>
                );
              })
            )}
            {session && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 }}>
                <TextInput value={commentInput}
                  onChangeText={t => setCommentInputs(prev => ({ ...prev, [item.id]: t }))}
                  placeholder="说点什么…" placeholderTextColor="#C4C9D4" multiline
                  style={{
                    flex: 1, backgroundColor: '#F8F9FA', borderRadius: 16,
                    paddingHorizontal: 14, paddingVertical: 9,
                    fontSize: 13, color: '#374151', maxHeight: 80,
                    borderWidth: 1.5, borderColor: '#EFEFEF', lineHeight: 19,
                  }} />
                <Pressable onPress={() => handleAddComment(item.id)} disabled={!commentInput.trim() || isPosting}
                  style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: commentInput.trim() ? '#E8A365' : '#EFEFEF',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                  {isPosting
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Send size={16} color={commentInput.trim() ? '#FFFFFF' : '#C4C9D4'} />}
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      {/* 顶部 */}
      <View className="px-5 pt-14 pb-3">
        <Text className="text-2xl font-bold text-foreground">疗愈空间 🛋️</Text>
        <Text className="text-muted-foreground text-sm mt-1">倾诉·对话·被看见</Text>
        {/* 主 Tab — AnimatedTabBar 滑动指示器 */}
        <View className="mt-4">
          <AnimatedTabBar
            tabs={[
              { id: 'trehole', label: '🌳 匿名树洞' },
              { id: 'consult', label: '🧘 咨询对话' },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as 'trehole' | 'consult')}
            scrollX={scrollX}
            screenW={screenW}
          />
        </View>
      </View>

      <SwipeTabView
        activeIndex={tab === 'trehole' ? 0 : 1}
        onIndexChange={(i) => setTab(i === 0 ? 'trehole' : 'consult')}
        scrollX={scrollX}
      >
        {/* 匿名树洞 */}
        <View style={{ flex: 1 }}>
          {/* 辅助筛选区标题行：点击展开/收起 */}
          <Pressable
            onPress={() => setFilterOpen(o => !o)}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 6,
            }}
          >
            {/* 子 tab 胶囊（始终可见，作为折叠控制器） */}
            <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
              {[{ id: 'public', label: '🌍 公开广场' }, { id: 'mine', label: '🔒 我的树洞' }].map(t => (
                <Pressable
                  key={t.id}
                  onPress={() => setTreeSubTab(t.id as 'public' | 'mine')}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: treeSubTab === t.id ? '#E8A365' : 'transparent',
                    borderWidth: 1,
                    borderColor: treeSubTab === t.id ? '#E8A365' : '#D1D5DB',
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: treeSubTab === t.id ? '600' : '400',
                    color: treeSubTab === t.id ? '#fff' : '#6B7280',
                  }}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            {/* 展开/收起图标 */}
            <FilterChevron open={filterOpen} />
          </Pressable>

          {/* 折叠面板：分类 chips（仅在公开广场时有意义） */}
          <CollapsePanel visible={filterOpen && treeSubTab === 'public'}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 0 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, paddingTop: 2, gap: 8, alignItems: 'center' }}>
              {TREE_HOLE_CATEGORIES.map(c => (
                <ToggleChip key={c.id} emoji={c.emoji} label={c.label}
                  isActive={category === c.id} onPress={() => setCategory(c.id as any)} />
              ))}
            </ScrollView>
          </CollapsePanel>

          <View style={{ flex: 1 }}>
              {treeSubTab === 'public' ? (
                // ── 公开广场：FlatList flex-1 填满剩余空间 ──
                <View style={{ flex: 1 }}>
                  {loading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator color="#E8A365" />
                    </View>
                  ) : (
                    <FlatList
                      style={{ flex: 1 }}
                      data={posts} renderItem={renderPost} keyExtractor={i => i.id}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled
                      contentInsetAdjustmentBehavior="automatic"
                      ListEmptyComponent={
                        <View style={{ alignItems: 'center', paddingVertical: 64 }}>
                          <Text style={{ fontSize: 36, marginBottom: 12 }}>🌿</Text>
                          <Text style={{ color: '#9CA3AF', fontSize: 14 }}>这里还没有倾诉，成为第一个吧</Text>
                        </View>
                      }
                      ListFooterComponent={<View style={{ height: 96 }} />}
                    />
                  )}
                </View>
              ) : (
                /* 我的树洞（含私密帖） */
                <FlatList
                  data={myPosts}
                  keyExtractor={i => i.id}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentInsetAdjustmentBehavior="automatic"
                  renderItem={({ item }) => (
                    <View className="bg-card mx-5 mb-3 rounded-2xl p-4"
                      style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}>
                      <View className="flex-row items-center gap-2 mb-2">
                        <View className={`rounded-full px-2 py-0.5 ${item.is_public ? 'bg-primary/10' : 'bg-purple-100'}`}>
                          <Text className={`text-xs font-medium ${item.is_public ? 'text-primary' : 'text-purple-600'}`}>
                            {item.is_public ? '🌍 公开' : '🔒 仅自己'}
                          </Text>
                        </View>
                        <Text className="text-muted-foreground text-xs flex-1">{timeAgo(item.created_at)}</Text>
                        {/* 删除按钮 */}
                        <Pressable
                          onPress={() => handleDeleteMyPost(item.id)}
                          className="w-7 h-7 rounded-full bg-destructive/10 items-center justify-center"
                        >
                          <Trash2 size={13} color="#E88A7D" />
                        </Pressable>
                      </View>
                      <Text className="text-foreground text-sm leading-6">{item.content}</Text>
                    </View>
                  )}
                  ListEmptyComponent={<View className="items-center py-16"><Text className="text-4xl mb-3">🌿</Text><Text className="text-muted-foreground text-sm">还没有记录，来写下今天的心情吧</Text></View>}
                  ListFooterComponent={<View className="h-24" />}
                />
              )}
            </View>

          {/* 发布按钮 */}
          {session && (
            <Pressable
              className="absolute bottom-6 right-6 bg-primary w-14 h-14 rounded-full items-center justify-center"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(232,163,101,0.4)' }] }}
              onPress={() => setShowCompose(true)}
            >
              <Text className="text-primary-foreground text-2xl font-light">+</Text>
            </Pressable>
          )}
        </View>

        {/* 咨询对话 */}
        <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ padding: 20 }}>
          <Text className="text-foreground font-bold text-base mb-1">选择你的心理伙伴</Text>
          <Text className="text-muted-foreground text-sm mb-4">五位流派专家，陪你探索内心</Text>
          {EXPERTS.map(expert => (
            <Pressable
              key={expert.id}
              className="bg-card rounded-2xl p-4 mb-3 flex-row items-center"
              style={{
                boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }],
                opacity: subLevel < 2 ? 0.72 : 1,
              }}
              onPress={() => {
                if (subLevel < 2) { setUpgradeVisible(true); return; }
                router.push(`/(app)/chat/${expert.id}`);
              }}
            >
              <View className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                style={{ backgroundColor: expert.color + '25' }}>
                <Text className="text-2xl">{expert.emoji}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <Text className="text-foreground font-bold text-base">{expert.name}</Text>
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: expert.color + '20' }}>
                    <Text className="text-xs font-medium" style={{ color: expert.color }}>{expert.school}</Text>
                  </View>
                  {/* AI工作台付费标签 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF3E8', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, color: '#D4845A', fontWeight: '800' }}>⚡ AI工作台</Text>
                  </View>
                </View>
                <Text className="text-muted-foreground text-xs mt-0.5">{expert.description}</Text>
                <Text className="text-sm mt-1" style={{ color: expert.color }}>{expert.style}</Text>
              </View>
              <View className="bg-muted rounded-xl w-8 h-8 items-center justify-center">
                <Text className="text-muted-foreground">›</Text>
              </View>
            </Pressable>
          ))}
          <View className="bg-accent/10 rounded-2xl p-4 mt-2">
            <Text className="text-foreground font-semibold text-sm mb-1">💡 温馨提示</Text>
            <Text className="text-muted-foreground text-xs leading-5">
              AI专家对话仅供辅助疏导，不替代专业心理咨询。
              如感到持续痛苦，请及时寻求专业帮助。
            </Text>
          </View>
          <View className="h-8" />
        </ScrollView>
      </SwipeTabView>

      {/* 发帖弹窗 */}
      <Modal visible={showCompose} animationType="slide" transparent>
        <KeyboardAvoidingView
          className="flex-1 justify-end"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-8">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-foreground font-bold text-lg">🌿 向树洞倾诉</Text>
              <Pressable onPress={() => setShowCompose(false)}>
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            {/* 分类选择 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              {TREE_HOLE_CATEGORIES.filter(c => c.id !== 'all').map(c => (
                <ToggleChip
                  key={c.id}
                  emoji={c.emoji}
                  label={c.label}
                  isActive={newCategory === c.id}
                  onPress={() => setNewCategory(c.id as TreeHoleCategory)}
                />
              ))}
            </ScrollView>

            <TextInput
              className="bg-muted rounded-2xl p-4 text-foreground text-sm leading-6"
              placeholder="把你的心事告诉这里，没有评判，只有陪伴..."
              placeholderTextColor="#9CA3AF"
              value={newContent}
              onChangeText={t => setNewContent(t.slice(0, POST_MAX_LEN))}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={{ minHeight: 120 }}
            />
            {/* 字符计数器 */}
            <View className="flex-row justify-end mt-1 mb-1">
              <Text style={{
                fontSize: 11,
                color: newContent.length >= POST_MAX_LEN * 0.9 ? '#F59E0B' : '#CBD5E1',
                fontWeight: newContent.length >= POST_MAX_LEN * 0.9 ? '600' : '400',
              }}>
                {newContent.length} / {POST_MAX_LEN}
              </Text>
            </View>

            {/* 公开/私密 */}
            <View className="flex-row items-center gap-3 mt-1">
              <ToggleChip label="🌍 公开求共鸣" isActive={isPublic}  activeColor="#E8A365" onPress={() => setIsPublic(true)} />
              <ToggleChip label="🔒 仅自我记录"  isActive={!isPublic} activeColor="#9B8EC4" onPress={() => setIsPublic(false)} />
            </View>

            <Pressable
              className="bg-primary rounded-2xl py-3.5 items-center mt-4 flex-row justify-center gap-2"
              onPress={handlePost}
              disabled={posting || !newContent.trim()}
              style={{ opacity: posting || !newContent.trim() ? 0.6 : 1 }}
            >
              {posting ? <ActivityIndicator color="white" size="small" /> : <Send size={16} color="white" />}
              <Text className="text-primary-foreground font-semibold">放入树洞</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 长按操作菜单 ── */}
      {longPressMenu && (
        <Pressable
          onPress={() => setLongPressMenu(null)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{ width: '100%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}
          >
            {/* 留言预览 */}
            <View style={{ backgroundColor: '#F8F9FA', borderRadius: 14, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }} numberOfLines={3}>{longPressMenu.comment.content}</Text>
            </View>
            {/* 复制 */}
            <Pressable
              onPress={() => handleCopyComment(longPressMenu.comment)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
            >
              <Text style={{ fontSize: 22 }}>📋</Text>
              <Text style={{ fontSize: 16, color: '#1F2937', fontWeight: '500' }}>复制留言</Text>
            </Pressable>
            {/* 删除 */}
            <Pressable
              onPress={() => { setDeleteConfirm(longPressMenu); setLongPressMenu(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}
            >
              <Text style={{ fontSize: 22 }}>🗑️</Text>
              <Text style={{ fontSize: 16, color: '#EF4444', fontWeight: '500' }}>删除留言</Text>
            </Pressable>
            {/* 取消 */}
            <Pressable
              onPress={() => setLongPressMenu(null)}
              style={{ marginTop: 8, backgroundColor: '#F3F4F6', borderRadius: 16, paddingVertical: 13, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, color: '#6B7280', fontWeight: '600' }}>取消</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {/* ── 删除确认弹窗 ── */}
      {deleteConfirm && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#1F2937', marginBottom: 8, textAlign: 'center' }}>删除留言</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 20, textAlign: 'center', marginBottom: 20 }}>
              确定要删除这条留言吗？{'\n'}删除后无法恢复。
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setDeleteConfirm(null)}
                style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => handleDeleteComment(deleteConfirm.comment, deleteConfirm.postId)}
                style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>确认删除</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Toast 轻提示 ── */}
      {toast && (
        <View style={{
          position: 'absolute', bottom: 100, alignSelf: 'center',
          backgroundColor: 'rgba(31,41,55,0.88)', borderRadius: 22,
          paddingHorizontal: 20, paddingVertical: 10,
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>{toast}</Text>
        </View>
      )}

      {/* 升级引导弹窗 */}
      <UpgradeModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        requiredLevel={2}
        featureName="AI专家咨询"
        featureDesc="与10位心理流派专家一对一深度对话，需要 AI工作台版 解锁"
      />
    </View>
  );
}
