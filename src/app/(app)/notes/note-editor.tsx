/**
 * 愈心手记 — 笔记编辑器（WPS 风格单画布 v2）
 * - 单一 TextInput，无分块方框
 * - 滑动修复：ScrollView + scrollEnabled={false} TextInput
 * - 对齐、颜色、待办复选框、标题工具栏
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, KeyboardAvoidingView,
  useWindowDimensions,
  type TextInput as TextInputType,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import {
  ArrowLeft, Save, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Indent,
  Image as ImageIcon, Paperclip, ChevronDown, ChevronUp,
  FileText, Music, Film, X, Trash2, Camera, Download, FolderOpen,
  CheckSquare, Square,
  Undo2, Redo2, Code, Minus, Link2, Table2, Highlighter, Eraser,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File as FSFile, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/ctx';
import { supabase } from '@/client/supabase';
import {
  getNoteById, createNote, updateNote,
  getNoteAttachments, createNoteAttachment, deleteNoteAttachment,
  getNoteFolders,
} from '@/db/api';
import type { NoteBlock, NoteBlockType, NoteAttachment, NoteFolder } from '@/types/types';

const DRAFT_KEY_PREFIX = 'note_draft_';

// ── 颜色预设 ────────────────────────────────────────────────────────
const TEXT_COLORS = [
  { label: '默认', value: '#2C2C2C' },
  { label: '红', value: '#E05252' },
  { label: '橙', value: '#E8833A' },
  { label: '黄', value: '#C8900A' },
  { label: '绿', value: '#3A8C5C' },
  { label: '蓝', value: '#3A6CB8' },
  { label: '紫', value: '#7A56C8' },
  { label: '灰', value: '#888888' },
];

// ── 工具函数 ──────────────────────────────────────────────────────
function newBlock(type: NoteBlockType = 'paragraph', content = ''): NoteBlock {
  return { id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, type, content };
}

function blocksToText(blocks: NoteBlock[]): string {
  return blocks
    .filter(b => b.type !== 'image' && b.type !== 'attachment')
    .map(b => {
      const prefix =
        b.type === 'h1' ? '# ' :
        b.type === 'h2' ? '## ' :
        b.type === 'h3' ? '### ' :
        b.type === 'quote' ? '> ' :
        b.type === 'ul' ? '• ' :
        b.type === 'ol' ? '1. ' : '';
      return prefix + (b.content ?? '');
    })
    .join('\n');
}

function textToBlocks(text: string): NoteBlock[] {
  if (!text.trim()) return [newBlock()];
  return text.split('\n').map(line => {
    if (line.startsWith('# ')) return newBlock('h1', line.slice(2));
    if (line.startsWith('## ')) return newBlock('h2', line.slice(3));
    if (line.startsWith('### ')) return newBlock('h3', line.slice(4));
    if (line.startsWith('> ')) return newBlock('quote', line.slice(2));
    if (line.startsWith('• ')) return newBlock('ul', line.slice(2));
    if (/^\d+\.\s/.test(line)) return newBlock('ol', line.replace(/^\d+\.\s/, ''));
    return newBlock('paragraph', line);
  });
}

/** 从正文提取 todo 行：[ ] 或 [x] 前缀 */
function parseTodos(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('[ ] ')) return { lineIdx: i, checked: false, content: line.slice(4) };
    if (line.startsWith('[x] ')) return { lineIdx: i, checked: true, content: line.slice(4) };
    return null;
  }).filter(Boolean) as { lineIdx: number; checked: boolean; content: string }[];
}

/** 切换某行 todo 的勾选状态 */
function toggleTodoLine(text: string, lineIdx: number): string {
  const lines = text.split('\n');
  const line = lines[lineIdx];
  if (line.startsWith('[ ] ')) lines[lineIdx] = '[x] ' + line.slice(4);
  else if (line.startsWith('[x] ')) lines[lineIdx] = '[ ] ' + line.slice(4);
  return lines.join('\n');
}

function mimeToFileType(mime: string): NoteAttachment['file_type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('word') || mime.includes('document')) return 'word';
  if (mime.startsWith('audio/') || mime.includes('mpeg')) return 'audio';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ type, size = 20 }: { type: NoteAttachment['file_type']; size?: number }) {
  const color = type === 'image' ? '#7A9D8C' : type === 'pdf' ? '#E8A365' :
    type === 'word' ? '#5B9BD5' : type === 'audio' ? '#9B8EC4' : '#888888';
  if (type === 'image') return <ImageIcon size={size} color={color} />;
  if (type === 'audio') return <Music size={size} color={color} />;
  if (type === 'pdf' || type === 'word') return <FileText size={size} color={color} />;
  return <Film size={size} color={color} />;
}

// ═══════════════════════════════════════════════════════════════════
export default function NoteEditorScreen() {
  const { noteId, folderId } = useLocalSearchParams<{ noteId?: string; folderId?: string }>();
  const { session } = useSession();
  const router = useRouter();
  const { height: winHeight } = useWindowDimensions();

  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [textColor, setTextColor] = useState('#2C2C2C');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!noteId);
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<NoteFolder[]>([]);
  const [selectedSaveFolderId, setSelectedSaveFolderId] = useState<string | null>(folderId ?? null);
  const [showImageSourceMenu, setShowImageSourceMenu] = useState(false);

  const isDirty = useRef(false);
  const bodyInputRef = useRef<TextInputType>(null);
  const ensuredNoteIdRef = useRef<string | null>(null);
  // 光标/选区，供工具栏使用
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  // 最后一次有效的非空选区（防止失焦导致选区归零影响格式操作）
  const savedSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  // 撤销/重做历史栈
  const historyRef = useRef<string[]>([]);
  const historyPosRef = useRef(-1);
  // 触发 fmtActive 重算
  const [cursorPos, setCursorPos] = useState(0);

  const draftKey = noteId ? `${DRAFT_KEY_PREFIX}${noteId}` : `${DRAFT_KEY_PREFIX}new`;

  // ── 加载 ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (session?.user.id) {
        const fl = await getNoteFolders(session.user.id);
        setAvailableFolders(fl);
      }
      if (!noteId) {
        const draft = await AsyncStorage.getItem(draftKey);
        if (draft) {
          const p = JSON.parse(draft);
          if (p.title) setTitle(p.title);
          if (p.bodyText) setBodyText(p.bodyText);
        }
        setLoading(false);
        return;
      }
      const note = await getNoteById(noteId);
      if (note) {
        setTitle(note.title === '无标题' ? '' : note.title);
        const blocks = Array.isArray(note.blocks) && note.blocks.length ? note.blocks : [newBlock()];
        const text = blocksToText(blocks);
        setBodyText(text);
        initHistory(text);
        const atts = await getNoteAttachments(noteId);
        setAttachments(atts);
        if (note.folder_id) setSelectedSaveFolderId(note.folder_id);
      }
      setLoading(false);
    })();
  }, [noteId, session]);

  // ── 自动草稿 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDirty.current) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(draftKey, JSON.stringify({ title, bodyText }));
    }, 1500);
    return () => clearTimeout(t);
  }, [title, bodyText]);

  const markDirty = useCallback(() => { isDirty.current = true; }, []);

  // ── 历史栈：撤销 / 重做 ──────────────────────────────────────────
  const pushHistory = useCallback((text: string) => {
    const stack = historyRef.current;
    const pos = historyPosRef.current;
    // 清除当前位置之后的分支
    const next = stack.slice(0, pos + 1);
    next.push(text);
    if (next.length > 100) next.shift(); // 最多保留 100 步
    historyRef.current = next;
    historyPosRef.current = next.length - 1;
  }, []);

  const handleUndo = useCallback(() => {
    const pos = historyPosRef.current;
    if (pos > 0) {
      historyPosRef.current = pos - 1;
      setBodyText(historyRef.current[historyPosRef.current]);
      markDirty();
    }
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty]);

  const handleRedo = useCallback(() => {
    const pos = historyPosRef.current;
    if (pos < historyRef.current.length - 1) {
      historyPosRef.current = pos + 1;
      setBodyText(historyRef.current[historyPosRef.current]);
      markDirty();
    }
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty]);

  // 初始化历史栈（正文加载完成后调用一次）
  const initHistory = useCallback((text: string) => {
    historyRef.current = [text];
    historyPosRef.current = 0;
  }, []);

  // ── 选区变化处理（保存最近有效选区，防止工具栏点击后选区丢失）────────
  const handleSelectionChange = useCallback((sel: { start: number; end: number }) => {
    selectionRef.current = sel;
    if (sel.end > sel.start) {
      // 有非空选区 → 保存
      savedSelectionRef.current = { ...sel };
    } else {
      // 光标移到了上次保存选区范围以外 → 重置保存的选区为当前光标
      const { start: ss, end: se } = savedSelectionRef.current;
      if (sel.start < ss || sel.start > se) {
        savedSelectionRef.current = { ...sel };
      }
      // 若光标落在之前选区边界（失焦导致），则保留 savedSelectionRef 不变
    }
    setCursorPos(sel.start);
  }, []);

  // ── 对齐标记常量 ─────────────────────────────────────────────────
  const ALIGN_MARKERS = ['[~c~]', '[~r~]', '[~j~]'] as const;
  type AlignMarker = typeof ALIGN_MARKERS[number];
  const alignToMarker: Record<string, AlignMarker | ''> = {
    left: '', center: '[~c~]', right: '[~r~]', justify: '[~j~]',
  };
  const markerToAlign: Record<string, 'left' | 'center' | 'right'> = {
    '[~c~]': 'center', '[~r~]': 'right', '[~j~]': 'right',
  };

  // 从行内容中提取对齐标记
  const getLineAlign = (line: string): 'left' | 'center' | 'right' => {
    for (const m of ALIGN_MARKERS) {
      if (line.includes(m)) return markerToAlign[m];
    }
    return 'left';
  };

  // ── 光标处格式状态（驱动工具栏高亮） ─────────────────────────────
  const fmtActive = useMemo(() => {
    const before = bodyText.slice(0, cursorPos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = bodyText.indexOf('\n', cursorPos);
    const currentLine = bodyText.slice(lineStart, lineEnd === -1 ? bodyText.length : lineEnd);
    // 用 savedSelectionRef 检测行内格式（防止失焦后选区归零）
    const { start, end } = savedSelectionRef.current;
    const selected = bodyText.slice(start, end);
    const lineAlign = getLineAlign(currentLine);
    return {
      h1:    currentLine.startsWith('# ')  && !currentLine.startsWith('## '),
      h2:    currentLine.startsWith('## ') && !currentLine.startsWith('### '),
      h3:    currentLine.startsWith('### ') && !currentLine.startsWith('#### '),
      h4:    currentLine.startsWith('#### '),
      p:     !currentLine.startsWith('#') && !currentLine.startsWith('> '),
      quote: currentLine.startsWith('> '),
      ul:    currentLine.startsWith('• '),
      ol:    /^\d+\.\s/.test(currentLine),
      todo:  currentLine.startsWith('[ ] ') || currentLine.startsWith('[x] '),
      bold:   selected.length > 0 && selected.startsWith('**') && selected.endsWith('**'),
      italic: selected.length > 0 && selected.startsWith('_')  && selected.endsWith('_'),
      under:  selected.length > 0 && selected.startsWith('<u>') && selected.endsWith('</u>'),
      strike: selected.length > 0 && selected.startsWith('~~') && selected.endsWith('~~'),
      hi:     selected.length > 0 && selected.startsWith('==') && selected.endsWith('=='),
      alignLeft:    lineAlign === 'left',
      alignCenter:  lineAlign === 'center',
      alignRight:   lineAlign === 'right',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyText, cursorPos]);

  // 同步全局 textAlign（视觉反馈）
  useEffect(() => {
    if (fmtActive.alignCenter) setTextAlign('center');
    else if (fmtActive.alignRight) setTextAlign('right');
    else setTextAlign('left');
  }, [fmtActive.alignCenter, fmtActive.alignRight]);

  const canUndo = historyPosRef.current > 0;
  const canRedo = historyPosRef.current < historyRef.current.length - 1;

  // ── 行内包裹型格式（加粗/斜体/下划线/删除线/高亮）───────────────
  // 使用 savedSelectionRef 避免工具栏点击时失焦导致选区丢失
  const wrapSelection = useCallback((marker: string, closeMarker?: string) => {
    const close = closeMarker ?? marker;
    // 优先使用 savedSelectionRef（保留最后真实选区）
    const { start, end } = savedSelectionRef.current;
    setBodyText(prev => {
      const selected = prev.slice(start, end);
      const before   = prev.slice(0, start);
      const after    = prev.slice(end);
      if (selected.length > 0) {
        const alreadyWrapped = selected.startsWith(marker) && selected.endsWith(close)
          && selected.length > marker.length + close.length;
        if (alreadyWrapped) return before + selected.slice(marker.length, selected.length - close.length) + after;
        const result = before + marker + selected + close + after;
        pushHistory(result);
        return result;
      }
      // 无选区 → 在当前光标插入空标记对
      const pos = selectionRef.current.start;
      const b = prev.slice(0, pos);
      const a = prev.slice(pos);
      const result = b + marker + close + a;
      pushHistory(result);
      return result;
    });
    markDirty();
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty, pushHistory]);

  // ── 行首前缀型格式（H1-H4/引用/列表/待办）───────────────────────
  const insertAtCursor = useCallback((prefix: string) => {
    const pos = selectionRef.current.start;
    setBodyText(prev => {
      const before = prev.slice(0, pos);
      const after  = prev.slice(selectionRef.current.end);
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineContent = before.slice(lineStart);
      const allPrefixes = ['#### ', '### ', '## ', '# ', '> ', '• ', '1. ', '[ ] '];
      const existing = allPrefixes.find(p => lineContent.startsWith(p)) ?? '';
      const cleanLine = existing ? lineContent.slice(existing.length) : lineContent;
      const newLine = lineContent.startsWith(prefix) ? cleanLine : prefix + cleanLine;
      const result = before.slice(0, lineStart) + newLine + after;
      pushHistory(result);
      return result;
    });
    markDirty();
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty, pushHistory]);

  // ── 段落对齐（在当前行插入/替换对齐标记）────────────────────────
  const applyLineAlign = useCallback((align: 'left' | 'center' | 'right' | 'justify') => {
    const pos = selectionRef.current.start;
    const marker = alignToMarker[align];
    setBodyText(prev => {
      const before = prev.slice(0, pos);
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = prev.indexOf('\n', pos);
      const lineEnd2 = lineEnd === -1 ? prev.length : lineEnd;
      const line = prev.slice(lineStart, lineEnd2);
      // 移除已有对齐标记
      let cleanLine = line;
      for (const m of ALIGN_MARKERS) cleanLine = cleanLine.replace(m, '');
      // 插入新标记（left 不需要标记）
      const newLine = marker ? cleanLine + marker : cleanLine;
      const result = prev.slice(0, lineStart) + newLine + prev.slice(lineEnd2);
      pushHistory(result);
      return result;
    });
    markDirty();
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty, pushHistory]);

  // ── 文字颜色（包裹选区）────────────────────────────────────────
  const applyColor = useCallback((colorValue: string) => {
    const { start, end } = savedSelectionRef.current;
    setBodyText(prev => {
      if (start === end) return prev; // 无选区不操作
      const selected = prev.slice(start, end);
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      // 移除已有颜色标记
      const stripped = selected.replace(/\[color=[^\]]+\](.*?)\[\/color\]/gs, '$1');
      // 默认色 → 只剥除标记
      if (colorValue === '#2C2C2C') {
        const result = before + stripped + after;
        pushHistory(result);
        return result;
      }
      const result = before + `[color=${colorValue}]${stripped}[/color]` + after;
      pushHistory(result);
      return result;
    });
    // 更新工具栏预览色
    setTextColor(colorValue);
    markDirty();
    setShowColorPicker(false);
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty, pushHistory]);

  // ── 块级内容插入（分隔线/代码块/表格/链接）──────────────────────
  const insertBlock = useCallback((template: string) => {
    const { start } = selectionRef.current;
    setBodyText(prev => {
      const before = prev.slice(0, start);
      const after  = prev.slice(start);
      const sep = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const tail = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
      const result = before + sep + template + tail + after;
      pushHistory(result);
      return result;
    });
    markDirty();
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty, pushHistory]);

  // ── 清除格式（选区内移除所有 Markdown/颜色/对齐标记）────────────
  const clearFormat = useCallback(() => {
    const { start, end } = savedSelectionRef.current;
    if (start === end) return;
    setBodyText(prev => {
      let sel = prev.slice(start, end);
      // 移除行内标记
      sel = sel
        .replace(/\*\*(.*?)\*\*/gs, '$1')
        .replace(/~~(.*?)~~/gs, '$1')
        .replace(/==(.*?)==/gs, '$1')
        .replace(/<u>(.*?)<\/u>/gs, '$1')
        .replace(/_(.*?)_/gs, '$1')
        .replace(/`(.*?)`/gs, '$1')
        .replace(/\[color=[^\]]+\](.*?)\[\/color\]/gs, '$1');
      // 移除对齐标记
      for (const m of ALIGN_MARKERS) sel = sel.replace(m, '');
      // 移除行首标记
      sel = sel.split('\n').map(line => {
        for (const p of ['#### ', '### ', '## ', '# ', '> ', '• ', '1. ', '[ ] ', '[x] ']) {
          if (line.startsWith(p)) return line.slice(p.length);
        }
        return line;
      }).join('\n');
      const result = prev.slice(0, start) + sel + prev.slice(end);
      pushHistory(result);
      return result;
    });
    markDirty();
    setTimeout(() => bodyInputRef.current?.focus(), 30);
  }, [markDirty, pushHistory]);

  // ── 待办切换 ────────────────────────────────────────────────────
  const handleToggleTodo = useCallback((lineIdx: number) => {
    setBodyText(prev => {
      const result = toggleTodoLine(prev, lineIdx);
      pushHistory(result);
      return result;
    });
    markDirty();
  }, [markDirty, pushHistory]);

  // ── 图片/附件上传 ─────────────────────────────────────────────
  const uploadFile = useCallback(async (uri: string, name: string, type: string, size: number) => {
    const nid = noteId || ensuredNoteIdRef.current;
    if (!nid || !session) return;
    const ext = name.split('.').pop() ?? 'bin';
    const path = `${session.user.id}/${nid}/${Date.now()}.${ext}`;
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const { error } = await supabase.storage.from('note-attachments').upload(path, blob, { contentType: type, upsert: false });
    if (error) throw error;
    const { data: pub } = supabase.storage.from('note-attachments').getPublicUrl(path);
    return await createNoteAttachment({ note_id: nid, user_id: session.user.id, file_name: name, file_type: mimeToFileType(type), mime_type: type, storage_path: path, public_url: pub.publicUrl, file_size: size });
  }, [noteId, session]);

  const ensureNoteId = useCallback(async (): Promise<string | null> => {
    if (noteId) return noteId;
    if (ensuredNoteIdRef.current) return ensuredNoteIdRef.current;
    if (!session) return null;
    const created = await createNote(session.user.id, title || '无标题', textToBlocks(bodyText), selectedSaveFolderId);
    if (created) { ensuredNoteIdRef.current = created.id; return created.id; }
    return null;
  }, [noteId, session, title, bodyText, selectedSaveFolderId]);

  const insertImage = useCallback(async (camera: boolean) => {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploadingFile(true);
    try {
      await ensureNoteId();
      const att = await uploadFile(asset.uri, asset.fileName ?? `img_${Date.now()}.jpg`, asset.mimeType ?? 'image/jpeg', asset.fileSize ?? 0);
      if (att) setAttachments(prev => [...prev, att]);
    } finally { setUploadingFile(false); }
  }, [ensureNoteId, uploadFile]);

  const insertAttachment = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    setUploadingFile(true);
    try {
      await ensureNoteId();
      const att = await uploadFile(file.uri, file.name, file.mimeType ?? 'application/octet-stream', file.size ?? 0);
      if (att) setAttachments(prev => [...prev, att]);
    } finally { setUploadingFile(false); }
  }, [ensureNoteId, uploadFile]);

  // ── 保存 ────────────────────────────────────────────────────────
  const handleSave = useCallback(async (overrideFolderId?: string | null) => {
    if (!session) return;
    if (!title.trim() && !bodyText.trim() && attachments.length === 0) {
      setSaveError('请输入笔记标题或内容'); return;
    }
    setSaving(true); setSaveError('');
    const saveFid = overrideFolderId !== undefined ? overrideFolderId : selectedSaveFolderId;
    const blocks = [
      ...textToBlocks(bodyText),
      ...attachments.map(a => ({ ...newBlock(a.file_type === 'image' ? 'image' : 'attachment'), attachmentId: a.id } as NoteBlock)),
    ];
    try {
      if (noteId || ensuredNoteIdRef.current) {
        await updateNote(noteId || ensuredNoteIdRef.current!, title || '无标题', blocks, saveFid);
      } else {
        const created = await createNote(session.user.id, title || '无标题', blocks, saveFid);
        if (!created) { setSaveError('保存失败，请重试'); return; }
        ensuredNoteIdRef.current = created.id;
      }
      await AsyncStorage.removeItem(draftKey);
      isDirty.current = false;
      router.back();
    } catch { setSaveError('保存失败，请重试'); }
    finally { setSaving(false); }
  }, [session, noteId, title, bodyText, attachments, selectedSaveFolderId, draftKey, router]);

  // ── 导出 ────────────────────────────────────────────────────────
  // 把 bodyText markdown 转为 HTML（用于 PDF 导出）
  const bodyToHtml = useCallback((text: string): string => {
    const lines = text.split('\n').map(line => {
      // 提取对齐标记
      let alignStyle = '';
      if (line.includes('[~c~]')) { alignStyle = ' style="text-align:center"'; line = line.replace('[~c~]', ''); }
      else if (line.includes('[~r~]')) { alignStyle = ' style="text-align:right"'; line = line.replace('[~r~]', ''); }
      else if (line.includes('[~j~]')) { alignStyle = ' style="text-align:justify"'; line = line.replace('[~j~]', ''); }
      // 处理行内颜色标记
      const processInline = (s: string) =>
        s.replace(/\[color=([^\]]+)\](.*?)\[\/color\]/gs, '<span style="color:$1">$2</span>');
      if (line.startsWith('# ')) return `<h1${alignStyle}>${processInline(line.slice(2))}</h1>`;
      if (line.startsWith('## ')) return `<h2${alignStyle}>${processInline(line.slice(3))}</h2>`;
      if (line.startsWith('### ')) return `<h3${alignStyle}>${processInline(line.slice(4))}</h3>`;
      if (line.startsWith('> ')) return `<blockquote${alignStyle}>${processInline(line.slice(2))}</blockquote>`;
      if (line.startsWith('• ')) return `<li${alignStyle}>${processInline(line.slice(2))}</li>`;
      if (/^\d+\.\s/.test(line)) return `<li${alignStyle}>${processInline(line.replace(/^\d+\.\s/, ''))}</li>`;
      if (line.startsWith('[ ] ')) return `<p${alignStyle}>☐ ${processInline(line.slice(4))}</p>`;
      if (line.startsWith('[x] ')) return `<p${alignStyle}>☑ ${processInline(line.slice(4))}</p>`;
      if (line.trim() === '') return '<br/>';
      return `<p${alignStyle}>${processInline(line)}</p>`;
    });
    return lines.join('\n');
  }, []);

  // 导出为指定格式
  const handleExportFormat = useCallback(async (fmt: 'txt' | 'pdf' | 'rtf') => {
    setShowExportMenu(false);
    if (!session) return;
    setExporting(true); setExportSuccess(''); setSaveError('');
    const noteTitle = (title || '无标题').replace(/[/\\?%*:|"<>]/g, '_');
    try {
      if (process.env.EXPO_OS === 'web') {
        // Web：用 <a> download
        const content = fmt === 'pdf'
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${noteTitle}</title><style>body{font-family:sans-serif;max-width:720px;margin:40px auto;line-height:1.7}h1,h2,h3{color:#3C3228}blockquote{border-left:4px solid #F0AA50;padding-left:16px;color:#6A6258}</style></head><body><h1>${noteTitle}</h1>${bodyToHtml(bodyText)}</body></html>`
          : `# ${noteTitle}\n\n${bodyText}`;
        const blob = new Blob([content], { type: fmt === 'pdf' ? 'text/html' : 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${noteTitle}.${fmt === 'pdf' ? 'html' : fmt}`;
        a.click(); URL.revokeObjectURL(url);
        setExportSuccess('已导出 ✓'); setTimeout(() => setExportSuccess(''), 3000);
        return;
      }

      if (fmt === 'txt') {
        const content = `${noteTitle}\n${'='.repeat(noteTitle.length)}\n\n${bodyText}`;
        const file = new FSFile(Paths.cache, `${noteTitle}_${Date.now()}.txt`);
        file.write(content);
        await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: '分享文本文件', UTI: 'public.plain-text' });

      } else if (fmt === 'pdf') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${noteTitle}</title><style>body{font-family:-apple-system,sans-serif;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.75;color:#2C2C2C}h1{font-size:24px;border-bottom:2px solid #F0AA50;padding-bottom:8px;margin-bottom:20px}h2{font-size:20px;color:#3C3228}h3{font-size:17px;color:#3C3228}blockquote{border-left:4px solid #F0AA50;padding:4px 16px;background:#FFF8EE;margin:12px 0;color:#6A6258}li{margin:4px 0}p{margin:6px 0}</style></head><body><h1>${noteTitle}</h1>${bodyToHtml(bodyText)}</body></html>`;
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: '分享 PDF', UTI: 'com.adobe.pdf' });

      } else {
        // RTF — Word 可直接打开
        const rtfLines = bodyText.split('\n').map(line => {
          const safe = line.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
          if (line.startsWith('# ')) return `{\\pard\\sb240\\sa120\\b\\fs36 ${safe.slice(2)}\\par}`;
          if (line.startsWith('## ')) return `{\\pard\\sb200\\sa80\\b\\fs28 ${safe.slice(3)}\\par}`;
          if (line.startsWith('### ')) return `{\\pard\\sb160\\sa60\\b\\fs24 ${safe.slice(4)}\\par}`;
          if (line.startsWith('> ')) return `{\\pard\\li400\\ri400\\sl280\\slmult1\\i ${safe.slice(2)}\\par}`;
          if (line.trim() === '') return '{\\pard\\par}';
          return `{\\pard\\sl280\\slmult1 ${safe}\\par}`;
        });
        const titleSafe = noteTitle.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
        const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\pard\\sb240\\sa120\\b\\fs40 ${titleSafe}\\par}{\\pard\\par}${rtfLines.join('')}}`;
        const file = new FSFile(Paths.cache, `${noteTitle}_${Date.now()}.rtf`);
        file.write(rtf);
        await Sharing.shareAsync(file.uri, { mimeType: 'text/rtf', dialogTitle: '分享 Word 文档', UTI: 'public.rtf' });
      }

      setExportSuccess('导出成功 ✓'); setTimeout(() => setExportSuccess(''), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '导出失败，请重试');
    } finally { setExporting(false); }
  }, [session, title, bodyText, bodyToHtml]);

  const handleExport = useCallback(() => { setShowExportMenu(true); }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FEFCF8', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#E8A365" />
      </View>
    );
  }

  const todos = parseTodos(bodyText);
  const hasTodos = todos.length > 0;

  const tbBtn = (active = false, disabled = false) => ({
    padding: 8, borderRadius: 10,
    backgroundColor: active ? '#F0C870' : '#F3EFE7',
    borderWidth: 1, borderColor: active ? '#D4A040' : '#E0D8C8',
    opacity: disabled ? 0.35 : 1,
  });
  const divider = { width: 1, height: 22, backgroundColor: '#E8D8B8' } as const;

  return (
    <View style={{ flex: 1, backgroundColor: '#FEFCF8' }}>
      <StatusBar style="dark" />

      {/* ── 顶部导航栏 ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingTop: 52, paddingBottom: 12, paddingLeft: 12, paddingRight: 16,
        backgroundColor: '#FDFAF3', borderBottomWidth: 1, borderBottomColor: '#EDE8DE',
      }}>
        <Pressable onPress={() => router.back()} style={{ padding: 8 }}>
          <ArrowLeft size={22} color="#2C2C2C" />
        </Pressable>
        <TextInput
          value={title}
          onChangeText={v => { setTitle(v); markDirty(); }}
          placeholder="笔记标题…"
          placeholderTextColor="#B8A888"
          underlineColorAndroid="transparent"
          style={[
            { flex: 1, fontSize: 16, fontWeight: '700', color: '#2C2C2C', paddingHorizontal: 6, paddingVertical: 4, borderWidth: 0, backgroundColor: 'transparent' },
            process.env.EXPO_OS === 'web' ? { outlineWidth: 0, outline: 'none', border: 'none', boxShadow: 'none' } as never : {},
          ]}
        />
        <Pressable onPress={handleExport} disabled={exporting}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#B8E4C9', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, opacity: exporting ? 0.6 : 1 }}>
          {exporting ? <ActivityIndicator size="small" color="#3A6B52" /> : <Download size={14} color="#3A6B52" />}
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#3A6B52' }}>导出</Text>
        </Pressable>
        <Pressable onPress={() => setShowFolderPicker(true)} disabled={saving}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0AA50', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, opacity: saving ? 0.6 : 1 }}>
          {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Save size={14} color="#FFFFFF" />}
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>保存</Text>
        </Pressable>
      </View>

      {/* 状态提示条 */}
      {(saveError || exportSuccess) ? (
        <Text style={{ textAlign: 'center', fontSize: 12, paddingVertical: 4, paddingHorizontal: 16, color: exportSuccess ? '#3A8C5C' : '#E05252', backgroundColor: exportSuccess ? '#EAF7EE' : '#FEF0F0' }}>
          {exportSuccess || saveError}
        </Text>
      ) : null}

      {/* ── 编辑区域 ── */}
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}>

        {/* ── Web 端：textarea 自身滚动，高度锁定填满屏幕 ── */}
        {process.env.EXPO_OS === 'web' ? (
          <View style={{ flex: 1, backgroundColor: '#FEFCF8' }}>
            <TextInput
              ref={bodyInputRef}
              value={bodyText}
              onChangeText={v => { setBodyText(v); markDirty(); }}
              onSelectionChange={e => handleSelectionChange(e.nativeEvent.selection)}
              multiline
              scrollEnabled
              blurOnSubmit={false}
              underlineColorAndroid="transparent"
              placeholder={'开始书写你的心路历程…\n\n使用 # 大标题  ## 二级  > 引用  • 列表'}
              placeholderTextColor="#C8B898"
              textAlignVertical="top"
              textAlign={textAlign}
              style={[
                {
                  flex: 1,
                  width: '100%',
                  fontSize: 15,
                  color: textColor,
                  lineHeight: 28,
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 20,
                  borderWidth: 0,
                  backgroundColor: 'transparent',
                },
                {
                  outlineWidth: 0,
                  outline: 'none',
                  border: 'none',
                  boxShadow: 'none',
                  resize: 'none',
                  WebkitAppearance: 'none',
                  overflowY: 'auto',
                } as never,
              ]}
            />
            {/* 待办清单（Web） */}
            {hasTodos && (
              <View style={{ marginHorizontal: 20, marginBottom: 12, padding: 14, backgroundColor: '#F8F4ED', borderRadius: 14, borderWidth: 1, borderColor: '#EDE0CC' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 0.8, marginBottom: 8 }}>待办清单</Text>
                {todos.map(todo => (
                  <Pressable key={todo.lineIdx} onPress={() => handleToggleTodo(todo.lineIdx)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                    {todo.checked
                      ? <CheckSquare size={20} color="#3A8C5C" />
                      : <Square size={20} color="#B0A898" />}
                    <Text style={{ flex: 1, fontSize: 14, color: todo.checked ? '#888' : '#2C2C2C', textDecorationLine: todo.checked ? 'line-through' : 'none', lineHeight: 22 }}>{todo.content}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {/* 附件列表（Web） */}
            {attachments.length > 0 && (
              <View style={{ paddingHorizontal: 20, gap: 8, paddingBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 0.8, marginBottom: 4 }}>附件</Text>
                {attachments.map(att => att.file_type === 'image' ? (
                  <View key={att.id} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                    <Image source={{ uri: att.public_url }} style={{ width: '100%', height: 180, borderRadius: 12 }} contentFit="cover" />
                    <Pressable onPress={() => { setAttachments(p => p.filter(a => a.id !== att.id)); deleteNoteAttachment(att.id, att.storage_path); }}
                      style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 5 }}>
                      <X size={14} color="#FFF" />
                    </Pressable>
                  </View>
                ) : (
                  <View key={att.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#FFF9F0', borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8' }}>
                    <AttachmentIcon type={att.file_type} size={18} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C' }} numberOfLines={1}>{att.file_name}</Text>
                      <Text style={{ fontSize: 11, color: '#888' }}>{formatBytes(att.file_size)}</Text>
                    </View>
                    <Pressable onPress={() => { setAttachments(p => p.filter(a => a.id !== att.id)); deleteNoteAttachment(att.id, att.storage_path); }}>
                      <Trash2 size={15} color="#E05252" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          /* ── Native 端：父 ScrollView 滚动，TextInput 自动伸高 ── */
          <ScrollView
            style={{ flex: 1, backgroundColor: '#FEFCF8' }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}>

            <TextInput
              ref={bodyInputRef}
              value={bodyText}
              onChangeText={v => { setBodyText(v); markDirty(); }}
              onSelectionChange={e => handleSelectionChange(e.nativeEvent.selection)}
              multiline
              scrollEnabled={false}
              blurOnSubmit={false}
              underlineColorAndroid="transparent"
              placeholder={'开始书写你的心路历程…\n\n使用 # 大标题  ## 二级  > 引用  • 列表'}
              placeholderTextColor="#C8B898"
              textAlignVertical="top"
              textAlign={textAlign}
              style={{
                width: '100%',
                fontSize: 15,
                color: textColor,
                lineHeight: 28,
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 20,
                minHeight: winHeight * 0.6,
                borderWidth: 0,
                backgroundColor: 'transparent',
              }}
            />

          {/* 待办清单（Native） */}
          {hasTodos && (
            <View style={{ marginHorizontal: 20, marginBottom: 12, padding: 14, backgroundColor: '#F8F4ED', borderRadius: 14, borderWidth: 1, borderColor: '#EDE0CC' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 0.8, marginBottom: 8 }}>待办清单</Text>
              {todos.map(todo => (
                <Pressable key={todo.lineIdx} onPress={() => handleToggleTodo(todo.lineIdx)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                  {todo.checked
                    ? <CheckSquare size={20} color="#3A8C5C" />
                    : <Square size={20} color="#B0A898" />}
                  <Text style={{
                    flex: 1, fontSize: 14, color: todo.checked ? '#888' : '#2C2C2C',
                    textDecorationLine: todo.checked ? 'line-through' : 'none',
                    lineHeight: 22,
                  }}>{todo.content}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* 附件列表（Native） */}
          {attachments.length > 0 && (
            <View style={{ paddingHorizontal: 20, gap: 8, paddingBottom: 16 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#A09888', letterSpacing: 0.8, marginBottom: 4 }}>附件</Text>
              {attachments.map(att => att.file_type === 'image' ? (
                <View key={att.id} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                  <Image source={{ uri: att.public_url }} style={{ width: '100%', height: 180, borderRadius: 12 }} contentFit="cover" />
                  <Pressable onPress={() => { setAttachments(p => p.filter(a => a.id !== att.id)); deleteNoteAttachment(att.id, att.storage_path); }}
                    style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 5 }}>
                    <X size={14} color="#FFF" />
                  </Pressable>
                </View>
              ) : (
                <View key={att.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#FFF9F0', borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8' }}>
                  <AttachmentIcon type={att.file_type} size={18} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C' }} numberOfLines={1}>{att.file_name}</Text>
                    <Text style={{ fontSize: 11, color: '#888' }}>{formatBytes(att.file_size)}</Text>
                  </View>
                  <Pressable onPress={() => { setAttachments(p => p.filter(a => a.id !== att.id)); deleteNoteAttachment(att.id, att.storage_path); }}>
                    <Trash2 size={15} color="#E05252" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        )}

        {/* ── 底部工具栏（两端共用） ── */}
        <View style={{
          backgroundColor: '#FDFAF3', borderTopWidth: 1, borderTopColor: '#EDE8DE',
          paddingBottom: process.env.EXPO_OS === 'ios' ? 24 : 8,
        }}>
          {/* ── 第一行：文本格式 + 标题 + 对齐 + 颜色 ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ paddingHorizontal: 10, paddingTop: 6, marginBottom: 2 }}>
            <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
              {/* 撤销 / 重做 */}
              <Pressable onPress={handleUndo} style={tbBtn(false, !canUndo)}>
                <Undo2 size={15} color={canUndo ? '#5C5048' : '#C8B898'} />
              </Pressable>
              <Pressable onPress={handleRedo} style={tbBtn(false, !canRedo)}>
                <Redo2 size={15} color={canRedo ? '#5C5048' : '#C8B898'} />
              </Pressable>

              <View style={divider} />

              {/* 行内格式：加粗 斜体 下划线 删除线 高亮 */}
              <Pressable onPress={() => wrapSelection('**')} style={tbBtn(fmtActive.bold)}>
                <Bold size={15} color={fmtActive.bold ? '#8A5C00' : '#5C5048'} />
              </Pressable>
              <Pressable onPress={() => wrapSelection('_')} style={tbBtn(fmtActive.italic)}>
                <Italic size={15} color={fmtActive.italic ? '#8A5C00' : '#5C5048'} />
              </Pressable>
              <Pressable onPress={() => wrapSelection('<u>', '</u>')} style={tbBtn(fmtActive.under)}>
                <Underline size={15} color={fmtActive.under ? '#8A5C00' : '#5C5048'} />
              </Pressable>
              <Pressable onPress={() => wrapSelection('~~')} style={tbBtn(fmtActive.strike)}>
                <Strikethrough size={15} color={fmtActive.strike ? '#8A5C00' : '#5C5048'} />
              </Pressable>
              <Pressable onPress={() => wrapSelection('==')} style={tbBtn(fmtActive.hi)}>
                <Highlighter size={15} color={fmtActive.hi ? '#8A5C00' : '#5C5048'} />
              </Pressable>

              <View style={divider} />

              {/* 标题 H1–H4 + P */}
              {(['h1', 'h2', 'h3', 'h4', 'p'] as const).map(t => {
                const active = fmtActive[t as keyof typeof fmtActive] as boolean;
                const prefix = t === 'h1' ? '# ' : t === 'h2' ? '## ' : t === 'h3' ? '### ' : t === 'h4' ? '#### ' : '';
                return (
                  <Pressable key={t} onPress={() => insertAtCursor(prefix)}
                    style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10,
                      backgroundColor: active ? '#F0C870' : '#F3EFE7',
                      borderWidth: 1, borderColor: active ? '#D4A040' : '#E0D8C8' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#8A5C00' : '#5C5048' }}>
                      {t === 'p' ? 'P' : t.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}

              <View style={divider} />

              {/* 对齐 */}
              <Pressable onPress={() => applyLineAlign('left')} style={tbBtn(fmtActive.alignLeft)}>
                <AlignLeft size={15} color={fmtActive.alignLeft ? '#8A5C00' : '#5C5048'} />
              </Pressable>
              <Pressable onPress={() => applyLineAlign('center')} style={tbBtn(fmtActive.alignCenter)}>
                <AlignCenter size={15} color={fmtActive.alignCenter ? '#8A5C00' : '#5C5048'} />
              </Pressable>
              <Pressable onPress={() => applyLineAlign('right')} style={tbBtn(fmtActive.alignRight)}>
                <AlignRight size={15} color={fmtActive.alignRight ? '#8A5C00' : '#5C5048'} />
              </Pressable>
              <Pressable onPress={() => applyLineAlign('justify')} style={tbBtn(false)}>
                <AlignJustify size={15} color="#5C5048" />
              </Pressable>

              <View style={divider} />

              {/* 字体颜色 */}
              <Pressable onPress={() => setShowColorPicker(v => !v)}
                style={[tbBtn(showColorPicker), { paddingHorizontal: 9, gap: 4, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: textColor, borderWidth: 1, borderColor: '#C8B898' }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#5C5048' }}>字色</Text>
              </Pressable>

              {/* 清除格式 */}
              <Pressable onPress={clearFormat} style={tbBtn()}>
                <Eraser size={15} color="#5C5048" />
              </Pressable>
            </View>
          </ScrollView>

          {/* ── 字色面板 ── */}
          {showColorPicker && (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
              paddingHorizontal: 14, paddingVertical: 6, gap: 8, backgroundColor: '#FAF6EE',
              borderTopWidth: 1, borderTopColor: '#EDE8DE' }}>
              <Text style={{ fontSize: 11, color: '#888' }}>字色</Text>
              {TEXT_COLORS.map(c => (
                <Pressable key={c.value} onPress={() => applyColor(c.value)}
                  style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.value,
                    borderWidth: textColor === c.value ? 2.5 : 1,
                    borderColor: textColor === c.value ? '#2C2C2C' : '#D0C8B8' }} />
              ))}
            </View>
          )}

          {/* ── 展开 / 收起 toggle ── */}
          <Pressable onPress={() => setToolbarExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 3 }}>
            <Text style={{ fontSize: 10, color: '#AAA' }}>{toolbarExpanded ? '收起' : '更多工具'}</Text>
            {toolbarExpanded ? <ChevronDown size={11} color="#AAA" /> : <ChevronUp size={11} color="#AAA" />}
          </Pressable>

          {/* ── 第二行（展开）：段落 + 插入 ── */}
          {toolbarExpanded && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ paddingHorizontal: 10, paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                {/* 列表类 */}
                <Pressable onPress={() => insertAtCursor('• ')} style={tbBtn(fmtActive.ul)}>
                  <List size={15} color={fmtActive.ul ? '#8A5C00' : '#5C5048'} />
                </Pressable>
                <Pressable onPress={() => insertAtCursor('1. ')} style={tbBtn(fmtActive.ol)}>
                  <ListOrdered size={15} color={fmtActive.ol ? '#8A5C00' : '#5C5048'} />
                </Pressable>
                <Pressable onPress={() => insertAtCursor('[ ] ')} style={tbBtn(fmtActive.todo)}>
                  {fmtActive.todo ? <CheckSquare size={15} color="#8A5C00" /> : <Square size={15} color="#5C5048" />}
                </Pressable>
                <Pressable onPress={() => insertAtCursor('> ')} style={tbBtn(fmtActive.quote)}>
                  <Quote size={15} color={fmtActive.quote ? '#8A5C00' : '#5C5048'} />
                </Pressable>

                <View style={divider} />

                {/* 缩进 */}
                <Pressable onPress={() => insertAtCursor('  ')} style={tbBtn()}>
                  <Indent size={15} color="#5C5048" />
                </Pressable>

                <View style={divider} />

                {/* 插入块 */}
                <Pressable onPress={() => insertBlock('---')} style={tbBtn()}>
                  <Minus size={15} color="#5C5048" />
                </Pressable>
                <Pressable onPress={() => insertBlock('```\n\n```')} style={tbBtn()}>
                  <Code size={15} color="#5C5048" />
                </Pressable>
                <Pressable onPress={() => insertBlock('[链接文字](https://)')} style={tbBtn()}>
                  <Link2 size={15} color="#5C5048" />
                </Pressable>
                <Pressable onPress={() => insertBlock('| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容 | 内容 | 内容 |')} style={tbBtn()}>
                  <Table2 size={15} color="#5C5048" />
                </Pressable>

                <View style={divider} />

                {/* 图片 / 附件 */}
                <Pressable onPress={() => setShowImageSourceMenu(true)}
                  style={{ padding: 8, borderRadius: 10, backgroundColor: '#B8E4C9', borderWidth: 1, borderColor: '#A0C8B0' }}>
                  {uploadingFile
                    ? <ActivityIndicator size="small" color="#3A7A58" />
                    : <ImageIcon size={15} color="#3A7A58" />}
                </Pressable>
                <Pressable onPress={insertAttachment}
                  style={{ padding: 8, borderRadius: 10, backgroundColor: '#B8D4E8', borderWidth: 1, borderColor: '#9AB8D0' }}>
                  <Paperclip size={15} color="#3A5A7A" />
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── 图片来源弹窗 ── */}
      {showImageSourceMenu && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowImageSourceMenu(false)} />
          <View style={{ backgroundColor: '#FDFAF3', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2C', textAlign: 'center', marginBottom: 4 }}>插入图片</Text>
            <Pressable onPress={() => { setShowImageSourceMenu(false); setTimeout(() => insertImage(false), 300); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F0E8', borderRadius: 16, padding: 14 }}>
              <ImageIcon size={20} color="#7A9D8C" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2C' }}>从相册选择</Text>
            </Pressable>
            <Pressable onPress={() => { setShowImageSourceMenu(false); setTimeout(() => insertImage(true), 300); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F0E8', borderRadius: 16, padding: 14 }}>
              <Camera size={20} color="#6B7EC8" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2C' }}>拍照上传</Text>
            </Pressable>
            <Pressable onPress={() => setShowImageSourceMenu(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 13, color: '#888' }}>取消</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── 保存至文件夹 ── */}
      {showFolderPicker && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FDFAF4', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 44, gap: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D8C8A8', alignSelf: 'center', marginBottom: 8 }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2C', marginBottom: 4 }}>选择保存到的文件夹</Text>
            <Pressable onPress={() => { setSelectedSaveFolderId(null); setShowFolderPicker(false); handleSave(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: selectedSaveFolderId === null ? '#FFF4E0' : '#F5F0E8', borderWidth: 1, borderColor: selectedSaveFolderId === null ? '#F0AA50' : 'transparent' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#C8BEB0' }} />
              <Text style={{ flex: 1, fontSize: 13, color: '#2C2C2C', fontWeight: selectedSaveFolderId === null ? '700' : '400' }}>不分类（未分类笔记）</Text>
            </Pressable>
            <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {availableFolders.map(f => {
                const active = selectedSaveFolderId === f.id;
                const c = f.color ?? '#F9C784';
                return (
                  <Pressable key={f.id} onPress={() => { setSelectedSaveFolderId(f.id); setShowFolderPicker(false); handleSave(f.id); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 4, backgroundColor: active ? c + '20' : '#F5F0E8', borderWidth: 1, borderColor: active ? c : 'transparent' }}>
                    <FolderOpen size={14} color={c} />
                    <Text style={{ flex: 1, fontSize: 13, color: '#2C2C2C', fontWeight: active ? '700' : '400' }}>{f.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setShowFolderPicker(false)}
              style={{ alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#F0EBE0', marginTop: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#8A8078' }}>取消</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── 导出格式选择菜单 ── */}
      {showExportMenu && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 200, justifyContent: 'flex-end' }}
          onPress={() => setShowExportMenu(false)}>
          <Pressable
            style={{ backgroundColor: '#FDFAF4', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 44, gap: 10 }}
            onPress={() => {}}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8C8A8', alignSelf: 'center', marginBottom: 6 }} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E1A14', textAlign: 'center', marginBottom: 4 }}>导出笔记</Text>
            {([
              { fmt: 'txt' as const, label: '纯文本 .txt', desc: '通用格式，所有文本编辑器可打开', icon: '📄', color: '#5A8C6A' },
              { fmt: 'pdf' as const, label: 'PDF 文件 .pdf', desc: '保留排版样式，适合打印分享', icon: '📋', color: '#E8703A' },
              { fmt: 'rtf' as const, label: 'Word 文档 .rtf', desc: '可用 Microsoft Word 打开', icon: '📝', color: '#3A6CB8' },
            ]).map(opt => (
              <Pressable key={opt.fmt} onPress={() => handleExportFormat(opt.fmt)} disabled={exporting}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F5F0E8', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#EDE8DF', opacity: exporting ? 0.5 : 1 }}>
                <Text style={{ fontSize: 28 }}>{opt.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: opt.color }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, color: '#A09888', marginTop: 2 }}>{opt.desc}</Text>
                </View>
                {exporting && <ActivityIndicator size="small" color={opt.color} />}
              </Pressable>
            ))}
            <Pressable onPress={() => setShowExportMenu(false)}
              style={{ alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: '#F0EBE0', marginTop: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#8A8078' }}>取消</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}


