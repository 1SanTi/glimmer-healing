/**
 * 愈心手记 — 笔记列表页
 * v118：点击文件夹进入内页 + 整体收纳折叠 + 删除确认
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator,
  FlatList, LayoutAnimation, UIManager, Platform, ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Plus, Search, FolderOpen, X, BookHeart, SlidersHorizontal,
  Check, FolderPlus, ChevronDown, ChevronRight, MoreHorizontal, Pencil,
  Trash2, ChevronUp, FolderClosed,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/ctx';
import {
  getNotes, getNoteStats, getNoteFolders,
  deleteNote, createNoteFolder, updateNoteFolder, deleteNoteFolder, searchNotes,
} from '@/db/api';
import type { Note, NoteFolder } from '@/types/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FOLDER_COLORS = ['#F9C784', '#B8E4C9', '#B8D4E8', '#E8B4C8', '#D4B8E8', '#F4D4A8'];
const STORAGE_KEY_COLLAPSE = 'notes_collapse_state_v1';

// ── 工具函数：平铺列表构建树形 ─────────────────────────────────────
function buildFolderTree(flat: NoteFolder[]): NoteFolder[] {
  const map: Record<string, NoteFolder> = {};
  flat.forEach(f => { map[f.id] = { ...f, children: [] }; });
  const roots: NoteFolder[] = [];
  flat.forEach(f => {
    if (f.parent_id && map[f.parent_id]) map[f.parent_id].children!.push(map[f.id]);
    else roots.push(map[f.id]);
  });
  return roots;
}

// ── 展开箭头动画 ─────────────────────────────────────────────────
function CollapseArrow({ collapsed }: { collapsed: boolean }) {
  const r = useSharedValue(collapsed ? 0 : 1);
  useEffect(() => { r.value = withTiming(collapsed ? 0 : 1, { duration: 220 }); }, [collapsed, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 180}deg` }] }));
  return <Animated.View style={style}><ChevronDown size={14} color="#A09888" /></Animated.View>;
}

// ── 文件夹行卡片（扁平，点击进入内页） ────────────────────────────
function FolderRowCard({
  folder, onPress, onMenu,
}: { folder: NoteFolder; onPress: () => void; onMenu: () => void }) {
  const accent = folder.color ?? '#F9C784';
  const hasChildren = (folder.children ?? []).length > 0;
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#EDE8DF', marginBottom: 8, flexDirection: 'row',
        alignItems: 'center', paddingRight: 12,
        boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }],
      }}>
      <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: accent }} />
      <View style={{
        width: 40, height: 40, borderRadius: 12, margin: 12,
        backgroundColor: accent + '25', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <FolderClosed size={18} color={accent} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E1A14' }} numberOfLines={1}>{folder.name}</Text>
        <Text style={{ fontSize: 11, color: '#A09888', marginTop: 2 }}>
          {folder.note_count || 0} 篇笔记{hasChildren ? `  ·  ${folder.children!.length} 个子文件夹` : ''}
        </Text>
      </View>
      <Pressable onPress={onMenu} style={{ padding: 8 }} hitSlop={8}>
        <MoreHorizontal size={15} color="#C8BEA8" />
      </Pressable>
      <ChevronRight size={14} color="#D8D0C8" />
    </Pressable>
  );
}

// ── 笔记卡片 ────────────────────────────────────────────────────
function NoteCard({
  note, folders, onPress, onDelete,
}: { note: Note; folders: NoteFolder[]; onPress: () => void; onDelete: () => void }) {
  const folderMap: Record<string, NoteFolder> = {};
  const walk = (list: NoteFolder[]) => list.forEach(f => { folderMap[f.id] = f; walk(f.children ?? []); });
  walk(folders);
  const folder = note.folder_id ? folderMap[note.folder_id] : null;
  const dateStr = new Date(note.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: '#EDE8DF',
        boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: 'rgba(0,0,0,0.07)' }],
      }}>
      <View style={{ height: 3, backgroundColor: folder?.color ?? '#F0EBE0' }} />
      <View style={{ padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 13, flexShrink: 0,
          backgroundColor: folder ? folder.color + '30' : '#F3EFE7',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <BookHeart size={18} color={folder?.color ?? '#8A7060'} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E1A14', lineHeight: 20 }} numberOfLines={1}>
            {note.title}
          </Text>
          {note.plain_text?.length > 0 && (
            <Text style={{ fontSize: 12, color: '#7A7060', marginTop: 3, lineHeight: 18 }} numberOfLines={2}>
              {note.plain_text.slice(0, 80)}
            </Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {folder && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: folder.color + '30', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
              }}>
                <FolderOpen size={9} color={folder.color} />
                <Text style={{ fontSize: 10, color: folder.color, fontWeight: '600' }}>{folder.name}</Text>
              </View>
            )}
            <Text style={{ fontSize: 10, color: '#C8BEB0' }}>{dateStr}</Text>
          </View>
        </View>
        <Pressable onPress={onDelete} hitSlop={8} style={{ paddingTop: 2 }}>
          <Trash2 size={14} color="#E05252" />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── 新建/重命名文件夹弹窗 ────────────────────────────────────────
interface FolderModalProps {
  mode: 'create' | 'rename'; visible: boolean; initialName?: string; initialColor?: string;
  loading: boolean; error: string;
  onChangeName: (v: string) => void; onChangeColor: (c: string) => void;
  onConfirm: () => void; onCancel: () => void;
}
function FolderModal({ mode, visible, initialName = '', initialColor = FOLDER_COLORS[0], loading, error, onChangeName, onChangeColor, onConfirm, onCancel }: FolderModalProps) {
  if (!visible) return null;
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 200 }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onCancel} />
      <View style={{ backgroundColor: '#FDFAF4', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 44, gap: 14 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8C8A8', alignSelf: 'center', marginBottom: 2 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E1A14', textAlign: 'center' }}>
          {mode === 'create' ? '新建文件夹' : '重命名文件夹'}
        </Text>
        <TextInput
          defaultValue={initialName} onChangeText={onChangeName} placeholder="文件夹名称…"
          placeholderTextColor="#C8BEB0" autoFocus returnKeyType="done" onSubmitEditing={onConfirm}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1.5, borderColor: error ? '#E05252' : '#EDE8DF', fontSize: 14, color: '#1E1A14' }}
        />
        {error.length > 0 && <Text style={{ fontSize: 12, color: '#E05252', marginTop: -8 }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
          {FOLDER_COLORS.map(c => (
            <Pressable key={c} onPress={() => onChangeColor(c)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c, borderWidth: initialColor === c ? 3 : 1.5, borderColor: initialColor === c ? '#3C3228' : 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              {initialColor === c && <Check size={14} color="#3C3228" strokeWidth={3} />}
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: '#F0EBE0', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#8A8078' }}>取消</Text>
          </Pressable>
          <Pressable onPress={onConfirm} disabled={loading} style={{ flex: 2, backgroundColor: '#F0AA50', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: loading ? 0.6 : 1 }}>
            {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{mode === 'create' ? '创建' : '保存'}</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── 删除确认弹窗 ────────────────────────────────────────────────
function DeleteConfirmModal({ visible, title, message, onConfirm, onCancel, loading }: {
  visible: boolean; title: string; message: string;
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 300, backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 }}>
      <View style={{ backgroundColor: '#FDFAF4', borderRadius: 22, padding: 24, width: '100%', gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E1A14', textAlign: 'center' }}>{title}</Text>
        <Text style={{ fontSize: 13, color: '#6A6258', textAlign: 'center', lineHeight: 20 }}>{message}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: '#F0EBE0', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#8A8078' }}>取消</Text>
          </Pressable>
          <Pressable onPress={onConfirm} disabled={loading} style={{ flex: 1, backgroundColor: '#E05252', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: loading ? 0.6 : 1 }}>
            {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>确认删除</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// 主页面
// ══════════════════════════════════════════════════════════════════
export default function NotesIndexScreen() {
  const { session } = useSession();
  const router = useRouter();

  const [flatFolders, setFlatFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0 });
  const [loading, setLoading] = useState(true);

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Note[]>([]);

  // 筛选
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // 整体折叠状态
  const [foldersCollapsed, setFoldersCollapsed] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(false);

  // 文件夹菜单
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  // 新建文件夹
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderCreateError, setFolderCreateError] = useState('');

  // 重命名文件夹
  const [renamingFolder, setRenamingFolder] = useState<NoteFolder | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameColor, setRenameColor] = useState(FOLDER_COLORS[0]);
  const [renamingLoading, setRenamingLoading] = useState(false);
  const [renameError, setRenameError] = useState('');

  // 删除确认
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [deletingFolderLoading, setDeletingFolderLoading] = useState(false);

  const folderTree = flatFolders.reduce<NoteFolder[]>((acc, f) => {
    if (!f.parent_id) acc.push({ ...f, children: flatFolders.filter(c => c.parent_id === f.id) });
    return acc;
  }, []);

  // 持久化折叠状态
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_COLLAPSE).then(raw => {
      if (!raw) return;
      try { const v = JSON.parse(raw); setFoldersCollapsed(!!v.folders); setNotesCollapsed(!!v.notes); } catch { /* ignore */ }
    });
  }, []);
  const persistCollapse = (folders: boolean, notes: boolean) => {
    AsyncStorage.setItem(STORAGE_KEY_COLLAPSE, JSON.stringify({ folders, notes }));
  };
  const toggleFoldersCollapse = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !foldersCollapsed;
    setFoldersCollapsed(next);
    persistCollapse(next, notesCollapsed);
  };
  const toggleNotesCollapse = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !notesCollapsed;
    setNotesCollapsed(next);
    persistCollapse(foldersCollapsed, next);
  };

  useFocusEffect(useCallback(() => {
    if (!session?.user.id) return;
    const uid = session.user.id;
    (async () => {
      setLoading(true);
      const [notesData, foldersData, statsData] = await Promise.all([
        getNotes(uid, selectedFolderId, 50),
        getNoteFolders(uid),
        getNoteStats(uid),
      ]);
      setNotes(notesData); setFlatFolders(foldersData); setStats(statsData);
      setLoading(false);
    })();
  }, [session, selectedFolderId]));

  // 搜索防抖
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      if (!session?.user.id) return;
      const r = await searchNotes(session.user.id, q);
      setSearchResults(r); setSearching(false);
    }, 400);
  };

  // 新建文件夹
  const handleCreateFolder = async () => {
    if (!session) return;
    if (!newFolderName.trim()) { setFolderCreateError('请输入文件夹名称'); return; }
    setFolderCreateError(''); setCreatingFolder(true);
    try {
      const result = await createNoteFolder(session.user.id, newFolderName.trim(), newFolderColor);
      if (!result) throw new Error('创建失败，请重试');
      const updated = await getNoteFolders(session.user.id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFlatFolders(updated); setShowFolderModal(false);
    } catch (err) { setFolderCreateError(err instanceof Error ? err.message : '创建失败，请重试'); }
    finally { setCreatingFolder(false); }
  };

  // 重命名文件夹
  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameText.trim()) return;
    setRenameError(''); setRenamingLoading(true);
    try {
      await updateNoteFolder(renamingFolder.id, renameText.trim(), renameColor);
      const updated = await getNoteFolders(session!.user.id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFlatFolders(updated); setRenamingFolder(null);
    } catch { setRenameError('保存失败，请重试'); }
    finally { setRenamingLoading(false); }
  };

  // 删除文件夹（含确认）
  const handleDeleteFolder = async () => {
    if (!deletingFolderId || !session) return;
    setDeletingFolderLoading(true);
    try {
      await deleteNoteFolder(deletingFolderId);
      const [updated, updatedNotes] = await Promise.all([
        getNoteFolders(session.user.id),
        getNotes(session.user.id, selectedFolderId, 50),
      ]);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFlatFolders(updated); setNotes(updatedNotes); setDeletingFolderId(null);
    } catch { /* ignore */ }
    finally { setDeletingFolderLoading(false); }
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    setStats(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
  };

  const openEditor = (noteId?: string, folderId?: string | null) => {
    const params = noteId ? `?noteId=${noteId}` : folderId ? `?folderId=${folderId}` : selectedFolderId ? `?folderId=${selectedFolderId}` : '';
    router.push(('/(app)/notes/note-editor' + params) as RelativePathString);
  };

  const openFolder = (folderId: string) => {
    router.push((`/(app)/notes/folder/${folderId}`) as RelativePathString);
  };

  const isFiltered = selectedFolderId !== undefined;
  const filterLabel = selectedFolderId === undefined ? '全部' : selectedFolderId === null ? '未分类' : (flatFolders.find(f => f.id === selectedFolderId)?.name ?? '文件夹');
  const displayNotes = searchQuery.trim() ? searchResults : notes;
  const menuFolder = folderTree.find(f => f.id === folderMenuId);

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F0E8' }}>
      <StatusBar style="dark" />

      {/* 关闭菜单全局遮罩 */}
      {folderMenuId && (
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }} onPress={() => setFolderMenuId(null)} />
      )}

      {/* 顶部导航栏 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#FDFAF4', borderBottomWidth: 1, borderBottomColor: '#E8DFCC' }}>
        <Pressable onPress={() => router.back()} style={{ padding: 6 }}>
          <ArrowLeft size={22} color="#3C3228" />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: '#3C3228' }}>📝 愈心手记</Text>
        <Pressable onPress={() => openEditor()} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0AA50', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}>
          <Plus size={14} color="#FFFFFF" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>新建</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#F0AA50" />
        </View>
      ) : (
        <FlatList
          data={displayNotes}
          keyExtractor={item => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* 统计卡片 */}
              <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDE8DF', overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row' }}>
                  {[{ value: stats.total, label: '全部笔记', color: '#E8A040' }, { value: stats.thisWeek, label: '本周新增', color: '#5A9D7A' }, { value: flatFolders.filter(f => !f.parent_id).length, label: '文件夹', color: '#7A6EC4' }].map((item, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 16, borderRightWidth: i < 2 ? 1 : 0, borderRightColor: '#EDE8DF' }}>
                      <Text style={{ fontSize: 26, fontWeight: '800', color: item.color }}>{item.value}</Text>
                      <Text style={{ fontSize: 10, color: '#A09888', marginTop: 2 }}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* 搜索框 + 筛选 */}
              <View style={{ marginHorizontal: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: '#EDE8DF' }}>
                  {searching ? <ActivityIndicator size="small" color="#F0AA50" /> : <Search size={14} color="#B8A888" />}
                  <TextInput value={searchQuery} onChangeText={handleSearch} placeholder="搜索笔记标题或内容…" placeholderTextColor="#C8BEB0" style={{ flex: 1, fontSize: 13, color: '#2C2C2C' }} />
                  {searchQuery.length > 0 && <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }}><X size={13} color="#B8A888" /></Pressable>}
                </View>
                <Pressable onPress={() => setShowFilterPanel(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: isFiltered ? '#F0AA50' : '#D8C8A8', backgroundColor: isFiltered ? '#FFF4E0' : '#FFFFFF' }}>
                  <SlidersHorizontal size={15} color={isFiltered ? '#F0AA50' : '#8A8078'} />
                  {isFiltered && <Text style={{ fontSize: 11, fontWeight: '700', color: '#F0AA50', maxWidth: 56 }} numberOfLines={1}>{filterLabel}</Text>}
                </Pressable>
              </View>

              {/* 文件夹区域 */}
              {selectedFolderId === undefined && !searchQuery.trim() && (
                <View style={{ marginBottom: 8 }}>
                  {/* 折叠标题行 */}
                  <Pressable onPress={toggleFoldersCollapse} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: foldersCollapsed ? 6 : 12, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 1 }}>文件夹</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {!foldersCollapsed && (
                        <Pressable onPress={() => { setNewFolderName(''); setNewFolderColor(FOLDER_COLORS[0]); setFolderCreateError(''); setShowFolderModal(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <FolderPlus size={13} color="#F0AA50" />
                          <Text style={{ fontSize: 11, color: '#F0AA50', fontWeight: '600' }}>新建</Text>
                        </Pressable>
                      )}
                      <CollapseArrow collapsed={foldersCollapsed} />
                    </View>
                  </Pressable>
                  {!foldersCollapsed && (
                    <View style={{ paddingHorizontal: 16 }}>
                      {folderTree.length === 0 ? (
                        <Pressable onPress={() => { setNewFolderName(''); setNewFolderColor(FOLDER_COLORS[0]); setFolderCreateError(''); setShowFolderModal(true); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#E8D8B8', borderStyle: 'dashed', backgroundColor: '#FDFAF4', marginBottom: 8 }}>
                          <FolderPlus size={16} color="#C8A878" />
                          <Text style={{ fontSize: 13, color: '#C8A878', fontWeight: '600' }}>新建文件夹，整理你的笔记</Text>
                        </Pressable>
                      ) : (
                        folderTree.map(f => (
                          <FolderRowCard
                            key={f.id} folder={f}
                            onPress={() => openFolder(f.id)}
                            onMenu={() => { setFolderMenuId(f.id); }}
                          />
                        ))
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* 所有笔记标题行 */}
              {!searchQuery.trim() && (
                <Pressable onPress={toggleNotesCollapse} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: notesCollapsed ? 6 : 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 1 }}>
                    {selectedFolderId === undefined ? '所有笔记' : selectedFolderId === null ? '未分类笔记' : `「${filterLabel}」中的笔记`}
                  </Text>
                  <CollapseArrow collapsed={notesCollapsed} />
                </Pressable>
              )}
              {notesCollapsed && !searchQuery.trim() && <View />}
            </View>
          }
          ListEmptyComponent={
            !notesCollapsed ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 32, paddingBottom: 60 }}>
                <Text style={{ fontSize: 48 }}>📝</Text>
                <Text style={{ fontSize: 14, color: '#A09888', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 }}>
                  {searchQuery.trim() ? `未找到与「${searchQuery}」相关的笔记` : '还没有笔记\n点击右上角「新建」开始书写吧'}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            notesCollapsed ? null : (
              <View style={{ marginHorizontal: 16, marginBottom: 10 }}>
                <NoteCard note={item} folders={folderTree} onPress={() => openEditor(item.id)} onDelete={() => handleDeleteNote(item.id)} />
              </View>
            )
          }
        />
      )}

      {/* 文件夹操作菜单 */}
      {folderMenuId && menuFolder && (
        <View style={{ position: 'absolute', right: 16, top: 200, zIndex: 99, backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#EDE8DF', minWidth: 160, boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 18, color: 'rgba(0,0,0,0.14)' }] }}>
          <Pressable onPress={() => { setFolderMenuId(null); setRenamingFolder(menuFolder); setRenameText(menuFolder.name); setRenameColor(menuFolder.color ?? FOLDER_COLORS[0]); setRenameError(''); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }}>
            <Pencil size={14} color="#5C5048" />
            <Text style={{ fontSize: 13, color: '#2C2C2C' }}>重命名</Text>
          </Pressable>
          <Pressable onPress={() => { setFolderMenuId(null); setDeletingFolderId(menuFolder.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 }}>
            <Trash2 size={14} color="#E05252" />
            <Text style={{ fontSize: 13, color: '#E05252' }}>删除文件夹</Text>
          </Pressable>
        </View>
      )}

      {/* 筛选面板 */}
      {showFilterPanel && (
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100 }} onPress={() => setShowFilterPanel(false)}>
          <Pressable style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FDFAF4', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 44, gap: 6 }} onPress={() => {}}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8C8A8', alignSelf: 'center', marginBottom: 10 }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C', marginBottom: 6 }}>按文件夹筛选</Text>
            {([{ id: 'all' as const, label: '全部笔记', color: '#F0AA50' }, { id: 'uncategorized' as const, label: '未分类', color: '#C8BEB0' }] as const).map(opt => {
              const active = opt.id === 'all' ? selectedFolderId === undefined : selectedFolderId === null;
              return (
                <Pressable key={opt.id} onPress={() => { setSelectedFolderId(opt.id === 'all' ? undefined : null); setShowFilterPanel(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: active ? '#FFF4E0' : '#F5F0E8', borderWidth: 1, borderColor: active ? '#F0AA50' : 'transparent' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opt.color }} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: active ? '700' : '500', color: '#2C2C2C' }}>{opt.label}</Text>
                  {active && <Check size={14} color="#F0AA50" />}
                </Pressable>
              );
            })}
            <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {flatFolders.filter(f => !f.parent_id).map(f => {
                const active = selectedFolderId === f.id;
                return (
                  <Pressable key={f.id} onPress={() => { setSelectedFolderId(f.id); setShowFilterPanel(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 4, backgroundColor: active ? f.color + '25' : '#F5F0E8', borderWidth: 1, borderColor: active ? f.color : 'transparent' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: f.color }} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: active ? '700' : '500', color: '#2C2C2C' }}>{f.name}</Text>
                    {(f.note_count || 0) > 0 && <Text style={{ fontSize: 11, color: '#A09888' }}>{f.note_count} 篇</Text>}
                    {active && <Check size={14} color={f.color} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {/* 新建文件夹弹窗 */}
      <FolderModal mode="create" visible={showFolderModal} initialName={newFolderName} initialColor={newFolderColor} loading={creatingFolder} error={folderCreateError}
        onChangeName={v => { setNewFolderName(v); if (folderCreateError) setFolderCreateError(''); }}
        onChangeColor={setNewFolderColor} onConfirm={handleCreateFolder}
        onCancel={() => { setShowFolderModal(false); setFolderCreateError(''); }}
      />

      {/* 重命名文件夹弹窗 */}
      <FolderModal mode="rename" visible={!!renamingFolder} initialName={renameText} initialColor={renameColor} loading={renamingLoading} error={renameError}
        onChangeName={v => { setRenameText(v); if (renameError) setRenameError(''); }}
        onChangeColor={setRenameColor} onConfirm={handleRenameFolder}
        onCancel={() => { setRenamingFolder(null); setRenameError(''); }}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal
        visible={!!deletingFolderId} loading={deletingFolderLoading}
        title="删除文件夹"
        message="删除文件夹后，其中的笔记将移至「未分类」，子文件夹也将被删除。确认继续？"
        onConfirm={handleDeleteFolder}
        onCancel={() => setDeletingFolderId(null)}
      />
    </View>
  );
}
