import { useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList, KeyboardAvoidingView, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, Plus, Trash2, Brain, CheckSquare, Square, Star, BookOpen, X, Check } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { useHeron } from '@/components/heron/HeronProvider';
import {
  getHeronMemories, addHeronMemory, deleteHeronMemory,
  toggleHeronMemoryChecked, updateHeronMemoryContent,
} from '@/db/api';
import type { HeronMemory } from '@/types/types';

type Category = 'preference' | 'task' | 'summary';

const CATS: { key: Category; label: string; icon: React.ReactNode; color: string; bg: string; empty: string }[] = [
  { key: 'preference', label: '用户偏好', icon: null, color: '#7A9D8C', bg: 'rgba(122,157,140,0.08)', empty: '暂无偏好记录。和苍鹭聊聊你的习惯，他会记住～' },
  { key: 'task',       label: '重要事项', icon: null, color: '#E88D67', bg: 'rgba(232,141,103,0.08)', empty: '暂无待办事项。告诉苍鹭需要记住哪些事～' },
  { key: 'summary',    label: '历史摘要', icon: null, color: '#6B8EC4', bg: 'rgba(107,142,196,0.08)', empty: '暂无对话摘要。每次结束重要对话后，苍鹭会自动归纳～' },
];

export default function HeronMemoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { open: openHeron } = useHeron();
  const [memories, setMemories] = useState<HeronMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Category>('preference');
  // 新增弹层
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('preference');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const list = await getHeronMemories(session.user.id);
    setMemories(list);
    setLoading(false);
  }, [session?.user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!session?.user?.id || !newText.trim()) return;
    setSaving(true);
    await addHeronMemory(session.user.id, newText.trim(), newCategory);
    setNewText('');
    setShowAdd(false);
    setSaving(false);
    await load();
  };

  const remove = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await deleteHeronMemory(id);
  };

  const toggleCheck = async (item: HeronMemory) => {
    const next = !item.checked;
    setMemories((prev) => prev.map((m) => m.id === item.id ? { ...m, checked: next } : m));
    await toggleHeronMemoryChecked(item.id, next);
  };

  const catInfo = (key: Category) => CATS.find(c => c.key === key)!;
  const filtered = memories.filter(m => m.category === activeTab);
  const activeCat = catInfo(activeTab);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>

      {/* ── 顶部栏 ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: 'rgba(122,157,140,0.15)',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => { openHeron(); router.back(); }}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} color="#374151" />
          </Pressable>
          <Brain size={18} color="#7A9D8C" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>苍鹭的记忆</Text>
        </View>
        <Pressable
          onPress={() => { setNewCategory(activeTab); setShowAdd(true); }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: activeCat.color + '18', borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 6,
            borderWidth: 1, borderColor: activeCat.color + '40',
          }}
        >
          <Plus size={13} color={activeCat.color} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: activeCat.color }}>添加</Text>
        </Pressable>
      </View>

      {/* ── 副标题 ── */}
      <Text style={{ fontSize: 12, color: '#9ca3af', paddingHorizontal: 16, paddingVertical: 8, lineHeight: 18 }}>
        苍鹭记住的关于你的偏好、事项和对话摘要。随时查看或删除。
      </Text>

      {/* ── 分类 Tab ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 2 }}>
        {CATS.map((cat) => {
          const count = memories.filter(m => m.category === cat.key).length;
          const isActive = activeTab === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => setActiveTab(cat.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, height: 36, borderRadius: 18,
                backgroundColor: isActive ? cat.color : '#fff',
                borderWidth: 1.5,
                borderColor: isActive ? cat.color : 'rgba(0,0,0,0.14)',
                shadowColor: isActive ? cat.color : '#000',
                shadowOpacity: isActive ? 0.25 : 0.06,
                shadowRadius: isActive ? 8 : 3,
                shadowOffset: { width: 0, height: isActive ? 3 : 1 },
                elevation: isActive ? 4 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#fff' : '#374151' }}>
                {cat.label}
              </Text>
              {count > 0 && (
                <View style={{
                  minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
                  backgroundColor: isActive ? 'rgba(255,255,255,0.28)' : cat.bg,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? '#fff' : cat.color }}>
                    {count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── 列表 ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#7A9D8C" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <View style={{ marginTop: 60, alignItems: 'center', paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>
                {activeTab === 'preference' ? '⭐' : activeTab === 'task' ? '✅' : '📖'}
              </Text>
              <Text style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af', lineHeight: 20 }}>
                {activeCat.empty}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{
              marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              borderRadius: 16, borderWidth: 1.5,
              borderColor: item.category === 'task' && item.checked
                ? 'rgba(0,0,0,0.07)'
                : activeCat.color + '30',
              backgroundColor: item.category === 'task' && item.checked
                ? 'rgba(0,0,0,0.025)'
                : activeCat.bg,
              padding: 14,
            }}>
              {/* 左侧图标 / 复选框 */}
              {item.category === 'task' ? (
                <Pressable onPress={() => toggleCheck(item)} style={{ marginTop: 1 }}>
                  {item.checked
                    ? <CheckSquare size={18} color={activeCat.color} />
                    : <Square size={18} color={activeCat.color} />
                  }
                </Pressable>
              ) : item.category === 'summary' ? (
                <BookOpen size={15} color={activeCat.color} style={{ marginTop: 2 }} />
              ) : (
                <Star size={15} color={activeCat.color} style={{ marginTop: 2 }} />
              )}
              {/* 内容 */}
              <Text style={{
                flex: 1, fontSize: 13, lineHeight: 20, color: '#374151',
                textDecorationLine: item.category === 'task' && item.checked ? 'line-through' : 'none',
                opacity: item.category === 'task' && item.checked ? 0.5 : 1,
              }}>
                {item.content}
              </Text>
              {/* 删除 */}
              <Pressable
                onPress={() => remove(item.id)}
                style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(220,38,38,0.08)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Trash2 size={13} color="#dc2626" />
              </Pressable>
            </View>
          )}
        />
      )}

      {/* ── 新增弹层 ── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setShowAdd(false)} />
          <View style={{
            backgroundColor: '#FAFAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 20, paddingBottom: insets.bottom + 20,
          }}>
            {/* 标题 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>添加记忆</Text>
              <Pressable onPress={() => setShowAdd(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} color="#6b7280" />
              </Pressable>
            </View>
            {/* 分类选择 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', marginBottom: 8 }}>选择类型</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {CATS.map((cat) => (
                <Pressable
                  key={cat.key}
                  onPress={() => setNewCategory(cat.key)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
                    backgroundColor: newCategory === cat.key ? cat.color : 'rgba(0,0,0,0.04)',
                    borderWidth: 1.5,
                    borderColor: newCategory === cat.key ? cat.color : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: newCategory === cat.key ? '#fff' : '#6b7280' }}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* 输入框 */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', marginBottom: 8 }}>内容</Text>
            <View style={{
              borderRadius: 14, borderWidth: 1.5,
              borderColor: catInfo(newCategory).color + '50',
              backgroundColor: catInfo(newCategory).bg,
              paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
            }}>
              <TextInput
                value={newText}
                onChangeText={setNewText}
                placeholder={
                  newCategory === 'preference' ? '如：用户是中学心理老师…'
                  : newCategory === 'task' ? '如：完成本周辅导记录整理…'
                  : '如：2026-08-17 讨论了正念呼吸练习…'
                }
                placeholderTextColor="#b0b8c1"
                multiline
                style={{ fontSize: 14, lineHeight: 22, color: '#2d3748', minHeight: 56 }}
              />
            </View>
            {/* 保存按钮 */}
            <Pressable
              onPress={add}
              disabled={saving || !newText.trim()}
              style={{
                backgroundColor: catInfo(newCategory).color,
                borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                opacity: saving || !newText.trim() ? 0.5 : 1,
              }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Check size={16} color="#fff" />
              }
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>保存</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}