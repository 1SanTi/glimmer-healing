/**
 * lesson-center.tsx — 个人备课中心
 *
 * 支持上传任意文件（PDF/PPT/Word/Excel/图片/音频）
 * 文件夹管理（含重命名）· 面包屑导航 · 移动/复制/删除 · 签名URL打开 · 一键共享
 */

import { useState, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type WebViewType from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft, FolderOpen, Trash2,
  Copy, MoveRight, Link, ChevronRight, X, Share2,
  FileText, ExternalLink, Pencil, Sparkles,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  cacheDirectory, copyAsync, readAsStringAsync, deleteAsync, EncodingType,
  downloadAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';

// ── 类型 ──────────────────────────────────────────────────────────
interface LessonFolder {
  id: string; user_id: string; name: string;
  parent_id: string | null; created_at: string;
}
interface LessonFile {
  id: string; user_id: string; folder_id: string | null;
  name: string; file_type: string; storage_path: string | null;
  url: string | null; size_bytes: number | null; created_at: string;
}

// ── 文件类型映射 ──────────────────────────────────────────────────
const EXT_TO_TYPE: Record<string, string> = {
  pdf: 'pdf', ppt: 'ppt', pptx: 'ppt', pps: 'ppt', ppsx: 'ppt',
  doc: 'word', docx: 'word', odt: 'word',
  xls: 'excel', xlsx: 'excel', csv: 'excel',
  txt: 'text', md: 'text',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', heic: 'image',
  mp3: 'audio', m4a: 'audio', wav: 'audio', aac: 'audio', ogg: 'audio',
};
const TYPE_EMOJI: Record<string, string> = {
  pdf: '📄', ppt: '📑', word: '📝', excel: '📊',
  text: '📃', image: '🖼', audio: '🎵', url: '🔗', other: '📁',
};
const TYPE_COLOR: Record<string, string> = {
  pdf: '#E88A7D', ppt: '#E8A365', word: '#5B9BD5', excel: '#7A9D8C',
  text: '#9B8EC4', image: '#C4856A', audio: '#D4A5C4', url: '#A5D4C4', other: '#9CA3AF',
};

// Google Docs 在线预览 & WPS 在线预览工具函数
const OFFICE_EXTS = new Set(['pdf', 'ppt', 'pptx', 'pps', 'ppsx', 'doc', 'docx', 'xls', 'xlsx']);

function buildPreviewUrl(signedUrl: string, ext: string): string {
  if (OFFICE_EXTS.has(ext)) {
    // Google Docs Viewer（无需登录，支持 pdf/office）
    return `https://docs.google.com/viewer?url=${encodeURIComponent(signedUrl)}&embedded=true`;
  }
  return signedUrl;
}

function extFromName(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function typeFromName(name: string): string {
  return EXT_TO_TYPE[extFromName(name)] ?? 'other';
}

function formatBytes(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1048576).toFixed(1)}MB`;
}

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac',
  txt: 'text/plain', md: 'text/markdown',
};
function getMimeType(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] ?? 'application/octet-stream';
}

// ── 文件预览状态 ──────────────────────────────────────────────────
interface PreviewState {
  visible: boolean;
  url: string;
  title: string;
  isUrl: boolean; // true = 网址链接，显示浏览器控件
}

// ── 内嵌文件预览弹窗 ──────────────────────────────────────────────
function FilePreviewModal({
  state, onClose,
}: { state: PreviewState; onClose: () => void }) {
  const webRef = useRef<WebViewType>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Web 平台：用 iframe 替代 WebView
  if (process.env.EXPO_OS === 'web') {
    return (
      <Modal visible={state.visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#16213e', gap: 10 }}>
            <Pressable onPress={onClose} style={{ padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ color: '#fff', fontSize: 16 }}>←</Text>
            </Pressable>
            <Text style={{ flex: 1, color: '#fff', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{state.title}</Text>
          </View>
          {/* @ts-ignore — iframe only exists in web branch */}
          <iframe src={state.url} style={{ flex: 1, border: 'none', width: '100%', height: '100%' }} />
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={state.visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
        {/* 顶部导航栏 */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 12, paddingVertical: 10,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1, borderBottomColor: '#EEE8F6',
          gap: 8,
        }}>
          <Pressable
            onPress={onClose}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3EEFF', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 18, color: '#9B8EC4' }}>←</Text>
          </Pressable>
          <Text style={{ flex: 1, color: '#1F1F2E', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
            {state.title}
          </Text>
          {loading && <ActivityIndicator size="small" color="#9B8EC4" />}
        </View>

        {/* 错误提示 */}
        {hasError && (
          <View style={{ backgroundColor: '#FFF1F0', borderBottomWidth: 1, borderBottomColor: '#FECDD3', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, color: '#E11D48', fontSize: 13 }}>文件加载失败，请检查文件是否损坏或格式暂不支持</Text>
            <Pressable onPress={() => { setHasError(false); setLoading(true); webRef.current?.reload(); }}
              style={{ backgroundColor: '#E11D48', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
            >
              <Text style={{ color: '#fff', fontSize: 12 }}>重试</Text>
            </Pressable>
          </View>
        )}

        {/* WebView 主体 */}
        <WebView
          ref={webRef}
          source={{ uri: state.url }}
          style={{ flex: 1 }}
          startInLoadingState={false}
          onLoadStart={() => { setLoading(true); setHasError(false); }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setHasError(true); }}
          onNavigationStateChange={(nav) => {
            setCanGoBack(nav.canGoBack);
            setCanGoForward(nav.canGoForward);
          }}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          scalesPageToFit
        />

        {/* 加载遮罩 */}
        {loading && !hasError && (
          <View style={{ position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,247,255,0.92)' }}>
            <ActivityIndicator size="large" color="#9B8EC4" />
            <Text style={{ marginTop: 12, color: '#9B8EC4', fontSize: 13 }}>文件加载中…</Text>
          </View>
        )}

        {/* 网址类浏览器控制栏 */}
        {state.isUrl && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 10,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1, borderTopColor: '#EEE8F6',
            gap: 8,
          }}>
            <Pressable
              onPress={() => webRef.current?.goBack()}
              disabled={!canGoBack}
              style={{ padding: 8, borderRadius: 12, backgroundColor: canGoBack ? '#F3EEFF' : '#F5F5F5' }}
            >
              <Text style={{ fontSize: 16, color: canGoBack ? '#9B8EC4' : '#C4C4C4' }}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => webRef.current?.goForward()}
              disabled={!canGoForward}
              style={{ padding: 8, borderRadius: 12, backgroundColor: canGoForward ? '#F3EEFF' : '#F5F5F5' }}
            >
              <Text style={{ fontSize: 16, color: canGoForward ? '#9B8EC4' : '#C4C4C4' }}>›</Text>
            </Pressable>
            <Pressable
              onPress={() => { setLoading(true); webRef.current?.reload(); }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: '#F3EEFF' }}
            >
              <Text style={{ fontSize: 14, color: '#9B8EC4' }}>↻</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function LessonCenter() {
  const router = useRouter();
  const { session } = useSession();
  const uid = session?.user.id;

  const [folders, setFolders] = useState<LessonFolder[]>([]);
  const [files, setFiles] = useState<LessonFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');

  // 文件预览弹窗状态
  const [previewState, setPreviewState] = useState<PreviewState>({
    visible: false, url: '', title: '', isUrl: false,
  });

  // 弹窗状态
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [addUrlModal, setAddUrlModal] = useState(false);
  const [urlName, setUrlName] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [moveModal, setMoveModal] = useState(false);
  const [movingFile, setMovingFile] = useState<LessonFile | null>(null);
  const [shareModal, setShareModal] = useState(false);
  const [sharingFile, setSharingFile] = useState<LessonFile | null>(null);
  const [shareTitle, setShareTitle] = useState('');
  const [shareDesc, setShareDesc] = useState('');
  const [sharing, setSharing] = useState(false);
  // 文件夹重命名
  const [renameModal, setRenameModal] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<LessonFolder | null>(null);
  const [renameName, setRenameName] = useState('');

  // ── 数据加载 ──
  const loadData = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const [{ data: foldersData }, { data: filesData }] = await Promise.all([
      supabase.from('lesson_folders').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('lesson_files').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    ]);
    setFolders(foldersData ?? []);
    setFiles(filesData ?? []);
    setLoading(false);
  }, [uid]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── 导航 ──
  const currentFolders = folders.filter(f => f.parent_id === currentFolderId);
  const currentFiles = files.filter(f => f.folder_id === currentFolderId);

  const enterFolder = (folder: LessonFolder) => {
    setFolderStack(s => [...s, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
  };

  // 面包屑跳转到指定层级（index=-1 表示根目录）
  const goToStackIndex = (index: number) => {
    if (index < 0) {
      setFolderStack([]);
      setCurrentFolderId(null);
    } else {
      const newStack = folderStack.slice(0, index + 1);
      setFolderStack(newStack);
      setCurrentFolderId(newStack[newStack.length - 1].id);
    }
  };

  const goBack = () => goToStackIndex(folderStack.length - 2);

  // ── 新建文件夹 ──
  const createFolder = async () => {
    if (!newFolderName.trim() || !uid) return;
    await supabase.from('lesson_folders').insert({
      user_id: uid, name: newFolderName.trim(), parent_id: currentFolderId,
    });
    setNewFolderModal(false); setNewFolderName('');
    loadData();
  };

  const deleteFolder = async (folderId: string) => {
    await supabase.from('lesson_folders').delete().eq('id', folderId);
    loadData();
  };

  const renameFolder = async () => {
    if (!renamingFolder || !renameName.trim()) return;
    await supabase.from('lesson_folders').update({ name: renameName.trim() }).eq('id', renamingFolder.id);
    setRenameModal(false); setRenamingFolder(null); setRenameName('');
    loadData();
  };

  // ── 上传任意文件（DocumentPicker + expo-file-system）──
  const pickAndUpload = async () => {
    if (!uid) return;
    setError('');
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      setError('文件选择失败，请重试');
      return;
    }
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const { uri, name, mimeType, size } = asset;
    const fileType = typeFromName(name);
    const ext = name.split('.').pop()?.toLowerCase() ?? 'bin';
    // 存储路径只含 ASCII，避免中文 key 被 Supabase 拒绝
    const storagePath = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    setUploading(true);
    setUploadProgress(`正在读取 ${name}…`);

    try {
      // 先将文件复制到 cache 目录（处理 content:// Android URI）
      const cacheUri = (cacheDirectory ?? '') + `upload_${Date.now()}.${ext}`;
      await copyAsync({ from: uri, to: cacheUri });

      setUploadProgress(`正在上传 ${name}…`);

      // 用 base64 读取再转 Uint8Array，避免 fetch(content://) 失败
      const base64 = await readAsStringAsync(cacheUri, {
        encoding: EncodingType.Base64,
      });

      // atob → Uint8Array
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { error: upErr } = await supabase.storage
        .from('lesson-files')
        .upload(storagePath, bytes, {
          contentType: mimeType ?? 'application/octet-stream',
          upsert: false,
        });

      // 清理缓存
      deleteAsync(cacheUri, { idempotent: true }).catch(() => {});

      if (upErr) throw new Error(upErr.message);

      await supabase.from('lesson_files').insert({
        user_id: uid,
        folder_id: currentFolderId,
        name,
        file_type: fileType,
        storage_path: storagePath,
        size_bytes: size ?? bytes.byteLength,
      });

      setUploadProgress('');
      setUploading(false);
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setError(`上传失败：${msg}`);
      setUploadProgress('');
      setUploading(false);
    }
  };

  // ── 添加 URL ──
  const addUrl = async () => {
    if (!urlName.trim() || !urlValue.trim() || !uid) return;
    let u = urlValue.trim();
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    await supabase.from('lesson_files').insert({
      user_id: uid, folder_id: currentFolderId,
      name: urlName.trim(), file_type: 'url', url: u,
    });
    setAddUrlModal(false); setUrlName(''); setUrlValue('');
    loadData();
  };

  // ── 删除文件 ──
  const deleteFile = async (file: LessonFile) => {
    if (file.storage_path) {
      await supabase.storage.from('lesson-files').remove([file.storage_path]);
    }
    await supabase.from('lesson_files').delete().eq('id', file.id);
    loadData();
  };

  // ── 复制文件 ──
  const copyFile = async (file: LessonFile) => {
    if (!uid) return;
    await supabase.from('lesson_files').insert({
      user_id: uid, folder_id: currentFolderId,
      name: `${file.name}（副本）`, file_type: file.file_type,
      storage_path: file.storage_path, url: file.url, size_bytes: file.size_bytes,
    });
    loadData();
  };

  // ── 移动文件 ──
  const moveFile = async (targetFolderId: string | null) => {
    if (!movingFile) return;
    await supabase.from('lesson_files').update({ folder_id: targetFolderId }).eq('id', movingFile.id);
    setMoveModal(false); setMovingFile(null);
    loadData();
  };

  // ── 在线预览文件（应用内 WebView）──
  const previewFile = async (file: LessonFile) => {
    setError('');
    // 网址链接：直接在应用内 WebView 打开
    if (file.file_type === 'url' && file.url) {
      setPreviewState({ visible: true, url: file.url, title: file.name, isUrl: true });
      return;
    }
    if (!file.storage_path) return;
    setUploadProgress('正在准备预览…');
    try {
      const { data, error: signErr } = await supabase.storage
        .from('lesson-files')
        .createSignedUrl(file.storage_path, 3600);
      if (signErr || !data?.signedUrl) throw new Error(signErr?.message ?? '无法获取文件链接');
      const ext = extFromName(file.name);
      const previewUrl = buildPreviewUrl(data.signedUrl, ext);
      setPreviewState({ visible: true, url: previewUrl, title: file.name, isUrl: false });
    } catch (e: unknown) {
      setError('预览失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploadProgress('');
    }
  };

  // ── 下载文件（用系统分享/下载）──
  const downloadFile = async (file: LessonFile) => {
    setError('');
    if (file.file_type === 'url' && file.url) {
      try { await WebBrowser.openBrowserAsync(file.url); } catch { /**/ }
      return;
    }
    if (!file.storage_path) return;
    setUploadProgress('正在准备下载…');
    try {
      const { data, error: signErr } = await supabase.storage
        .from('lesson-files')
        .createSignedUrl(file.storage_path, 3600);
      if (signErr || !data?.signedUrl) throw new Error(signErr?.message ?? '无法获取文件链接');
      const ext = extFromName(file.name);
      const localUri = `${cacheDirectory ?? ''}dl_${Date.now()}.${ext}`;
      const { status } = await downloadAsync(data.signedUrl, localUri);
      if (status !== 200) throw new Error(`下载失败 (HTTP ${status})`);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localUri, { mimeType: getMimeType(ext), dialogTitle: file.name });
      } else {
        await WebBrowser.openBrowserAsync(data.signedUrl);
      }
    } catch (e: unknown) {
      setError('下载失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploadProgress('');
    }
  };

  // ── 共享到公开平台 ──
  const shareToPublic = async () => {
    if (!sharingFile || !shareTitle.trim() || !uid) return;
    setSharing(true);

    // 若是存储文件，先复制到公开 bucket
    let publicPath: string | null = null;
    let publicUrl: string | null = null;

    if (sharingFile.storage_path) {
      // 生成签名URL，然后将其作为 url 存到 shared_resources
      const { data } = await supabase.storage
        .from('lesson-files')
        .createSignedUrl(sharingFile.storage_path, 60 * 60 * 24 * 30); // 30天
      publicUrl = data?.signedUrl ?? null;
    } else if (sharingFile.url) {
      publicUrl = sharingFile.url;
    }

    const { error: shareErr } = await supabase.from('shared_resources').insert({
      uploader_id: uid,
      title: shareTitle.trim(),
      description: shareDesc.trim() || null,
      file_type: sharingFile.file_type,
      storage_path: publicPath,
      url: publicUrl,
      size_bytes: sharingFile.size_bytes ?? null,
    });

    setSharing(false);
    if (shareErr) { setError('共享失败：' + shareErr.message); return; }
    setShareModal(false); setSharingFile(null); setShareTitle(''); setShareDesc('');
  };

  // ── 未登录提示 ──
  if (!uid) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8" edges={['top']}>
        <StatusBar style="dark" />
        <Text className="text-muted-foreground text-center text-sm">请登录后使用个人备课中心</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* 顶栏 */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => folderStack.length > 0 ? goBack() : router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-foreground font-bold text-base" numberOfLines={1}>
            {folderStack.length === 0 ? '📋 个人备课中心' : folderStack[folderStack.length - 1].name}
          </Text>
          {/* 面包屑导航——每一段均可点击 */}
          {folderStack.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-0.5">
                <Pressable onPress={() => goToStackIndex(-1)}>
                  <Text className="text-primary text-xs">根目录</Text>
                </Pressable>
                {folderStack.map((seg, idx) => (
                  <View key={seg.id} className="flex-row items-center">
                    <Text className="text-muted-foreground text-xs mx-0.5">›</Text>
                    <Pressable onPress={() => goToStackIndex(idx)}>
                      <Text className={`text-xs ${idx === folderStack.length - 1 ? 'text-foreground font-medium' : 'text-primary'}`}>
                        {seg.name}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* 操作栏 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-border flex-grow-0">
        <View className="flex-row px-4 py-2.5 gap-2">
          <Pressable
            onPress={() => setNewFolderModal(true)}
            className="flex-row items-center gap-1.5 bg-amber-50 rounded-xl px-3 py-2"
          >
            <FolderOpen size={13} color="#E8A365" />
            <Text className="text-amber-700 text-xs font-semibold">新建文件夹</Text>
          </Pressable>
          <Pressable
            onPress={pickAndUpload}
            disabled={uploading}
            className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-2"
          >
            {uploading
              ? <ActivityIndicator size="small" color="#9B8EC4" />
              : <FileText size={13} color="#9B8EC4" />
            }
            <Text className="text-primary text-xs font-semibold">
              {uploading ? uploadProgress : '上传文件'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setUrlName(''); setUrlValue(''); setAddUrlModal(true); }}
            className="flex-row items-center gap-1.5 bg-muted rounded-xl px-3 py-2"
          >
            <Link size={13} color="#6B7280" />
            <Text className="text-muted-foreground text-xs font-semibold">添加网址</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 心绘小屋快捷入口 */}
      <Pressable
        onPress={() => router.push('/(app)/painting-house' as any)}
        className="mx-4 my-2 rounded-2xl p-4 flex-row items-center gap-3"
        style={{ backgroundColor: 'rgba(155,142,196,0.10)', borderWidth: 1.5, borderColor: 'rgba(155,142,196,0.25)' }}
      >
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: 'rgba(155,142,196,0.18)', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 20 }}>🎨</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2456' }}>心绘小屋</Text>
          <Text style={{ fontSize: 11, color: '#8A84A8', marginTop: 1 }}>AI 一键生成教学漫画与科普图</Text>
        </View>
        <Sparkles size={16} color="#9B8EC4" />
      </Pressable>

      {/* 支持格式提示 */}
      <View className="px-4 py-2 border-b border-border">
        <Text className="text-muted-foreground text-xs">
          支持：PDF · PPT · Word · Excel · 图片 · 音频 · 网址链接
        </Text>
      </View>

      {error ? (
        <View className="mx-4 mt-2 bg-destructive/10 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <Text className="text-destructive text-xs flex-1">{error}</Text>
          <Pressable onPress={() => setError('')}><X size={14} color="#ef4444" /></Pressable>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#9B8EC4" />
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}
        >
          {/* 文件夹区 */}
          {currentFolders.length > 0 && (
            <View className="mb-4">
              <Text className="text-muted-foreground text-xs font-semibold mb-2 ml-1">📁 文件夹</Text>
              <View className="gap-2">
                {currentFolders.map(folder => (
                  <View
                    key={folder.id}
                    className="bg-card rounded-2xl flex-row items-center px-4 py-3"
                    style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.05)' }] }}
                  >
                    <Pressable className="flex-1 flex-row items-center gap-3" onPress={() => enterFolder(folder)}>
                      <View className="w-10 h-10 rounded-xl bg-amber-50 items-center justify-center">
                        <FolderOpen size={20} color="#E8A365" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground font-semibold text-sm">{folder.name}</Text>
                        <Text className="text-muted-foreground text-xs">
                          {files.filter(f => f.folder_id === folder.id).length} 个文件
                        </Text>
                      </View>
                      <ChevronRight size={16} color="#D1D5DB" />
                    </Pressable>
                    <Pressable onPress={() => deleteFolder(folder.id)} className="ml-1 p-2">
                      <Trash2 size={15} color="#E88A7D" />
                    </Pressable>
                    <Pressable
                      onPress={() => { setRenamingFolder(folder); setRenameName(folder.name); setRenameModal(true); }}
                      className="p-2"
                    >
                      <Pencil size={15} color="#9B8EC4" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 文件区 */}
          {currentFiles.length > 0 && (
            <View className="mb-4">
              <Text className="text-muted-foreground text-xs font-semibold mb-2 ml-1">📄 文件</Text>
              <View className="gap-2">
                {currentFiles.map(file => {
                  const color = TYPE_COLOR[file.file_type] ?? '#9CA3AF';
                  const emoji = TYPE_EMOJI[file.file_type] ?? '📁';
                  return (
                    <View
                      key={file.id}
                      className="bg-card rounded-2xl px-4 py-3.5"
                      style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.05)' }] }}
                    >
                      {/* 文件头：点击预览 */}
                      <Pressable className="flex-row items-center gap-3" onPress={() => previewFile(file)}>
                        <View
                          className="w-11 h-11 rounded-xl items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${color}20` }}
                        >
                          <Text style={{ fontSize: 22 }}>{emoji}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-foreground font-medium text-sm" numberOfLines={2}>{file.name}</Text>
                          <View className="flex-row items-center gap-2 mt-0.5">
                            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}20` }}>
                              <Text style={{ fontSize: 10, color, fontWeight: '600' }}>
                                {file.file_type.toUpperCase()}
                              </Text>
                            </View>
                            {file.size_bytes ? (
                              <Text className="text-muted-foreground text-xs">{formatBytes(file.size_bytes)}</Text>
                            ) : null}
                          </View>
                        </View>
                        <ExternalLink size={14} color="#D1D5DB" />
                      </Pressable>

                      {/* 操作行：打开·下载·移动·共享·删除 */}
                      <View className="flex-row gap-1.5 mt-2.5 pt-2.5 border-t border-border">
                        {/* 打开（在线预览） */}
                        <Pressable
                          onPress={() => previewFile(file)}
                          className="flex-1 flex-row items-center justify-center gap-1 bg-primary/10 rounded-xl py-1.5"
                        >
                          <ExternalLink size={11} color="#9B8EC4" />
                          <Text className="text-primary text-xs font-medium">打开</Text>
                        </Pressable>
                        {/* 下载 */}
                        <Pressable
                          onPress={() => downloadFile(file)}
                          className="flex-1 flex-row items-center justify-center gap-1 bg-muted rounded-xl py-1.5"
                        >
                          <Share2 size={11} color="#6B7280" />
                          <Text className="text-muted-foreground text-xs font-medium">下载</Text>
                        </Pressable>
                        {/* 移动 */}
                        <Pressable
                          onPress={() => { setMovingFile(file); setMoveModal(true); }}
                          className="flex-1 flex-row items-center justify-center gap-1 bg-muted rounded-xl py-1.5"
                        >
                          <MoveRight size={11} color="#6B7280" />
                          <Text className="text-muted-foreground text-xs font-medium">移动</Text>
                        </Pressable>
                        {/* 共享 */}
                        <Pressable
                          onPress={() => { setSharingFile(file); setShareTitle(file.name); setShareModal(true); }}
                          className="flex-1 flex-row items-center justify-center gap-1 bg-muted rounded-xl py-1.5"
                        >
                          <Copy size={11} color="#6B7280" />
                          <Text className="text-muted-foreground text-xs font-medium">共享</Text>
                        </Pressable>
                        {/* 删除 */}
                        <Pressable
                          onPress={() => deleteFile(file)}
                          className="flex-1 flex-row items-center justify-center gap-1 bg-destructive/10 rounded-xl py-1.5"
                        >
                          <Trash2 size={11} color="#E88A7D" />
                          <Text className="text-destructive text-xs font-medium">删除</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* 空状态 */}
          {currentFolders.length === 0 && currentFiles.length === 0 && (
            <View className="items-center py-16 gap-3">
              <FolderOpen size={52} color="#D1D5DB" />
              <Text className="text-foreground font-semibold text-base">当前目录为空</Text>
              <Text className="text-muted-foreground text-xs text-center leading-5">
                点击「上传文件」选择 PDF、PPT、Word、{'\n'}Excel、图片、音频等任意格式
              </Text>
              <Pressable
                onPress={pickAndUpload}
                className="mt-2 bg-primary rounded-2xl px-6 py-3 flex-row items-center gap-2"
              >
                <FileText size={16} color="#fff" />
                <Text className="text-white font-semibold text-sm">立即上传文件</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── 文件夹重命名 Modal ── */}
      <Modal visible={renameModal} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/40" onPress={() => setRenameModal(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10">
          <Text className="text-foreground font-bold text-base mb-4">重命名文件夹</Text>
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-4"
            placeholder="新名称"
            placeholderTextColor="#9CA3AF"
            value={renameName}
            onChangeText={setRenameName}
            onSubmitEditing={renameFolder}
            autoFocus
          />
          <Pressable onPress={renameFolder} className="bg-primary rounded-xl py-3 items-center">
            <Text className="text-primary-foreground font-bold text-sm">确认重命名</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── 新建文件夹 Modal ── */}
      <Modal visible={newFolderModal} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/40" onPress={() => setNewFolderModal(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10">
          <Text className="text-foreground font-bold text-base mb-4">新建文件夹</Text>
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-4"
            placeholder="文件夹名称"
            placeholderTextColor="#9CA3AF"
            value={newFolderName}
            onChangeText={setNewFolderName}
            onSubmitEditing={createFolder}
          />
          <Pressable onPress={createFolder} className="bg-primary rounded-xl py-3 items-center">
            <Text className="text-primary-foreground font-bold text-sm">创建</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── 添加 URL Modal ── */}
      <Modal visible={addUrlModal} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/40" onPress={() => setAddUrlModal(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10">
          <Text className="text-foreground font-bold text-base mb-4">添加网址链接</Text>
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-3"
            placeholder="链接名称"
            placeholderTextColor="#9CA3AF"
            value={urlName}
            onChangeText={setUrlName}
          />
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-4"
            placeholder="https://..."
            placeholderTextColor="#9CA3AF"
            value={urlValue}
            onChangeText={setUrlValue}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Pressable onPress={addUrl} className="bg-primary rounded-xl py-3 items-center">
            <Text className="text-primary-foreground font-bold text-sm">保存</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── 移动文件 Modal ── */}
      <Modal visible={moveModal} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/40" onPress={() => setMoveModal(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10">
          <Text className="text-foreground font-bold text-base mb-1">移动到</Text>
          <Text className="text-muted-foreground text-xs mb-4">选择目标文件夹</Text>
          <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
            <Pressable
              onPress={() => moveFile(null)}
              className="flex-row items-center gap-3 px-3 py-3 bg-muted rounded-xl mb-2"
            >
              <FolderOpen size={16} color="#9CA3AF" />
              <Text className="text-foreground text-sm">根目录</Text>
            </Pressable>
            {folders.filter(f => f.id !== movingFile?.folder_id).map(folder => (
              <Pressable
                key={folder.id}
                onPress={() => moveFile(folder.id)}
                className="flex-row items-center gap-3 px-3 py-3 bg-muted rounded-xl mb-2"
              >
                <FolderOpen size={16} color="#E8A365" />
                <Text className="text-foreground text-sm">{folder.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── 共享 Modal ── */}
      <Modal visible={shareModal} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/40" onPress={() => setShareModal(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10">
          <Text className="text-foreground font-bold text-base mb-1">共享到备课资源平台</Text>
          <Text className="text-muted-foreground text-xs mb-4">所有人均可浏览和下载此资源</Text>
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-3"
            placeholder="资源标题"
            placeholderTextColor="#9CA3AF"
            value={shareTitle}
            onChangeText={setShareTitle}
          />
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-4"
            placeholder="简介（可选）"
            placeholderTextColor="#9CA3AF"
            value={shareDesc}
            onChangeText={setShareDesc}
            multiline
            numberOfLines={2}
          />
          <Pressable
            onPress={shareToPublic}
            disabled={sharing}
            className="bg-primary rounded-xl py-3 items-center"
          >
            {sharing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text className="text-primary-foreground font-bold text-sm">📢 发布共享</Text>
            }
          </Pressable>
        </View>
      </Modal>

      {/* 文件预览弹窗（应用内全屏）*/}
      <FilePreviewModal
        state={previewState}
        onClose={() => setPreviewState(s => ({ ...s, visible: false }))}
      />
    </SafeAreaView>
  );
}
