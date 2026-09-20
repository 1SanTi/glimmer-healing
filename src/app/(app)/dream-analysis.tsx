/**
 * dream-analysis.tsx — 梦境解析
 *
 * 基于弗洛伊德精神分析理论：
 * - 手动编辑 / PDF·Word 上传梦境内容
 * - AI 解读（调用 dream-interpret Edge Function）
 * - 时间轴归档，卡片式管理，支持再编辑与重新解读
 */

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Modal, KeyboardAvoidingView, FlatList,
} from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, Sparkles, FileText, ChevronRight, X, RefreshCw, Upload, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSession } from '@/ctx';
import { supabase } from '@/client/supabase';
import { EXPERTS } from '@/lib/constants';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

/** 从 AI 回复中过滤掉 <think>…</think> 思考链，只保留正文。
 *  若正文为空（整段都是 think 块），则把 think 块内的文字原样返回，
 *  保证旧数据（MiniMax 全包裹格式）也能正常显示。 */
function stripThinkTags(text: string): string {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (stripped.length > 0) return stripped;
  // 回退：提取 <think> 内部文本
  const inner = text.replace(/<\/?think>/gi, '').trim();
  return inner;
}

// ── 类型 ─────────────────────────────────────────────────────────
interface DreamRecord {
  id: string;
  user_id: string;
  title: string;
  content: string;
  ai_analysis: string | null;
  created_at: string;
  updated_at: string;
}

// ── 辅助：日期格式 ─────────────────────────────────────────────
function formatDate(iso: string) {
  const d = new Date(iso);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}/${M}/${D}`;
}

function todayLabel(iso: string) {
  const today = new Date();
  const d = new Date(iso);
  if (d.toDateString() === today.toDateString()) return '今天';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return formatDate(iso);
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function DreamAnalysisScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { returnExpertId } = useLocalSearchParams<{ returnExpertId?: string }>();

  const [records, setRecords] = useState<DreamRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // 折叠状态
  const [freudExpanded, setFreudExpanded] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(true); // 默认展开，直接显示完整解读
  // 专家选择弹窗
  const [showExpertPicker, setShowExpertPicker] = useState(false);

  // 编辑/新建弹窗
  const [showEditor, setShowEditor] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DreamRecord | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 详情弹窗
  const [detailRecord, setDetailRecord] = useState<DreamRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // ── 加载记录 ──────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('dream_records')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setRecords(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [session]);

  useFocusEffect(useCallback(() => { loadRecords(); }, [loadRecords]));

  // ── 打开新建弹窗 ──────────────────────────────────────────────
  const openNew = () => {
    setEditingRecord(null);
    setEditorTitle('');
    setEditorContent('');
    setShowEditor(true);
  };

  // ── 打开编辑弹窗 ──────────────────────────────────────────────
  const openEdit = (rec: DreamRecord) => {
    setShowDetail(false);
    setEditingRecord(rec);
    setEditorTitle(rec.title);
    setEditorContent(rec.content);
    setShowEditor(true);
  };

  // ── 保存记录（不含AI解读） ────────────────────────────────────
  const saveRecord = async (): Promise<DreamRecord | null> => {
    if (!session || !editorContent.trim()) return null;
    setSaving(true);
    const title = editorTitle.trim() || `梦境 ${formatDate(new Date().toISOString())}`;
    let saved: DreamRecord | null = null;
    if (editingRecord) {
      const { data } = await supabase
        .from('dream_records')
        .update({ title, content: editorContent.trim(), updated_at: new Date().toISOString() })
        .eq('id', editingRecord.id)
        .select()
        .single();
      saved = data;
    } else {
      const { data } = await supabase
        .from('dream_records')
        .insert({ user_id: session.user.id, title, content: editorContent.trim() })
        .select()
        .single();
      saved = data;
    }
    setSaving(false);
    if (saved) {
      setEditingRecord(saved);
      await loadRecords();
    }
    return saved;
  };

  // ── AI 解读 ────────────────────────────────────────────────────
  const runAnalysis = async (rec?: DreamRecord) => {
    const target = rec ?? editingRecord;
    const content = rec ? rec.content : editorContent.trim();
    if (!content) return;
    setAnalyzing(true);
    try {
      // 校验并扣减每日 AI 积分（每次解析消耗 5 点积分）
      const quota = await checkAndConsumeCredits(5);
      if (!quota.allowed) {
        showToast(quota.message || '今日 AI 积分不足（单次解析消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
        setAnalyzing(false);
        return;
      }

      // 如果是来自编辑器，先保存
      let savedRec = target;
      if (!rec) {
        savedRec = await saveRecord();
        if (!savedRec) { setAnalyzing(false); return; }
      }
      const { data, error } = await supabase.functions.invoke('dream-interpret', {
        body: { dream_content: content },
      });
      if (error) throw new Error(error.message ?? 'Edge Function 调用失败');
      if (!data?.analysis) throw new Error('AI返回内容为空，请重试');

      // 写入数据库
      const { error: updateErr } = await supabase
        .from('dream_records')
        .update({ ai_analysis: data.analysis, updated_at: new Date().toISOString() })
        .eq('id', savedRec!.id);
      if (updateErr) throw new Error('保存解读失败：' + updateErr.message);

      // 刷新列表和详情
      await loadRecords();
      const fresh = (await supabase.from('dream_records').select('*').eq('id', savedRec!.id).single()).data;
      if (fresh) {
        setDetailRecord(fresh);
        if (!rec) setEditingRecord(fresh);
      }
      setAnalysisExpanded(true);
      showToast('AI解读已生成并保存 ✓');
    } catch (e: unknown) {
      showToast('AI解读失败：' + (e instanceof Error ? e.message : '请稍后重试'));
    }
    setAnalyzing(false);
  };

  // ── 文档上传提取文本（暂时使用文件名提示，实际项目可接服务器解析） ──
  const pickDocument = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) { setUploading(false); return; }
      const file = result.assets[0];
      // 将文件名填入标题，提示用户将内容手动粘贴或提示已上传
      setEditorTitle(file.name.replace(/\.(pdf|docx?|txt)$/i, ''));
      setEditorContent(prev =>
        prev
          ? prev
          : `[已上传文件：${file.name}]\n\n请在此补充或粘贴梦境文字内容，AI将基于此内容进行解读。`,
      );
      showToast('文件已选择，请确认内容后进行AI解读');
    } catch {
      showToast('文件选择失败');
    }
    setUploading(false);
  };

  // ── 删除记录 ──────────────────────────────────────────────────
  const deleteRecord = async (id: string) => {
    await supabase.from('dream_records').delete().eq('id', id);
    setShowDetail(false);
    setDetailRecord(null);
    await loadRecords();
    showToast('已删除');
  };

  // ── 打开详情 ──────────────────────────────────────────────────
  const openDetail = (rec: DreamRecord) => {
    setDetailRecord(rec);
    setShowDetail(true);
  };

  // ── 按日期分组 ────────────────────────────────────────────────
  const grouped: { dateKey: string; items: DreamRecord[] }[] = [];
  records.forEach(r => {
    const key = new Date(r.created_at).toDateString();
    const last = grouped[grouped.length - 1];
    if (last && new Date(last.items[0].created_at).toDateString() === key) {
      last.items.push(r);
    } else {
      grouped.push({ dateKey: key, items: [r] });
    }
  });

  // ── 渲染记录卡片 ──────────────────────────────────────────────
  const renderCard = (rec: DreamRecord) => (
    <Pressable
      key={rec.id}
      onPress={() => openDetail(rec)}
      style={{
        backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12,
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#EEF0FB', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: 20 }}>🌙</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 3 }} numberOfLines={1}>{rec.title}</Text>
          <Text style={{ fontSize: 12, color: '#6B7280', lineHeight: 18 }} numberOfLines={2}>{rec.content}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{todayLabel(rec.created_at)}</Text>
            {rec.ai_analysis ? (
              <View style={{ backgroundColor: '#EEF0FB', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: '#6B7EC8', fontWeight: '600' }}>✨ 已解读</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: '#9CA3AF' }}>待解读</Text>
              </View>
            )}
          </View>
        </View>
        <ChevronRight size={16} color="#D1D5DB" />
      </View>
    </Pressable>
  );

  // ── 主界面 ────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7FA' }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* 导航栏 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.08)' }] }}>
            <ArrowLeft size={18} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>梦境解析 🌙</Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>精神分析 · 潜意识探索</Text>
          </View>
          <Pressable onPress={openNew} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#6B7EC8', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* 顶部说明横幅 — 弗洛伊德理论扩展（可折叠） */}
        <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: '#EEF0FB', borderRadius: 20, padding: 16 }}>
          <Pressable onPress={() => setFreudExpanded(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 20 }}>🧠</Text>
            <Text style={{ flex: 1, fontSize: 14, color: '#4B56A0', fontWeight: '800' }}>弗洛伊德精神分析</Text>
            {freudExpanded
              ? <ChevronUp size={16} color="#6B7EC8" />
              : <ChevronDown size={16} color="#6B7EC8" />}
          </Pressable>
          {/* 摘要（始终可见） */}
          <Text style={{ fontSize: 12, color: '#6B7280', lineHeight: 19, marginTop: 8 }}>
            弗洛伊德认为梦是「通往潜意识的皇家大道」——压抑的欲望以凝缩、置换、象征化、二次加工四种机制伪装呈现。
          </Text>
          {/* 详细内容（展开后显示） */}
          {freudExpanded && (
            <View style={{ gap: 10, marginTop: 12 }}>
              {[
                { icon: '🌙', title: '凝缩（Verdichtung）', desc: '多个潜意识思想压缩为单一意象，梦中某一元素往往叠加了多重含义与多段记忆片段。' },
                { icon: '🔀', title: '置换（Verschiebung）', desc: '情感能量从真实对象转移到替代物，使强烈的冲突以无关紧要的形象出现，降低审查阻力。' },
                { icon: '🔮', title: '象征化（Symbolisierung）', desc: '潜意识用象征物替代难以直接呈现的内容，如房屋常象征身体、水象征诞生或生命力量。' },
                { icon: '✏️', title: '二次加工（Sekundäre Bearbeitung）', desc: '意识对梦进行事后整合与合理化，赋予梦一个"讲得通"的叙事，遮盖真正的隐梦内容。' },
              ].map(item => (
                <View key={item.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#C7CDEF', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Text style={{ fontSize: 11 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: '#4B56A0', fontWeight: '700' }}>{item.title}</Text>
                    <Text style={{ fontSize: 11, color: '#6B7280', lineHeight: 17, marginTop: 2 }}>{item.desc}</Text>
                  </View>
                </View>
              ))}
              <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: '#D5D9F0', paddingTop: 8 }}>
                <Text style={{ fontSize: 11, color: '#8B90C4', lineHeight: 17 }}>
                  显梦（梦的表面内容）是隐梦（潜意识愿望）经过"梦的工作"的伪装产物。AI 将帮你还原这层遮蔽。
                </Text>
              </View>
            </View>
          )}
          {!freudExpanded && (
            <Pressable onPress={() => setFreudExpanded(true)} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 11, color: '#6B7EC8', fontWeight: '600' }}>查看四种梦的机制 ›</Text>
            </Pressable>
          )}
        </View>

        {/* 记录列表 */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#6B7EC8" />
          </View>
        ) : records.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>🌙</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 6 }}>还没有梦境记录</Text>
            <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 }}>点击右上角 + 记录你的第一个梦境{'\n'}让AI为你揭开潜意识的秘密</Text>
            <Pressable onPress={openNew} style={{ marginTop: 24, backgroundColor: '#6B7EC8', borderRadius: 20, paddingHorizontal: 28, paddingVertical: 12 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>记录梦境</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={grouped}
            keyExtractor={g => g.dateKey}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
            renderItem={({ item: group }) => (
              <View key={group.dateKey}>
                <Text style={{ fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 8, marginTop: 4 }}>
                  {todayLabel(group.items[0].created_at)}
                </Text>
                {group.items.map(renderCard)}
              </View>
            )}
          />
        )}
      </SafeAreaView>

      {/* ── 编辑器弹窗 ── */}
      <Modal visible={showEditor} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior="padding">
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36, maxHeight: '90%' }}>
            {/* 弹窗头 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: '#1F2937' }}>
                {editingRecord ? '编辑梦境' : '记录新梦境'} 🌙
              </Text>
              <Pressable onPress={() => setShowEditor(false)}>
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 标题 */}
              <TextInput
                value={editorTitle}
                onChangeText={setEditorTitle}
                placeholder="梦境标题（可选）"
                placeholderTextColor="#C4C9D4"
                style={{ backgroundColor: '#F8F9FA', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1F2937', marginBottom: 10, borderWidth: 1.5, borderColor: '#EFEFEF' }}
              />

              {/* 内容 */}
              <TextInput
                value={editorContent}
                onChangeText={setEditorContent}
                placeholder="详细描述你的梦境……包括人物、场景、情绪、事件，越详细越好"
                placeholderTextColor="#C4C9D4"
                multiline
                textAlignVertical="top"
                style={{ backgroundColor: '#F8F9FA', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: '#374151', minHeight: 140, lineHeight: 21, borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 12 }}
              />

              {/* 上传文档按钮 */}
              <Pressable onPress={pickDocument} disabled={uploading}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0F2FF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 }}>
                {uploading ? <ActivityIndicator size="small" color="#6B7EC8" /> : <Upload size={16} color="#6B7EC8" />}
                <Text style={{ fontSize: 13, color: '#6B7EC8', fontWeight: '600' }}>上传 Word / PDF 梦境文档</Text>
              </Pressable>

              {/* 操作按钮 */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={saveRecord} disabled={saving || !editorContent.trim()}
                  style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 16, paddingVertical: 13, alignItems: 'center', opacity: !editorContent.trim() ? 0.5 : 1 }}>
                  {saving ? <ActivityIndicator size="small" color="#374151" /> : <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>仅保存</Text>}
                </Pressable>
                <Pressable onPress={() => runAnalysis()} disabled={analyzing || !editorContent.trim()}
                  style={{ flex: 2, backgroundColor: '#6B7EC8', borderRadius: 16, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: !editorContent.trim() ? 0.5 : 1 }}>
                  {analyzing
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <><Sparkles size={15} color="#FFFFFF" /><Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>AI 解读</Text></>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 详情弹窗 ── */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' }}>
            {/* 详情头 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: '#1F2937' }} numberOfLines={1}>{detailRecord?.title}</Text>
              <Pressable onPress={() => openEdit(detailRecord!)} style={{ marginRight: 12 }}>
                <FileText size={18} color="#6B7EC8" />
              </Pressable>
              <Pressable onPress={() => setShowDetail(false)}>
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 14, marginBottom: 8 }}>{detailRecord && formatDate(detailRecord.created_at)}</Text>

              {/* 梦境原文 */}
              <View style={{ backgroundColor: '#F8F9FA', borderRadius: 16, padding: 14, marginBottom: 14 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 6 }}>📝 梦境原文</Text>
                <Text style={{ fontSize: 13, color: '#374151', lineHeight: 22 }}>{detailRecord?.content}</Text>
              </View>

              {/* AI 解读 */}
              {detailRecord?.ai_analysis ? (
                <View style={{ backgroundColor: '#EEF0FB', borderRadius: 16, padding: 14, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: '#4B56A0', fontWeight: '700' }}>✨ AI 精神分析解读</Text>
                    <Pressable onPress={() => runAnalysis(detailRecord!)} disabled={analyzing}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {analyzing
                        ? <ActivityIndicator size="small" color="#6B7EC8" />
                        : <><RefreshCw size={12} color="#6B7EC8" /><Text style={{ fontSize: 11, color: '#6B7EC8' }}>重新解读</Text></>}
                    </Pressable>
                  </View>
                  {/* 过滤 <think> 标签，只展示正文 */}
                  <Text style={{ fontSize: 13, color: '#374151', lineHeight: 22 }} numberOfLines={analysisExpanded ? undefined : 5}>
                    {stripThinkTags(detailRecord.ai_analysis)}
                  </Text>
                  <Pressable onPress={() => setAnalysisExpanded(v => !v)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}>
                    <Text style={{ fontSize: 12, color: '#6B7EC8', fontWeight: '600' }}>
                      {analysisExpanded ? '收起解析' : '查看完整解析'}
                    </Text>
                    {analysisExpanded ? <ChevronUp size={13} color="#6B7EC8" /> : <ChevronDown size={13} color="#6B7EC8" />}
                  </Pressable>
                  {/* 解析后推荐咨询专家 */}
                  <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#D5D9F0', paddingTop: 12 }}>
                    {returnExpertId ? (
                      /* 从咨询师推荐跳来：直接返回该咨询师 */
                      <Pressable
                        onPress={() => {
                          if (!detailRecord) return;
                          const dreamCtx = encodeURIComponent(JSON.stringify({
                            dreamTitle:   detailRecord.title || '梦境记录',
                            dreamContent: detailRecord.content,
                            aiAnalysis:   detailRecord.ai_analysis
                              ? stripThinkTags(detailRecord.ai_analysis)
                              : '（暂无AI解读）',
                          }));
                          setShowDetail(false);
                          setTimeout(() => {
                            router.replace(`/(app)/chat/${returnExpertId}?dreamContext=${dreamCtx}` as RelativePathString);
                          }, 120);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6B7EC8', borderRadius: 14, paddingVertical: 11 }}
                      >
                        <MessageCircle size={15} color="#FFFFFF" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>返回咨询师 · 深入探讨梦境 💬</Text>
                      </Pressable>
                    ) : (
                      /* 独立使用：选择咨询师 */
                      <>
                        <Text style={{ fontSize: 12, color: '#4B56A0', fontWeight: '700', marginBottom: 6 }}>💆 想深入探索？与AI专家对话</Text>
                        <Text style={{ fontSize: 11, color: '#6B7280', lineHeight: 17, marginBottom: 10 }}>
                          选择一位咨询师，TA将读取你的梦境原文与AI解读，帮你从不同视角深入探索。
                        </Text>
                        <Pressable onPress={() => setShowExpertPicker(true)}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6B7EC8', borderRadius: 14, paddingVertical: 11 }}>
                          <MessageCircle size={15} color="#FFFFFF" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>选择咨询师开始对话</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => runAnalysis(detailRecord!)} disabled={analyzing}
                  style={{ backgroundColor: '#6B7EC8', borderRadius: 16, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                  {analyzing
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <><Sparkles size={16} color="#FFFFFF" /><Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>开始 AI 解读</Text></>}
                </Pressable>
              )}

              {/* 删除 */}
              <Pressable onPress={() => detailRecord && deleteRecord(detailRecord.id)}
                style={{ backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 12, alignItems: 'center', marginBottom: 32 }}>
                <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>删除此记录</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 专家选择弹窗 ── */}
      <Modal visible={showExpertPicker} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: '#1F2937' }}>选择咨询师 💬</Text>
              <Pressable onPress={() => setShowExpertPicker(false)}>
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 18 }}>
              咨询师将读取你的梦境原文与AI解读，以其流派视角与你深度对话。
            </Text>
            {EXPERTS.slice(0, 6).sort((a, b) => {
              // 梦境解析：优先推荐弗洛伊德和荣格（心理动力学流派）
              const dreamPriority = ['freud', 'jung'];
              const ai = dreamPriority.indexOf(a.id);
              const bi = dreamPriority.indexOf(b.id);
              if (ai !== -1 && bi === -1) return -1;
              if (bi !== -1 && ai === -1) return 1;
              return 0;
            }).map(expert => (
              <Pressable key={expert.id}
                onPress={() => {
                  if (!detailRecord) return;
                  const dreamContext = encodeURIComponent(JSON.stringify({
                    dreamTitle:   detailRecord.title || '梦境记录',
                    dreamContent: detailRecord.content,
                    aiAnalysis:   detailRecord.ai_analysis
                      ? stripThinkTags(detailRecord.ai_analysis)
                      : '（暂无AI解读）',
                  }));
                  setShowExpertPicker(false);
                  setShowDetail(false);
                  setTimeout(() => {
                    router.push(`/(app)/chat/${expert.id}?dreamContext=${dreamContext}` as RelativePathString);
                  }, 120);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8F9FA', borderRadius: 16, padding: 12, marginBottom: 8 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: expert.color + '28', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{expert.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F2937' }}>{expert.name}</Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{expert.school} · {expert.style}</Text>
                </View>
                <View style={{ backgroundColor: expert.color + '22', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 12, color: expert.color, fontWeight: '700' }}>开始</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {toast && (
        <View style={{ position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: 'rgba(31,41,55,0.88)', borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
