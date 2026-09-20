/**
 * 文件夹详情页 — notes/folder/[id].tsx
 * 展示子文件夹 + 文件夹内笔记，支持新建/删除
 */
import { useState, useCallback } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, FlatList,
  LayoutAnimation, UIManager, Platform, KeyboardAvoidingView, TextInput,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Plus, FolderClosed, FolderOpen, BookHeart,
  Trash2, FolderPlus, Check, ChevronRight, MoreHorizontal, Pencil,
} from 'lucide-react-native';
import { useSession } from '@/ctx';
import {
  getNoteFolders, getNotes, deleteNote, deleteNoteFolder,
  createNoteFolder, updateNoteFolder,
} from '@/db/api';
import type { Note, NoteFolder } from '@/types/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FOLDER_COLORS = ['#F9C784', '#B8E4C9', '#B8D4E8', '#E8B4C8', '#D4B8E8', '#F4D4A8'];

// ── 删除确认弹窗 ───────────────────────────────────────────────
function DeleteConfirmModal({ visible, title, message, onConfirm, onCancel, loading }: {
  visible: boolean; title: string; message: string;
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      justifyContent: 'center', alignItems: 'center', zIndex: 300,
      backgroundColor: 'rgba(0,0,0,0.45)', padding: 24,
    }}>
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

// ── 新建子文件夹弹窗 ────────────────────────────────────────────
function NewFolderModal({ visible, loading, error, onChangeName, onChangeColor, selectedColor, onConfirm, onCancel }: {
  visible: boolean; loading: boolean; error: string; selectedColor: string;
  onChangeName: (v: string) => void; onChangeColor: (c: string) => void;
  onConfirm: () => void; onCancel: () => void;
}) {
  if (!visible) return null;
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 200 }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onCancel} />
      <View style={{ backgroundColor: '#FDFAF4', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 44, gap: 14 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8C8A8', alignSelf: 'center', marginBottom: 2 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E1A14', textAlign: 'center' }}>新建子文件夹</Text>
        <TextInput
          onChangeText={onChangeName} placeholder="子文件夹名称…" placeholderTextColor="#C8BEB0"
          autoFocus returnKeyType="done" onSubmitEditing={onConfirm}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1.5, borderColor: error ? '#E05252' : '#EDE8DF', fontSize: 14, color: '#1E1A14' }}
        />
        {error.length > 0 && <Text style={{ fontSize: 12, color: '#E05252', marginTop: -8 }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
          {FOLDER_COLORS.map(c => (
            <Pressable key={c} onPress={() => onChangeColor(c)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c, borderWidth: selectedColor === c ? 3 : 1.5, borderColor: selectedColor === c ? '#3C3228' : 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              {selectedColor === c && <Check size={14} color="#3C3228" strokeWidth={3} />}
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: '#F0EBE0', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#8A8078' }}>取消</Text>
          </Pressable>
          <Pressable onPress={onConfirm} disabled={loading} style={{ flex: 2, backgroundColor: '#F0AA50', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: loading ? 0.6 : 1 }}>
            {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>创建</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── 新建按钮选择菜单 ────────────────────────────────────────────
function NewItemMenu({ visible, onNewNote, onNewSubFolder, onClose }: {
  visible: boolean; onNewNote: () => void; onNewSubFolder: () => void; onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }} onPress={onClose} />
      <View style={{
        position: 'absolute', right: 16, bottom: 100, zIndex: 60,
        backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#EDE8DF', minWidth: 180,
        boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0,0,0,0.14)' }],
      }}>
        <Pressable onPress={() => { onClose(); onNewNote(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }}>
          <BookHeart size={16} color="#8A7060" />
          <Text style={{ fontSize: 14, color: '#1E1A14', fontWeight: '600' }}>新建笔记</Text>
        </Pressable>
        <Pressable onPress={() => { onClose(); onNewSubFolder(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 }}>
          <FolderPlus size={16} color="#8A7060" />
          <Text style={{ fontSize: 14, color: '#1E1A14', fontWeight: '600' }}>新建子文件夹</Text>
        </Pressable>
      </View>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// 主页面
// ══════════════════════════════════════════════════════════════════
export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const router = useRouter();

  const [folder, setFolder] = useState<NoteFolder | null>(null);
  const [subFolders, setSubFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 菜单
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);

  // 新建子文件夹
  const [showSubFolderModal, setShowSubFolderModal] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubColor, setNewSubColor] = useState(FOLDER_COLORS[0]);
  const [creatingSubFolder, setCreatingSubFolder] = useState(false);
  const [subFolderError, setSubFolderError] = useState('');

  // 重命名子文件夹
  const [renamingFolder, setRenamingFolder] = useState<NoteFolder | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameColor, setRenameColor] = useState(FOLDER_COLORS[0]);
  const [renamingLoading, setRenamingLoading] = useState(false);
  const [renameError, setRenameError] = useState('');

  // 删除确认
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [deletingFolderLoading, setDeletingFolderLoading] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deletingNoteLoading, setDeletingNoteLoading] = useState(false);

  const folderId = id as string;

  const loadData = useCallback(async () => {
    if (!session?.user.id || !folderId) return;
    setLoading(true);
    const [allFolders, folderNotes] = await Promise.all([
      getNoteFolders(session.user.id),
      getNotes(session.user.id, folderId, 50),
    ]);
    const current = allFolders.find(f => f.id === folderId) ?? null;
    if (!current) { setNotFound(true); setLoading(false); return; }
    setFolder(current);
    setSubFolders(allFolders.filter(f => f.parent_id === folderId));
    setNotes(folderNotes);
    setLoading(false);
  }, [session, folderId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // 新建子文件夹
  const handleCreateSubFolder = async () => {
    if (!session || !newSubName.trim()) { setSubFolderError('请输入文件夹名称'); return; }
    setSubFolderError(''); setCreatingSubFolder(true);
    try {
      const result = await createNoteFolder(session.user.id, newSubName.trim(), newSubColor, folderId);
      if (!result) throw new Error('创建失败，请重试');
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await loadData();
      setShowSubFolderModal(false); setNewSubName(''); setNewSubColor(FOLDER_COLORS[0]);
    } catch (err) { setSubFolderError(err instanceof Error ? err.message : '创建失败，请重试'); }
    finally { setCreatingSubFolder(false); }
  };

  // 重命名子文件夹
  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameText.trim()) return;
    setRenameError(''); setRenamingLoading(true);
    try {
      await updateNoteFolder(renamingFolder.id, renameText.trim(), renameColor);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await loadData(); setRenamingFolder(null);
    } catch { setRenameError('保存失败，请重试'); }
    finally { setRenamingLoading(false); }
  };

  // 删除子文件夹
  const handleDeleteFolder = async () => {
    if (!deletingFolderId) return;
    setDeletingFolderLoading(true);
    try {
      await deleteNoteFolder(deletingFolderId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await loadData(); setDeletingFolderId(null);
    } catch { /* ignore */ }
    finally { setDeletingFolderLoading(false); }
  };

  // 删除笔记
  const handleDeleteNote = async () => {
    if (!deletingNoteId) return;
    setDeletingNoteLoading(true);
    try {
      await deleteNote(deletingNoteId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNotes(prev => prev.filter(n => n.id !== deletingNoteId));
      setDeletingNoteId(null);
    } catch { /* ignore */ }
    finally { setDeletingNoteLoading(false); }
  };

  const openEditor = (noteId?: string) => {
    const params = noteId ? `?noteId=${noteId}` : `?folderId=${folderId}`;
    router.push(('/(app)/notes/note-editor' + params) as RelativePathString);
  };

  const openSubFolder = (subId: string) => {
    router.push((`/(app)/notes/folder/${subId}`) as RelativePathString);
  };

  const menuFolder = subFolders.find(f => f.id === folderMenuId);
  const accent = folder?.color ?? '#F9C784';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F0E8', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#F0AA50" />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F0E8', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
        <Text style={{ fontSize: 48 }}>📂</Text>
        <Text style={{ fontSize: 14, color: '#A09888', textAlign: 'center' }}>文件夹不存在或已被删除</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: '#F0AA50', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F0E8' }}>
      <StatusBar style="dark" />

      {/* 关闭菜单遮罩 */}
      {(folderMenuId || showNewMenu) && (
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 45 }} onPress={() => { setFolderMenuId(null); setShowNewMenu(false); }} />
      )}

      {/* 顶部导航栏 */}
      <View style={{ paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#FDFAF4', borderBottomWidth: 1, borderBottomColor: '#E8DFCC', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 6 }}>
          <ArrowLeft size={22} color="#3C3228" />
        </Pressable>
        {/* 文件夹图标 */}
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: accent + '30', alignItems: 'center', justifyContent: 'center' }}>
          <FolderOpen size={16} color={accent} strokeWidth={2.2} />
        </View>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: '#3C3228' }} numberOfLines={1}>{folder?.name}</Text>
        <Pressable onPress={() => setShowNewMenu(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0AA50', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}>
          <Plus size={14} color="#FFFFFF" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>新建</Text>
        </Pressable>
      </View>

      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        data={notes}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* 子文件夹区域 */}
            {subFolders.length > 0 && (
              <View style={{ marginTop: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 1, marginHorizontal: 16, marginBottom: 10 }}>子文件夹</Text>
                <View style={{ paddingHorizontal: 16 }}>
                  {subFolders.map(sf => (
                    <View key={sf.id} style={{ marginBottom: 8 }}>
                      <Pressable onPress={() => openSubFolder(sf.id)} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#EDE8DF', flexDirection: 'row', alignItems: 'center', paddingRight: 12, boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
                        <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: sf.color ?? '#F9C784' }} />
                        <View style={{ width: 36, height: 36, borderRadius: 11, margin: 12, backgroundColor: (sf.color ?? '#F9C784') + '25', alignItems: 'center', justifyContent: 'center' }}>
                          <FolderClosed size={16} color={sf.color ?? '#F9C784'} strokeWidth={2.2} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, paddingVertical: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E1A14' }} numberOfLines={1}>{sf.name}</Text>
                          <Text style={{ fontSize: 11, color: '#A09888', marginTop: 2 }}>{sf.note_count || 0} 篇笔记</Text>
                        </View>
                        <Pressable onPress={() => setFolderMenuId(sf.id)} style={{ padding: 8 }} hitSlop={8}>
                          <MoreHorizontal size={14} color="#C8BEA8" />
                        </Pressable>
                        <ChevronRight size={13} color="#D8D0C8" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {/* 笔记区标题 */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 1, marginHorizontal: 16, marginTop: subFolders.length > 0 ? 4 : 16, marginBottom: 10 }}>笔记</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 32, paddingBottom: 60 }}>
            <Text style={{ fontSize: 48 }}>📝</Text>
            <Text style={{ fontSize: 14, color: '#A09888', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 }}>
              {'文件夹里还没有笔记\n点击右上角「新建」添加'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openEditor(item.id)} style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#EDE8DF', boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: 'rgba(0,0,0,0.07)' }] }}>
            <View style={{ height: 3, backgroundColor: accent }} />
            <View style={{ padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: accent + '25', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BookHeart size={17} color={accent} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E1A14', lineHeight: 20 }} numberOfLines={1}>{item.title}</Text>
                {item.plain_text?.length > 0 && (
                  <Text style={{ fontSize: 12, color: '#7A7060', marginTop: 3, lineHeight: 18 }} numberOfLines={2}>{item.plain_text.slice(0, 80)}</Text>
                )}
                <Text style={{ fontSize: 10, color: '#C8BEB0', marginTop: 6 }}>
                  {new Date(item.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <Pressable onPress={() => setDeletingNoteId(item.id)} hitSlop={8} style={{ paddingTop: 2 }}>
                <Trash2 size={14} color="#E05252" />
              </Pressable>
            </View>
          </Pressable>
        )}
      />

      {/* 新建菜单 */}
      <NewItemMenu
        visible={showNewMenu}
        onClose={() => setShowNewMenu(false)}
        onNewNote={() => openEditor()}
        onNewSubFolder={() => { setNewSubName(''); setNewSubColor(FOLDER_COLORS[0]); setSubFolderError(''); setShowSubFolderModal(true); }}
      />

      {/* 子文件夹操作菜单 */}
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

      {/* 新建子文件夹弹窗 */}
      <NewFolderModal
        visible={showSubFolderModal} loading={creatingSubFolder} error={subFolderError}
        selectedColor={newSubColor}
        onChangeName={v => { setNewSubName(v); if (subFolderError) setSubFolderError(''); }}
        onChangeColor={setNewSubColor}
        onConfirm={handleCreateSubFolder}
        onCancel={() => { setShowSubFolderModal(false); setSubFolderError(''); }}
      />

      {/* 重命名子文件夹弹窗 */}
      {renamingFolder && (
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 200 }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setRenamingFolder(null)} />
          <View style={{ backgroundColor: '#FDFAF4', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 44, gap: 14 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8C8A8', alignSelf: 'center', marginBottom: 2 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E1A14', textAlign: 'center' }}>重命名文件夹</Text>
            <TextInput
              defaultValue={renameText} onChangeText={v => { setRenameText(v); if (renameError) setRenameError(''); }}
              placeholder="文件夹名称…" placeholderTextColor="#C8BEB0" autoFocus
              returnKeyType="done" onSubmitEditing={handleRenameFolder}
              style={{ backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1.5, borderColor: renameError ? '#E05252' : '#EDE8DF', fontSize: 14, color: '#1E1A14' }}
            />
            {renameError.length > 0 && <Text style={{ fontSize: 12, color: '#E05252', marginTop: -8 }}>{renameError}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
              {FOLDER_COLORS.map(c => (
                <Pressable key={c} onPress={() => setRenameColor(c)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c, borderWidth: renameColor === c ? 3 : 1.5, borderColor: renameColor === c ? '#3C3228' : 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  {renameColor === c && <Check size={14} color="#3C3228" strokeWidth={3} />}
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setRenamingFolder(null)} style={{ flex: 1, backgroundColor: '#F0EBE0', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#8A8078' }}>取消</Text>
              </Pressable>
              <Pressable onPress={handleRenameFolder} disabled={renamingLoading} style={{ flex: 2, backgroundColor: '#F0AA50', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: renamingLoading ? 0.6 : 1 }}>
                {renamingLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>保存</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* 删除子文件夹确认 */}
      <DeleteConfirmModal
        visible={!!deletingFolderId} loading={deletingFolderLoading}
        title="删除子文件夹"
        message="删除后，其中的笔记将移至「未分类」。确认继续？"
        onConfirm={handleDeleteFolder}
        onCancel={() => setDeletingFolderId(null)}
      />

      {/* 删除笔记确认 */}
      <DeleteConfirmModal
        visible={!!deletingNoteId} loading={deletingNoteLoading}
        title="删除笔记"
        message="笔记删除后无法恢复，确认继续？"
        onConfirm={handleDeleteNote}
        onCancel={() => setDeletingNoteId(null)}
      />
    </View>
  );
}
