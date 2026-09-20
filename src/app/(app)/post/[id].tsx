import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, FlatList, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Heart, MessageCircle, Send, Trash2 } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { getPostById, addReaction, getPostComments, addComment, deleteComment } from '@/db/api';
import type { TreeHolePost, TreeHoleComment } from '@/types/types';

// 各分类标签颜色
const CATEGORY_COLORS: Record<string, string> = {
  academic: '#5B9BD5',
  relationship: '#E8A365',
  workplace: '#7A9D8C',
  family: '#C4856A',
  emotion: '#9B8EC4',
  growth: '#E8C56A',
  other: '#9CA3AF',
};
const CATEGORY_LABELS: Record<string, string> = {
  academic: '学业压力',
  relationship: '人际困扰',
  workplace: '职场调节',
  family: '家庭关系',
  emotion: '情绪管理',
  growth: '自我成长',
  other: '其他',
};
const CATEGORY_EMOJI: Record<string, string> = {
  academic: '📚',
  relationship: '💑',
  workplace: '💼',
  family: '🏠',
  emotion: '💭',
  growth: '🌱',
  other: '💬',
};

// 暖心回应模板
const WARM_REACTIONS = [
  { type: 'hug' as const,      emoji: '🤗', label: '抱抱你' },
  { type: 'relate' as const,   emoji: '🫂', label: '我也经历过' },
  { type: 'brave' as const,    emoji: '💪', label: '你很勇敢' },
];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return `${Math.floor(diff / 86400)} 天前`;
  } catch { return ''; }
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();

  const [post, setPost] = useState<TreeHolePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [reactionCount, setReactionCount] = useState(0);
  const [reacting, setReacting] = useState<string | null>(null);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [reactionNote, setReactionNote] = useState('');
  const [showReactionInput, setShowReactionInput] = useState(false);
  const [selectedReactionType, setSelectedReactionType] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // 评论
  const [comments, setComments] = useState<TreeHoleComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        if (id) {
          const data = await getPostById(id);
          setPost(data);
          setReactionCount(0);
          const cmts = await getPostComments(id);
          setComments(cmts);
        }
        setLoading(false);
      })();
    }, [id])
  );

  const handleSendComment = async () => {
    if (!session || !commentText.trim() || !id) return;
    setSendingComment(true);
    await addComment(session.user.id, id, commentText.trim());
    setCommentText('');
    const cmts = await getPostComments(id);
    setComments(cmts);
    setSendingComment(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const handleSelectReaction = (type: string) => {
    if (myReaction) return;
    setSelectedReactionType(type);
    setShowReactionInput(true);
  };

  const handleSendReaction = async () => {
    if (!session || !selectedReactionType || !id) return;
    setReacting(selectedReactionType);
    await addReaction(session.user.id, id, selectedReactionType as any);
    setMyReaction(selectedReactionType);
    setReacting(null);
    setShowReactionInput(false);
    setSubmitted(true);
    setReactionCount(c => c + 1);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#E8A365" />
      </View>
    );
  }

  if (!post) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Pressable
          onPress={() => router.back()}
          className="absolute top-14 left-4 w-9 h-9 rounded-full bg-muted items-center justify-center"
        >
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="text-5xl mb-4">🌿</Text>
        <Text className="text-muted-foreground text-base">帖子不存在或已被删除</Text>
      </View>
    );
  }

  const color = CATEGORY_COLORS[post.category] ?? '#9CA3AF';

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部导航栏 */}
      <View className="flex-row items-center px-4 pt-14 pb-4 bg-card border-b border-border">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 w-9 h-9 rounded-full bg-muted items-center justify-center"
        >
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <View
          className="flex-row items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ backgroundColor: color + '20' }}
        >
          <Text className="text-sm">{CATEGORY_EMOJI[post.category] ?? '💬'}</Text>
          <Text className="text-xs font-semibold" style={{ color }}>
            {CATEGORY_LABELS[post.category] ?? '树洞'}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        <View className="px-5 pt-6 pb-32">
          {/* 内容卡片 */}
          <View
            className="bg-card rounded-3xl p-5 mb-5"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}
          >
            {/* 匿名标识 */}
            <View className="flex-row items-center gap-2 mb-4">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: color + '25' }}
              >
                <Text className="text-lg">{CATEGORY_EMOJI[post.category] ?? '🌿'}</Text>
              </View>
              <View>
                <Text className="text-foreground font-semibold text-sm">匿名旅人</Text>
                <Text className="text-muted-foreground text-xs">{formatTime(post.created_at)}</Text>
              </View>
              {post.is_public && (
                <View className="ml-auto bg-green-50 rounded-full px-2 py-0.5">
                  <Text className="text-green-600 text-xs font-medium">公开求共鸣</Text>
                </View>
              )}
            </View>

            {/* 正文 */}
            <Text className="text-foreground text-base leading-8">
              {post.content}
            </Text>

            {/* 统计 */}
            <View className="flex-row items-center gap-4 mt-5 pt-4 border-t border-border">
              <View className="flex-row items-center gap-1.5">
                <Heart size={14} color="#9CA3AF" />
                <Text className="text-muted-foreground text-xs">{reactionCount} 次暖心回应</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <MessageCircle size={14} color="#9CA3AF" />
                <Text className="text-muted-foreground text-xs">匿名树洞</Text>
              </View>
            </View>
          </View>

          {/* 评论区 */}
          {post.is_public && (
            <View className="mb-6">
              <Text className="text-foreground font-bold text-base mb-3">
                💬 评论区 <Text className="text-muted-foreground text-sm font-normal">({comments.length})</Text>
              </Text>

              {/* 评论列表 */}
              {comments.length === 0 ? (
                <View className="bg-muted rounded-2xl p-5 items-center mb-4">
                  <Text className="text-3xl mb-2">🌱</Text>
                  <Text className="text-muted-foreground text-sm">还没有评论，来说点什么吧</Text>
                </View>
              ) : (
                <View className="gap-3 mb-4">
                  {comments.map(c => (
                    <View key={c.id} className="bg-card rounded-2xl p-4 border border-border">
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                          <View className="w-7 h-7 rounded-full bg-primary/15 items-center justify-center">
                            <Text style={{ fontSize: 13 }}>🌿</Text>
                          </View>
                          <Text className="text-muted-foreground text-xs">匿名旅人</Text>
                          <Text className="text-muted-foreground text-xs">· {formatTime(c.created_at)}</Text>
                        </View>
                        {session?.user.id === c.user_id && (
                          <Pressable onPress={() => handleDeleteComment(c.id)} className="p-1">
                            <Trash2 size={14} color="#9CA3AF" />
                          </Pressable>
                        )}
                      </View>
                      <Text className="text-foreground text-sm leading-6">{c.content}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 发评论输入框 */}
              {session ? (
                <KeyboardAvoidingView behavior="padding">
                  <View className="flex-row items-end gap-2 bg-muted rounded-2xl px-3 py-2">
                    <TextInput
                      className="flex-1 text-foreground text-sm"
                      placeholder="写下你的回应，温暖彼此..."
                      placeholderTextColor="#9CA3AF"
                      value={commentText}
                      onChangeText={t => setCommentText(t.slice(0, 200))}
                      multiline
                      style={{ maxHeight: 80 }}
                    />
                    <Pressable
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: commentText.trim() ? '#E8A365' : '#E5E7EB' }}
                      onPress={handleSendComment}
                      disabled={!commentText.trim() || sendingComment}
                    >
                      {sendingComment
                        ? <ActivityIndicator size="small" color="white" />
                        : <Send size={15} color={commentText.trim() ? 'white' : '#9CA3AF'} />}
                    </Pressable>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <View className="bg-muted rounded-2xl p-4 items-center">
                  <Text className="text-muted-foreground text-sm">登录后可发表评论</Text>
                </View>
              )}
            </View>
          )}

          {/* 暖心回音壁 */}
          {post.is_public && (
            <View className="mb-6">
              <Text className="text-foreground font-bold text-base mb-1">🫧 暖心回音壁</Text>
              <Text className="text-muted-foreground text-xs mb-4 leading-5">
                只能选择预设暖心模板回应，不加评判，只有温暖陪伴。
              </Text>

              {submitted ? (
                <View className="bg-primary/10 rounded-2xl p-5 items-center">
                  <Text className="text-3xl mb-2">💛</Text>
                  <Text className="text-foreground font-semibold text-sm">已送出你的暖意</Text>
                  <Text className="text-muted-foreground text-xs mt-1">感谢你的陪伴与温暖</Text>
                </View>
              ) : !session ? (
                <View className="bg-muted rounded-2xl p-5 items-center">
                  <Text className="text-muted-foreground text-sm">登录后可以发送暖心回应</Text>
                </View>
              ) : (
                <>
                  <View className="flex-row gap-3 mb-3">
                    {WARM_REACTIONS.map(r => {
                      const isSelected = selectedReactionType === r.type;
                      const isMine = myReaction === r.type;
                      return (
                        <Pressable
                          key={r.type}
                          className={`flex-1 rounded-2xl py-4 items-center border-2 ${
                            isSelected || isMine ? 'border-primary bg-primary/10' : 'border-border bg-card'
                          }`}
                          onPress={() => handleSelectReaction(r.type)}
                          disabled={!!myReaction}
                          style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.05)' }] }}
                        >
                          <Text className="text-2xl mb-1">{r.emoji}</Text>
                          <Text className={`text-xs font-medium ${isSelected || isMine ? 'text-primary' : 'text-muted-foreground'}`}>
                            {r.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* 可选附言 */}
                  {showReactionInput && (
                    <View className="bg-card rounded-2xl p-4 border border-border">
                      <Text className="text-foreground font-medium text-sm mb-2">
                        想加一句话吗？（可选）
                      </Text>
                      <TextInput
                        className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-3"
                        placeholder="最多30字，温暖为主..."
                        placeholderTextColor="#9CA3AF"
                        value={reactionNote}
                        onChangeText={t => setReactionNote(t.slice(0, 30))}
                        returnKeyType="done"
                      />
                      <View className="flex-row gap-3">
                        <Pressable
                          className="flex-1 bg-muted rounded-xl py-3 items-center"
                          onPress={() => { setShowReactionInput(false); setSelectedReactionType(null); }}
                        >
                          <Text className="text-foreground font-medium text-sm">取消</Text>
                        </Pressable>
                        <Pressable
                          className="flex-1 bg-primary rounded-xl py-3 items-center"
                          onPress={handleSendReaction}
                          disabled={!!reacting}
                        >
                          {reacting ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Text className="text-primary-foreground font-bold text-sm">送出温暖 💛</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* 底部提示 */}
          <View className="bg-amber-50 rounded-2xl p-4">
            <Text className="text-amber-800 font-semibold text-sm mb-1">🌟 微光提示</Text>
            <Text className="text-amber-700 text-xs leading-5">
              每一份倾诉都需要勇气。如果你也有话想说，树洞永远为你开着。如有危机请拨打心理援助热线 400-161-9995。
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
