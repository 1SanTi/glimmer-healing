import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { getArticleById } from '@/db/api';
import type { Article } from '@/types/types';

const CATEGORY_COLORS: Record<string, string> = {
  emotion: '#E8A365', stress: '#9B8EC4', self: '#7A9D8C',
  frontier: '#5B9BD5', satir: '#C4856A', positive: '#E8C56A',
};
const CATEGORY_LABELS: Record<string, string> = {
  emotion: '情绪管理', stress: '压力适应', self: '自我探索',
  frontier: '前沿研究', satir: '沟通姿态', positive: '积极心理',
};
const CATEGORY_EMOJI: Record<string, string> = {
  emotion: '💭', stress: '🏔', self: '🪞', frontier: '🔬', satir: '💬', positive: '🌟',
};

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        if (id) {
          const data = await getArticleById(id);
          setArticle(data);
        }
        setLoading(false);
      })();
    }, [id])
  );

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#E8A365" />
      </View>
    );
  }

  if (!article) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Pressable onPress={() => router.back()} className="absolute top-14 left-4 w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="text-muted-foreground">文章不存在</Text>
      </View>
    );
  }

  const color = CATEGORY_COLORS[article.category] ?? '#E8A365';

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        {/* 封面区 */}
        <View className="h-52 items-center justify-center relative" style={{ backgroundColor: color + '18' }}>
          <Pressable onPress={() => router.back()}
            className="absolute top-14 left-4 w-9 h-9 rounded-full bg-white/90 items-center justify-center"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.1)' }] }}>
            <ArrowLeft size={18} color="#6B7280" />
          </Pressable>
          <Text style={{ fontSize: 56 }}>{CATEGORY_EMOJI[article.category] ?? '📄'}</Text>
        </View>

        <View className="px-5 pt-5 pb-24">
          {/* 分类标签 */}
          <View className="flex-row items-center gap-2 mb-3">
            <View className="rounded-full px-3 py-1" style={{ backgroundColor: color + '20' }}>
              <Text className="text-xs font-semibold" style={{ color }}>
                {CATEGORY_LABELS[article.category]}
              </Text>
            </View>
            {article.is_featured && (
              <View className="rounded-full px-3 py-1 bg-primary/10">
                <Text className="text-xs font-semibold text-primary">精选</Text>
              </View>
            )}
          </View>

          {/* 标题 */}
          <Text className="text-foreground text-2xl font-bold leading-8 mb-3">{article.title}</Text>

          {/* 摘要 */}
          {article.summary && (
            <View className="bg-muted rounded-2xl p-4 mb-5">
              <Text className="text-muted-foreground text-sm leading-6 italic">{article.summary}</Text>
            </View>
          )}

          {/* 正文 */}
          <Text className="text-foreground text-base leading-8">
            {article.content ?? article.summary ?? '内容暂未收录，请关注后续更新。'}
          </Text>

          {/* 底部提示 */}
          <View className="mt-8 bg-amber-50 rounded-2xl p-4">
            <Text className="text-amber-800 font-semibold text-sm mb-1">💡 微光提示</Text>
            <Text className="text-amber-700 text-xs leading-5">
              以上内容仅供科普参考，不构成专业医疗建议。如有持续心理困扰，建议寻求专业心理咨询。
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
