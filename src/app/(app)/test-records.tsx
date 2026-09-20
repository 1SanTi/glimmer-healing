/**
 * test-records.tsx — 测评档案页
 *
 * 入口：我的 → 测评档案
 * 功能：
 *  - 按日期分组展示所有测评记录
 *  - 点击单条记录查看详细内容（底部弹窗）
 *  - 支持房树人画作图片展示
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, ActivityIndicator,
  FlatList,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, X, Calendar, FileText, Moon, Palette, Box, Download } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useSession } from '@/ctx';
import { getTestResults, getDreamRecords } from '@/db/api';
import type { TestResult } from '@/types/types';

// ── 测评类型配置（完整版） ─────────────────────────────────────
const TEST_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  // 专业筛查
  scl90:          { label: 'SCL-90', emoji: '📊', color: '#6366F1' },
  mht:            { label: 'MHT心理健康', emoji: '🧠', color: '#8B5CF6' },
  phq9:           { label: 'PHQ-9抑郁', emoji: '🌧', color: '#64748B' },
  gad7:           { label: 'GAD-7焦虑', emoji: '🌪', color: '#7C3AED' },
  sds:            { label: 'SDS抑郁自评', emoji: '💧', color: '#3B82F6' },
  sas:            { label: 'SAS焦虑自评', emoji: '⚡', color: '#8B5CF6' },
  burnout:        { label: '职业倦怠', emoji: '🔥', color: '#EF4444' },
  social_anxiety: { label: '社交焦虑', emoji: '👥', color: '#06B6D4' },
  loneliness:     { label: '孤独感测评', emoji: '🌙', color: '#8B5CF6' },
  stress:         { label: '压力测试', emoji: '🌊', color: '#0EA5E9' },
  // 性格/人格
  mbti:           { label: 'MBTI', emoji: '🎭', color: '#EC4899' },
  big5:           { label: 'Big Five大五人格', emoji: '🧬', color: '#F43F5E' },
  enneagram:      { label: '九型人格', emoji: '🔮', color: '#7C3AED' },
  via:            { label: 'VIA品格优势', emoji: '⭐', color: '#F59E0B' },
  confidence:     { label: '自信度测试', emoji: '💪', color: '#10B981' },
  ses:            { label: '自尊量表SES', emoji: '🌟', color: '#F59E0B' },
  grit:           { label: 'Grit坚毅力', emoji: '🏋️', color: '#059669' },
  // 幸福感/意义
  mlq:            { label: '人生意义感', emoji: '🌠', color: '#6366F1' },
  maas:           { label: '正念注意觉知', emoji: '🧘', color: '#10B981' },
  sleep:          { label: '睡眠质量', emoji: '🌙', color: '#6366F1' },
  // 人际/社会
  aas:            { label: '成人依恋量表', emoji: '💑', color: '#EC4899' },
  ssrs:           { label: '社会支持评定', emoji: '🤝', color: '#0EA5E9' },
  scsq:           { label: '应对方式问卷', emoji: '🛡', color: '#7A9D8C' },
  holland:        { label: '霍兰德职业', emoji: '🧭', color: '#E8A365' },
  // 投射/趣味
  htp:            { label: '房树人', emoji: '🏠', color: '#E8A365' },
  mental_age:     { label: '心理年龄', emoji: '🎂', color: '#F472B6' },
  sketch:         { label: '心灵速写', emoji: '🎨', color: '#9B8EC4' },
  sandbox:        { label: '沙盘游戏室', emoji: '🏜️', color: '#7A9D8C' },
  dream:          { label: '梦的解析', emoji: '🌙', color: '#6366F1' },
  // 青少年
  mht_youth:      { label: 'MHT青少年版', emoji: '💚', color: '#9B8EC4' },
};

// ── Markdown 简单渲染（处理 **bold**, ## heading, > blockquote, ---）──────
function renderMarkdown(text: string, cfg: { color: string }) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // --- 分隔线
    if (/^-{3,}$/.test(line.trim())) {
      return <View key={i} className="h-px bg-border my-3" />;
    }
    // ## 标题
    if (/^#{1,3}\s/.test(line)) {
      const content = line.replace(/^#{1,3}\s/, '');
      return (
        <Text key={i} className="text-foreground font-bold text-sm mt-3 mb-1 leading-6">
          {renderInline(content)}
        </Text>
      );
    }
    // > 引言
    if (line.startsWith('> ')) {
      return (
        <View key={i} className="flex-row gap-2 my-1 pl-1">
          <View className="w-1 rounded-full" style={{ backgroundColor: cfg.color }} />
          <Text className="text-muted-foreground text-xs flex-1 leading-5 italic">
            {renderInline(line.slice(2))}
          </Text>
        </View>
      );
    }
    // 空行
    if (!line.trim()) return <View key={i} style={{ height: 6 }} />;
    // 普通段落
    return (
      <Text key={i} className="text-foreground text-sm leading-7">
        {renderInline(line)}
      </Text>
    );
  });
}

// 内联 **bold** 渲染
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

function getConfig(type: string) {
  return TEST_CONFIG[type] ?? { label: type, emoji: '🧪', color: '#94A3B8' };
}

// ── 统一档案条目（test_results + dream_records 合并）──────────────
interface ArchiveItem {
  id: string;
  source: 'test' | 'dream';
  test_type: string;          // test: test_type; dream: 'dream'
  summary: string | null;
  created_at: string;
  // test record extras
  result_data?: Record<string, unknown>;
  // dream record extras
  dreamTitle?: string;
  dreamContent?: string;
  dreamAnalysis?: string | null;
}

function toArchiveItems(
  tests: TestResult[],
  dreams: { id: string; title: string; content: string; ai_analysis: string | null; created_at: string }[],
): ArchiveItem[] {
  const testItems: ArchiveItem[] = tests.map(r => ({
    id: r.id,
    source: 'test',
    test_type: r.test_type,
    summary: r.summary,
    created_at: r.created_at,
    result_data: r.result_data,
  }));
  const dreamItems: ArchiveItem[] = dreams.map(d => ({
    id: d.id,
    source: 'dream',
    test_type: 'dream',
    summary: d.ai_analysis ? d.ai_analysis.slice(0, 80) : d.content.slice(0, 80),
    created_at: d.created_at,
    dreamTitle: d.title,
    dreamContent: d.content,
    dreamAnalysis: d.ai_analysis,
  }));
  return [...testItems, ...dreamItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

// ── 按日期分组 ──────────────────────────────────────────────────
function groupByDate(records: ArchiveItem[]): { date: string; items: ArchiveItem[] }[] {
  const map: Record<string, ArchiveItem[]> = {};
  records.forEach(r => {
    const dateKey = new Date(r.created_at).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!map[dateKey]) map[dateKey] = [];
    map[dateKey].push(r);
  });
  return Object.entries(map).map(([date, items]) => ({ date, items }));
}

// ── 记录详情弹窗 ────────────────────────────────────────────────
function RecordDetailModal({
  record,
  onClose,
}: {
  record: ArchiveItem | null;
  onClose: () => void;
}) {
  if (!record) return null;
  const cfg = getConfig(record.test_type);
  const time = new Date(record.created_at).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const rd = record.result_data ?? {};
  const score = typeof rd._score === 'number' ? rd._score : null;
  const imageNote = rd.image as string | undefined;

  // 解读文本：HTP / sketch / sandbox 用 interpretation；dream 用 ai_analysis；其余 summary
  const fullText: string = (() => {
    if ((record.test_type === 'htp' || record.test_type === 'sketch' || record.test_type === 'sandbox')
        && typeof rd.interpretation === 'string' && rd.interpretation.length > 0) {
      return rd.interpretation;
    }
    if (record.source === 'dream') {
      return record.dreamAnalysis ?? '暂无AI解析内容';
    }
    return record.summary ?? '暂无解读内容';
  })();

  // 判断是否有可显示/保存的图片 URL（非占位符字符串）
  const hasImageUrl = imageNote
    && imageNote !== '(已保存)'
    && imageNote !== '(手绘已保存)'
    && (imageNote.startsWith('http') || imageNote.startsWith('data:') || imageNote.startsWith('file:'));

  // 保存图片到相册（仅原生端支持）
  const [saving, setSaving] = useState(false);
  const handleSaveImage = async () => {
    if (!hasImageUrl || process.env.EXPO_OS === 'web') return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setSaving(false);
        return;
      }
      const asset = await MediaLibrary.createAssetAsync(imageNote as string);
      await MediaLibrary.createAlbumAsync('微光心愈', asset, false);
    } catch (_) {
      // 保存失败静默处理
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!record}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="bg-background rounded-t-3xl px-5 pt-4 pb-8"
          style={{ maxHeight: '85%' }}
        >
          {/* 拖拽条 */}
          <View className="w-10 h-1 rounded-full bg-border self-center mb-4" />

          {/* 标题栏 */}
          <View className="flex-row items-center mb-4">
            <View
              className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
              style={{ backgroundColor: `${cfg.color}18` }}
            >
              <Text style={{ fontSize: 22 }}>{cfg.emoji}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-base">{cfg.label}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">{time}</Text>
            </View>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center"
            >
              <X size={16} color="#6B7280" />
            </Pressable>
          </View>

          {/* ScrollView 需要 flex:1 才能撑满 maxHeight:'85%' 容器，避免内容截断 */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* 得分卡 */}
            {score !== null && score > 0 && (
              <View
                className="rounded-2xl p-4 mb-4 flex-row items-center gap-3"
                style={{ backgroundColor: `${cfg.color}12` }}
              >
                <Text style={{ fontSize: 28 }}>🎯</Text>
                <View>
                  <Text className="text-muted-foreground text-xs">测评得分</Text>
                  <Text className="text-foreground font-bold text-2xl">{score}</Text>
                </View>
              </View>
            )}

            {/* 房树人 HTP：专家推荐 */}
            {record.test_type === 'htp' && (
              <View className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: '#E8A36518' }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <Text className="text-base">🌻</Text>
                  <Text className="text-foreground font-semibold text-sm">AI心理分析已完成</Text>
                </View>
                <Text className="text-muted-foreground text-xs leading-5 mb-3">
                  房树人是投射性绘画测验，结合多模态AI对你的画作进行了深度解读。
                  建议结合以下专家进行深层探索，专家可查看并分析你的作品。
                </Text>
                <View className="gap-2">
                  {[
                    { name: '荣格', desc: '分析心理学 · 潜意识与原型探索', emoji: '🌑', color: '#9B8EC4' },
                    { name: '罗杰斯', desc: '人本主义 · 无条件接纳与陪伴', emoji: '🌻', color: '#E8A365' },
                    { name: '皮尔斯', desc: '格式塔疗法 · 整合身心感知', emoji: '🌿', color: '#7A9D8C' },
                  ].map(e => (
                    <View key={e.name} className="flex-row items-center gap-2 bg-card rounded-xl px-3 py-2">
                      <View className="w-7 h-7 rounded-full items-center justify-center"
                        style={{ backgroundColor: e.color + '25' }}>
                        <Text style={{ fontSize: 14 }}>{e.emoji}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground text-xs font-semibold">{e.name}</Text>
                        <Text className="text-muted-foreground text-xs">{e.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 心灵速写：创作卡 */}
            {record.test_type === 'sketch' && (
              <View className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: '#9B8EC418' }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <Palette size={16} color="#9B8EC4" />
                  <Text className="text-foreground font-semibold text-sm">AI速写解读已完成</Text>
                </View>
                <Text className="text-muted-foreground text-xs leading-5">
                  心灵速写通过自由绘画捕捉内心意象，AI结合图像分析为你呈现深层心理洞见。
                </Text>
              </View>
            )}

            {/* 沙盘游戏室：场景卡 */}
            {record.test_type === 'sandbox' && (
              <View className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: '#7A9D8C18' }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <Box size={16} color="#7A9D8C" />
                  <Text className="text-foreground font-semibold text-sm">沙盘场景AI解读</Text>
                </View>
                {typeof rd.objectsCount === 'number' && (
                  <Text className="text-muted-foreground text-xs leading-5">
                    本次沙盘共放置 <Text className="text-foreground font-semibold">{rd.objectsCount}</Text> 件物件，
                    AI综合场景布局与物件选择进行了心理象征分析。
                  </Text>
                )}
              </View>
            )}

            {/* 梦的解析：梦境原文 */}
            {record.source === 'dream' && record.dreamContent && (
              <View className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: '#6366F118' }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <Moon size={16} color="#6366F1" />
                  <Text className="text-foreground font-semibold text-sm">
                    {record.dreamTitle ?? '梦境记录'}
                  </Text>
                </View>
                <Text className="text-muted-foreground text-xs leading-6">
                  {record.dreamContent}
                </Text>
              </View>
            )}

            {/* 画作展示：有效图片 URL → 直接展示 + 保存按钮 */}
            {hasImageUrl ? (
              <View className="mb-4">
                <View className="rounded-2xl overflow-hidden mb-2"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.1)' }] }}>
                  <Image
                    source={{ uri: imageNote as string }}
                    style={{ width: '100%', height: 200 }}
                    contentFit="contain"
                  />
                </View>
                {/* 保存到相册（仅原生端） */}
                {process.env.EXPO_OS !== 'web' && (
                  <Pressable
                    onPress={handleSaveImage}
                    disabled={saving}
                    className="flex-row items-center justify-center gap-2 rounded-xl py-2.5"
                    style={{ backgroundColor: `${cfg.color}18`, borderWidth: 1, borderColor: `${cfg.color}40` }}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color={cfg.color} />
                      : <Download size={14} color={cfg.color} />
                    }
                    <Text style={{ color: cfg.color, fontSize: 13, fontWeight: '600' }}>
                      {saving ? '保存中…' : '保存图片到相册'}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (imageNote === '(已保存)' || imageNote === '(手绘已保存)') ? (
              <View className="bg-amber-50 rounded-2xl p-3 mb-4 flex-row items-center gap-2">
                <Text className="text-lg">🎨</Text>
                <Text className="text-amber-700 text-xs flex-1">画作已提交 AI 分析</Text>
              </View>
            ) : imageNote ? (
              <View className="bg-muted rounded-2xl p-3 mb-4 flex-row items-center gap-2">
                <Text className="text-lg">🖼️</Text>
                <Text className="text-muted-foreground text-xs flex-1">{imageNote}</Text>
              </View>
            ) : null}

            {/* 解读内容 */}
            <View
              className="bg-card rounded-2xl p-4 mb-2"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
            >
              <View className="flex-row items-center gap-2 mb-3">
                <FileText size={14} color={cfg.color} />
                <Text className="text-foreground font-semibold text-sm">解读结果</Text>
              </View>
              <View>{renderMarkdown(fullText, cfg)}</View>
            </View>

            <Text className="text-muted-foreground text-xs text-center mt-2 leading-5">
              ✨ 测评解读仅供自我探索参考，不构成任何诊断结论
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────
export default function TestRecordsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ArchiveItem | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setLoading(true);
      Promise.all([
        getTestResults(session.user.id),
        getDreamRecords(session.user.id),
      ]).then(([tests, dreams]) => {
        setItems(toArchiveItems(tests, dreams));
        setLoading(false);
      }).catch(() => setLoading(false));
    }, [session]),
  );

  const groups = groupByDate(items);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* 顶栏 */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-foreground font-bold text-lg flex-1">测评档案</Text>
        {items.length > 0 && (
          <View className="bg-primary/10 rounded-full px-3 py-1">
            <Text className="text-primary text-xs font-semibold">{items.length} 条记录</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#E8A365" />
          <Text className="text-muted-foreground text-sm mt-3">加载中…</Text>
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-4">📊</Text>
          <Text className="text-foreground font-bold text-lg mb-2">暂无测评记录</Text>
          <Text className="text-muted-foreground text-sm text-center mb-6">
            完成心理测评后，你的专属档案会保存在这里
          </Text>
          <Pressable
            className="bg-primary rounded-2xl px-8 py-3.5"
            onPress={() => router.push('/(app)/(tabs)/play')}
          >
            <Text className="text-primary-foreground font-bold">前往测玩</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.date}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item: group }) => (
            <View className="mb-5">
              {/* 日期分组标题 */}
              <View className="flex-row items-center gap-2 mb-2.5 px-1">
                <Calendar size={13} color="#9CA3AF" />
                <Text className="text-muted-foreground text-xs font-medium">{group.date}</Text>
                <View className="flex-1 h-px bg-border ml-1" />
                <Text className="text-muted-foreground text-xs">{group.items.length} 条</Text>
              </View>

              {/* 记录列表 */}
              <View className="gap-2">
                {group.items.map(record => {
                  const cfg = getConfig(record.test_type);
                  const timeStr = new Date(record.created_at).toLocaleTimeString('zh-CN', {
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <Pressable
                      key={record.id}
                      onPress={() => setSelected(record)}
                      className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center active:opacity-80"
                      style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                    >
                      {/* 图标 */}
                      <View
                        className="w-11 h-11 rounded-2xl items-center justify-center mr-3 flex-shrink-0"
                        style={{ backgroundColor: `${cfg.color}18` }}
                      >
                        <Text style={{ fontSize: 20 }}>{cfg.emoji}</Text>
                      </View>

                      {/* 内容 */}
                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-foreground font-semibold text-sm">
                            {record.source === 'dream' && record.dreamTitle ? record.dreamTitle : cfg.label}
                          </Text>
                          <Text className="text-muted-foreground text-xs">{timeStr}</Text>
                        </View>
                        {record.summary && (
                          <Text
                            className="text-muted-foreground text-xs mt-1 leading-4"
                            numberOfLines={2}
                          >
                            {record.summary}
                          </Text>
                        )}
                      </View>

                      {/* 箭头 */}
                      <ChevronRight size={16} color="#D1D5DB" />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        />
      )}

      {/* 详情弹窗 */}
      <RecordDetailModal record={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
