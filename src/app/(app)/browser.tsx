/**
 * browser.tsx — 心理资源浏览器（增强版）
 *
 * 功能：搜索/URL 打开、收藏夹（分组）、浏览历史、备课资源共享平台
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput,
  KeyboardAvoidingView, FlatList, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Search, Globe, ExternalLink, Bookmark,
  History, X, Plus, Folder, Trash2, Download, Share2,
  ChevronDown, ChevronRight,
} from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/client/supabase';

// ── 类型 ──────────────────────────────────────────────────────────
interface BookmarkItem { id: string; label: string; url: string; desc: string; }
interface BookmarkGroup { id: string; name: string; color: string; items: BookmarkItem[]; }
interface HistoryItem { id: string; label: string; url: string; time: number; }
interface SharedResource {
  id: string; title: string; description: string | null;
  file_type: string; storage_path: string | null; url: string | null;
  size_bytes: number | null; download_count: number; created_at: string;
}

// ── 默认收藏夹数据 ────────────────────────────────────────────────
const DEFAULT_BOOKMARKS: BookmarkGroup[] = [
  {
    id: 'mental-health', name: '🧠 心理健康', color: '#9B8EC4',
    items: [
      { id: 'xinli001', label: '壹心理', url: 'https://www.xinli001.com', desc: '专业心理咨询与科普平台' },
      { id: 'jiandan', label: '简单心理', url: 'https://www.jiandanxinli.com', desc: '在线心理咨询预约' },
      { id: 'who', label: 'WHO 心理健康', url: 'https://www.who.int/zh/news-room/fact-sheets/detail/mental-health-strengthening-our-response', desc: '世卫组织心理健康资讯' },
    ],
  },
  {
    id: 'science', name: '📚 心理科普', color: '#7A9D8C',
    items: [
      { id: 'zhihu', label: '知乎心理学', url: 'https://www.zhihu.com/topic/19552321', desc: '心理学话题讨论与科普' },
      { id: 'baidu-health', label: '百度健康', url: 'https://health.baidu.com', desc: '健康科普知识库' },
      { id: 'cps', label: '中国心理学会', url: 'http://www.cpsbeijing.org', desc: '专业学术资源' },
    ],
  },
  {
    id: 'crisis', name: '🆘 危机援助', color: '#E88A7D',
    items: [
      { id: 'crisis', label: '北京心理危机研究院', url: 'http://www.crisis.org.cn', desc: '自杀干预与危机支持' },
      { id: 'hope24', label: '希望24热线', url: 'https://www.hope24.cn', desc: '全天候心理援助热线' },
    ],
  },
  {
    id: 'mindful', name: '🧘 正念冥想', color: '#E8A365',
    items: [
      { id: 'headspace', label: 'Headspace', url: 'https://www.headspace.com', desc: '全球领先冥想应用' },
      { id: 'qingyin', label: '清音正念', url: 'https://www.qingyin.cn', desc: '中文冥想引导资源' },
    ],
  },
  {
    id: 'test', name: '🔬 心理测评', color: '#5B9BD5',
    items: [
      { id: 'psytest', label: '心理测试网', url: 'https://www.psytest.cn', desc: '专业心理量表在线测评' },
      { id: 'psychtoday', label: 'Psychology Today', url: 'https://www.psychologytoday.com', desc: '国际权威心理资讯' },
    ],
  },
];

const STORAGE_BOOKMARKS = 'browser_bookmarks_v2';
const STORAGE_HISTORY = 'browser_history_v2';
const FILE_TYPE_EMOJI: Record<string, string> = {
  excel: '📊', pdf: '📄', ppt: '📑', word: '📝',
  text: '📃', image: '🖼', audio: '🎵', url: '🔗', other: '📁',
};

// ── 主页面 ────────────────────────────────────────────────────────
export default function BrowserScreen() {
  const router = useRouter();
  const [inputUrl, setInputUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'history' | 'shared'>('bookmarks');
  const [bookmarkGroups, setBookmarkGroups] = useState<BookmarkGroup[]>(DEFAULT_BOOKMARKS);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ 'mental-health': true });
  const [sharedList, setSharedList] = useState<SharedResource[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);

  // 弹窗状态
  const [addBookmarkModal, setAddBookmarkModal] = useState(false);
  const [newBkLabel, setNewBkLabel] = useState('');
  const [newBkUrl, setNewBkUrl] = useState('');
  const [newBkGroup, setNewBkGroup] = useState('');
  const [addGroupModal, setAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // 加载本地存储
  useEffect(() => {
    (async () => {
      const bk = await AsyncStorage.getItem(STORAGE_BOOKMARKS);
      if (bk) setBookmarkGroups(JSON.parse(bk));
      const hist = await AsyncStorage.getItem(STORAGE_HISTORY);
      if (hist) setHistory(JSON.parse(hist));
    })();
  }, []);

  const saveBookmarks = useCallback(async (groups: BookmarkGroup[]) => {
    setBookmarkGroups(groups);
    await AsyncStorage.setItem(STORAGE_BOOKMARKS, JSON.stringify(groups));
  }, []);

  const saveHistory = useCallback(async (items: HistoryItem[]) => {
    const trimmed = items.slice(0, 100); // 最多保留100条
    setHistory(trimmed);
    await AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(trimmed));
  }, []);

  // 打开 URL
  const openUrl = useCallback(async (url: string, label?: string) => {
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = target.includes('.') ? `https://${target}` : `https://www.baidu.com/s?wd=${encodeURIComponent(target)}`;
    }
    const newItem: HistoryItem = { id: Date.now().toString(), label: label ?? target, url: target, time: Date.now() };
    const updated = [newItem, ...history.filter(h => h.url !== target)];
    await saveHistory(updated);
    await WebBrowser.openBrowserAsync(target, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  }, [history, saveHistory]);

  const handleSearch = () => {
    if (!inputUrl.trim()) return;
    openUrl(inputUrl);
    setInputUrl('');
  };

  // 收藏夹操作
  const toggleGroup = (id: string) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));

  const addBookmark = async () => {
    if (!newBkLabel.trim() || !newBkUrl.trim()) return;
    const groupId = newBkGroup || bookmarkGroups[0]?.id;
    const groups = bookmarkGroups.map(g =>
      g.id === groupId
        ? { ...g, items: [...g.items, { id: Date.now().toString(), label: newBkLabel.trim(), url: newBkUrl.trim(), desc: '' }] }
        : g
    );
    await saveBookmarks(groups);
    setAddBookmarkModal(false);
    setNewBkLabel(''); setNewBkUrl(''); setNewBkGroup('');
  };

  const deleteBookmark = async (groupId: string, itemId: string) => {
    const groups = bookmarkGroups.map(g =>
      g.id === groupId ? { ...g, items: g.items.filter(i => i.id !== itemId) } : g
    );
    await saveBookmarks(groups);
  };

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    const colors = ['#9B8EC4', '#7A9D8C', '#E8A365', '#5B9BD5', '#C4856A', '#E88A7D'];
    const newGroup: BookmarkGroup = {
      id: Date.now().toString(),
      name: newGroupName.trim(),
      color: colors[bookmarkGroups.length % colors.length],
      items: [],
    };
    await saveBookmarks([...bookmarkGroups, newGroup]);
    setAddGroupModal(false);
    setNewGroupName('');
  };

  const clearHistory = async () => {
    await saveHistory([]);
  };

  // 加载共享资源
  const loadShared = useCallback(async () => {
    setSharedLoading(true);
    const { data } = await supabase
      .from('shared_resources')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setSharedList(data ?? []);
    setSharedLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'shared') loadShared();
  }, [activeTab, loadShared]);

  const downloadShared = async (item: SharedResource) => {
    const urlToOpen = item.url ?? (item.storage_path
      ? supabase.storage.from('shared-resources').getPublicUrl(item.storage_path).data.publicUrl
      : null);
    if (!urlToOpen) return;
    await supabase.from('shared_resources').update({ download_count: item.download_count + 1 }).eq('id', item.id);
    openUrl(urlToOpen, item.title);
  };

  const formatBytes = (b: number | null) => {
    if (!b) return '';
    if (b < 1024) return `${b}B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
    return `${(b / 1048576).toFixed(1)}MB`;
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (d.toDateString() === now.toDateString()) return `今天 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

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
        <Globe size={18} color="#9B8EC4" style={{ marginRight: 6 }} />
        <Text className="text-foreground font-bold text-lg flex-1">心理资源浏览器</Text>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior="padding">
        {/* 搜索栏 */}
        <View className="px-4 pt-3 pb-2">
          <View
            className="bg-card rounded-2xl flex-row items-center px-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }] }}
          >
            <Search size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              className="flex-1 text-foreground text-sm"
              style={{ paddingVertical: 14 }}
              placeholder="输入网址或搜索关键词…"
              placeholderTextColor="#9CA3AF"
              value={inputUrl}
              onChangeText={setInputUrl}
              onSubmitEditing={handleSearch}
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              underlineColorAndroid="transparent"
            />
            {inputUrl.length > 0 && (
              <>
                <Pressable onPress={() => setInputUrl('')} className="p-1 mr-1">
                  <X size={14} color="#9CA3AF" />
                </Pressable>
                <Pressable onPress={handleSearch} className="bg-primary rounded-xl px-3 py-1.5">
                  <Text className="text-primary-foreground text-xs font-semibold">前往</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Tab 切换 */}
        <View className="flex-row px-4 pb-2 gap-2">
          {[
            { id: 'bookmarks', label: '收藏夹', icon: Bookmark },
            { id: 'history', label: '历史记录', icon: History },
            { id: 'shared', label: '备课资源共享', icon: Share2 },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id as any)}
                className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${active ? 'bg-primary' : 'bg-muted'}`}
              >
                <Icon size={13} color={active ? '#fff' : '#6B7280'} />
                <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-muted-foreground'}`}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 收藏夹 ── */}
          {activeTab === 'bookmarks' && (
            <View className="gap-3">
              {/* 操作栏 */}
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setAddBookmarkModal(true)}
                  className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-2"
                >
                  <Plus size={14} color="#9B8EC4" />
                  <Text className="text-primary text-xs font-semibold">添加书签</Text>
                </Pressable>
                <Pressable
                  onPress={() => setAddGroupModal(true)}
                  className="flex-row items-center gap-1.5 bg-muted rounded-xl px-3 py-2"
                >
                  <Folder size={14} color="#6B7280" />
                  <Text className="text-muted-foreground text-xs font-semibold">新建分组</Text>
                </Pressable>
              </View>

              {bookmarkGroups.map(group => (
                <View
                  key={group.id}
                  className="bg-card rounded-2xl overflow-hidden"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                >
                  <Pressable
                    onPress={() => toggleGroup(group.id)}
                    className="flex-row items-center px-4 py-3 border-b border-border"
                  >
                    <Text className="font-bold text-sm text-foreground flex-1">{group.name}</Text>
                    <Text className="text-muted-foreground text-xs mr-2">{group.items.length}个</Text>
                    {expandedGroups[group.id] ? <ChevronDown size={16} color="#9CA3AF" /> : <ChevronRight size={16} color="#9CA3AF" />}
                  </Pressable>
                  {expandedGroups[group.id] && group.items.map((site, idx, arr) => (
                    <View
                      key={site.id}
                      className={`flex-row items-center px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <Pressable
                        onPress={() => openUrl(site.url, site.label)}
                        className="flex-1 flex-row items-center"
                      >
                        <View
                          className="w-8 h-8 rounded-xl items-center justify-center mr-3 flex-shrink-0"
                          style={{ backgroundColor: `${group.color}18` }}
                        >
                          <Globe size={14} color={group.color} />
                        </View>
                        <View className="flex-1 mr-2">
                          <Text className="text-foreground text-sm font-medium">{site.label}</Text>
                          {site.desc ? <Text className="text-muted-foreground text-xs mt-0.5">{site.desc}</Text> : null}
                        </View>
                        <ExternalLink size={13} color="#D1D5DB" />
                      </Pressable>
                      <Pressable
                        onPress={() => deleteBookmark(group.id, site.id)}
                        className="ml-3 p-1"
                      >
                        <Trash2 size={14} color="#E88A7D" />
                      </Pressable>
                    </View>
                  ))}
                  {expandedGroups[group.id] && group.items.length === 0 && (
                    <View className="px-4 py-3">
                      <Text className="text-muted-foreground text-xs">暂无书签，点击「添加书签」</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── 历史记录 ── */}
          {activeTab === 'history' && (
            <View className="gap-3">
              {history.length > 0 && (
                <Pressable onPress={clearHistory} className="flex-row items-center gap-1.5 self-end">
                  <Trash2 size={13} color="#E88A7D" />
                  <Text className="text-destructive text-xs">清空历史</Text>
                </Pressable>
              )}
              {history.length === 0 ? (
                <View className="items-center py-16 gap-3">
                  <History size={40} color="#D1D5DB" />
                  <Text className="text-muted-foreground text-sm">暂无浏览历史</Text>
                </View>
              ) : (
                <View
                  className="bg-card rounded-2xl overflow-hidden"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                >
                  {history.map((item, idx, arr) => (
                    <Pressable
                      key={item.id}
                      onPress={() => openUrl(item.url, item.label)}
                      className={`flex-row items-center px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <View className="w-8 h-8 rounded-xl items-center justify-center mr-3 bg-muted flex-shrink-0">
                        <Globe size={14} color="#9CA3AF" />
                      </View>
                      <View className="flex-1 mr-2">
                        <Text className="text-foreground text-sm font-medium" numberOfLines={1}>{item.label}</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{item.url}</Text>
                      </View>
                      <Text className="text-muted-foreground text-xs">{formatTime(item.time)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── 备课资源共享 ── */}
          {activeTab === 'shared' && (
            <View className="gap-3">
              <View className="bg-amber-50 rounded-2xl p-3.5 flex-row items-start gap-2">
                <Text>📢</Text>
                <Text className="text-amber-700 text-xs leading-5 flex-1">
                  教师可在「学苑 → 心理课程」上传并共享备课资源，所有人均可在此浏览下载。
                </Text>
              </View>

              {sharedLoading ? (
                <View className="items-center py-16">
                  <Text className="text-muted-foreground text-sm">加载中…</Text>
                </View>
              ) : sharedList.length === 0 ? (
                <View className="items-center py-16 gap-3">
                  <Share2 size={40} color="#D1D5DB" />
                  <Text className="text-muted-foreground text-sm">暂无共享资源</Text>
                  <Text className="text-muted-foreground text-xs text-center">
                    教师在学苑上传后，资源会出现在这里
                  </Text>
                </View>
              ) : (
                <View
                  className="bg-card rounded-2xl overflow-hidden"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                >
                  {sharedList.map((item, idx, arr) => (
                    <View
                      key={item.id}
                      style={{
                        paddingHorizontal: 16,
                        paddingTop: 14,
                        paddingBottom: 14,
                        borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                        borderBottomColor: 'rgba(0,0,0,0.06)',
                      }}
                    >
                      {/* 文件信息行 */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{
                          width: 44, height: 44, borderRadius: 12,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: 'rgba(155,142,196,0.12)', flexShrink: 0,
                        }}>
                          <Text style={{ fontSize: 22 }}>{FILE_TYPE_EMOJI[item.file_type] ?? '📁'}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            numberOfLines={2}
                            style={{ fontSize: 13, fontWeight: '600', color: '#1A1A2E', lineHeight: 18 }}
                          >{item.title}</Text>
                          {item.description ? (
                            <Text
                              numberOfLines={1}
                              style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}
                            >{item.description}</Text>
                          ) : null}
                          <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                            {item.file_type.toUpperCase()}
                            {item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ''}
                            {` · ${item.download_count}次下载`}
                          </Text>
                        </View>
                      </View>
                      {/* 操作按钮独占一行，避免覆盖文件信息 */}
                      <Pressable
                        onPress={() => downloadShared(item)}
                        style={{
                          marginTop: 10,
                          backgroundColor: 'rgba(155,142,196,0.12)',
                          borderRadius: 12,
                          paddingVertical: 9,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Download size={14} color="#9B8EC4" />
                        <Text style={{ fontSize: 13, color: '#9B8EC4', fontWeight: '600' }}>打开 / 下载</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <Text className="text-muted-foreground text-xs text-center leading-5 mt-6">
            网页内容由第三方提供，与微光心愈无关{'\n'}请注意个人隐私安全
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── 添加书签 Modal ── */}
      <Modal visible={addBookmarkModal} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/40" onPress={() => setAddBookmarkModal(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-8">
          <Text className="text-foreground font-bold text-base mb-4">添加书签</Text>
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-3"
            placeholder="书签名称"
            placeholderTextColor="#9CA3AF"
            value={newBkLabel}
            onChangeText={setNewBkLabel}
          />
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-3"
            placeholder="网址 (https://...)"
            placeholderTextColor="#9CA3AF"
            value={newBkUrl}
            onChangeText={setNewBkUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text className="text-muted-foreground text-xs mb-2">选择分组</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              {bookmarkGroups.map(g => (
                <Pressable
                  key={g.id}
                  onPress={() => setNewBkGroup(g.id)}
                  className={`px-3 py-2 rounded-xl ${newBkGroup === g.id || (!newBkGroup && g.id === bookmarkGroups[0]?.id) ? 'bg-primary' : 'bg-muted'}`}
                >
                  <Text className={`text-xs font-semibold ${newBkGroup === g.id || (!newBkGroup && g.id === bookmarkGroups[0]?.id) ? 'text-white' : 'text-muted-foreground'}`}>{g.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Pressable onPress={addBookmark} className="bg-primary rounded-xl py-3 items-center">
            <Text className="text-primary-foreground font-bold text-sm">保存</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── 新建分组 Modal ── */}
      <Modal visible={addGroupModal} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/40" onPress={() => setAddGroupModal(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-8">
          <Text className="text-foreground font-bold text-base mb-4">新建收藏夹分组</Text>
          <TextInput
            className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-4"
            placeholder="分组名称 (如：学习资源)"
            placeholderTextColor="#9CA3AF"
            value={newGroupName}
            onChangeText={setNewGroupName}
          />
          <Pressable onPress={addGroup} className="bg-primary rounded-xl py-3 items-center">
            <Text className="text-primary-foreground font-bold text-sm">创建</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
