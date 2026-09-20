/**
 * audio-library.tsx — 音频库页面
 *
 * 功能：导入本地音频、播放预览、配置用途（含软件背景音乐）
 * 背景音乐通过 BgMusicContext 跨页面持续播放。
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Music2, Trash2, Settings2, Play, Pause, Check, Pencil } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import {
  getAllAudios, addAudio, deleteAudio, updateAudioUsages, updateAudioName,
  formatDuration, type AudioItem, type AudioUsage,
} from '@/lib/audioStore';
import { useBgMusic } from '@/lib/bgMusicContext';

// ── 用途标签配置（含背景音乐）──────────────────────────────────
const USAGE_CONFIG: { key: AudioUsage; label: string; emoji: string; color: string }[] = [
  { key: 'background',       label: '软件背景音乐',   emoji: '🎶', color: '#E8A365' },
  { key: 'meditation',       label: '冥想背景音',     emoji: '🧘', color: '#7A9D8C' },
  { key: 'test',             label: '测评背景音',     emoji: '📊', color: '#9B8EC4' },
  { key: 'breath',           label: '呼吸训练音',     emoji: '🌊', color: '#7AB5D8' },
  { key: 'hope_tree',        label: '希望树背景音',   emoji: '🌳', color: '#4EAA9C' },
  { key: 'sleep',            label: '沉浸式睡眠背景音', emoji: '🌙', color: '#6B7EC8' },
  { key: 'particle_healing', label: '粒子疗愈背景音', emoji: '✨', color: '#7C3AED' },
];

// ── 用途标签徽章 ─────────────────────────────────────────────────
function UsageBadge({ usage }: { usage: AudioUsage }) {
  const cfg = USAGE_CONFIG.find(c => c.key === usage)!;
  return (
    <View
      className="rounded-full px-2 py-0.5 mr-1 mb-1"
      style={{ backgroundColor: `${cfg.color}22` }}
    >
      <Text style={{ fontSize: 10, color: cfg.color, fontWeight: '600' }}>
        {cfg.emoji} {cfg.label}
      </Text>
    </View>
  );
}

// ── 播放器 Row ──────────────────────────────────────────────────
function AudioRow({
  item,
  isPlaying,
  isBgTrack,
  onPlay,
  onPause,
  onConfig,
  onDelete,
}: {
  item: AudioItem;
  isPlaying: boolean;
  isBgTrack: boolean;
  onPlay: () => void;
  onPause: () => void;
  onConfig: () => void;
  onDelete: () => void;
}) {
  return (
    <View
      className="bg-card rounded-2xl px-4 py-3.5 mb-3"
      style={{
        boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }],
        borderWidth: isBgTrack ? 1.5 : 0,
        borderColor: isBgTrack ? 'rgba(232,163,101,0.5)' : 'transparent',
      }}
    >
      {/* 背景音乐标识 */}
      {isBgTrack && (
        <View className="flex-row items-center gap-1 mb-2">
          <Text style={{ fontSize: 11, color: '#E8A365', fontWeight: '700' }}>🎶 软件背景音乐播放中</Text>
        </View>
      )}
      {/* 第一行：图标 + 名称 + 时长 */}
      <View className="flex-row items-center mb-2">
        <View className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: 'rgba(232,163,101,0.12)' }}>
          <Music2 size={20} color="#E8A365" />
        </View>
        <View className="flex-1">
          <Text className="text-foreground font-semibold text-sm" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {item.duration > 0 ? formatDuration(item.duration) : '未知时长'}
          </Text>
        </View>
        {/* 播放 / 暂停 */}
        <Pressable
          onPress={isPlaying ? onPause : onPlay}
          className="w-9 h-9 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: isPlaying ? 'rgba(232,163,101,0.18)' : 'rgba(0,0,0,0.05)' }}
        >
          {isPlaying
            ? <Pause size={16} color="#E8A365" />
            : <Play size={16} color="#6B7280" />}
        </Pressable>
        {/* 配置 */}
        <Pressable
          onPress={onConfig}
          className="w-9 h-9 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}
        >
          <Settings2 size={16} color="#9B8EC4" />
        </Pressable>
        {/* 删除 */}
        <Pressable
          onPress={onDelete}
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
        >
          <Trash2 size={16} color="#EF4444" />
        </Pressable>
      </View>

      {/* 用途标签 */}
      {item.usages.length > 0 && (
        <View className="flex-row flex-wrap mt-1 ml-13">
          {item.usages.map(u => <UsageBadge key={u} usage={u} />)}
        </View>
      )}
    </View>
  );
}

// ── 配置弹窗 ────────────────────────────────────────────────────
function ConfigModal({
  item,
  visible,
  onClose,
  onSave,
}: {
  item: AudioItem;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, usages: AudioUsage[], name: string) => void;
}) {
  const [selected, setSelected] = useState<AudioUsage[]>(item.usages);
  const [name, setName] = useState(item.name);

  const toggle = (key: AudioUsage) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onClose}
      >
        <View className="flex-1" />
        <Pressable onPress={() => { /* 阻止冒泡 */ }}>
          <View className="bg-background rounded-t-3xl px-5 pt-5 pb-10">
            {/* 拖拽指示条 */}
            <View className="w-10 h-1 bg-muted rounded-full self-center mb-5" />

            <Text className="text-foreground font-bold text-lg mb-4">音频配置</Text>

            {/* 重命名 */}
            <Text className="text-muted-foreground text-xs font-semibold mb-2 uppercase tracking-wider">
              名称
            </Text>
            <View className="flex-row items-center bg-muted rounded-xl px-3 py-2.5 mb-5">
              <Pencil size={14} color="#9CA3AF" />
              <TextInput
                value={name}
                onChangeText={setName}
                className="flex-1 text-foreground text-sm ml-2"
                style={{ fontSize: 14 }}
                placeholder="输入音频名称"
                placeholderTextColor="#9CA3AF"
                maxLength={40}
              />
            </View>

            {/* 用途选择 */}
            <Text className="text-muted-foreground text-xs font-semibold mb-3 uppercase tracking-wider">
              使用场景（可多选）
            </Text>
            <View className="gap-2 mb-6">
              {USAGE_CONFIG.map(cfg => {
                const checked = selected.includes(cfg.key);
                return (
                  <Pressable
                    key={cfg.key}
                    onPress={() => toggle(cfg.key)}
                    className="flex-row items-center px-4 py-3.5 rounded-2xl"
                    style={{ backgroundColor: checked ? `${cfg.color}18` : 'rgba(0,0,0,0.03)' }}
                  >
                    <Text className="text-2xl mr-3">{cfg.emoji}</Text>
                    <Text
                      className="flex-1 font-medium text-sm"
                      style={{ color: checked ? cfg.color : '#4B5563' }}
                    >
                      {cfg.label}
                    </Text>
                    {checked && (
                      <View
                        className="w-6 h-6 rounded-full items-center justify-center"
                        style={{ backgroundColor: cfg.color }}
                      >
                        <Check size={14} color="white" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* 保存按钮 */}
            <Pressable
              onPress={() => {
                onSave(item.id, selected, name.trim() || item.name);
                onClose();
              }}
              className="bg-primary rounded-2xl py-4 items-center"
            >
              <Text className="text-primary-foreground font-bold text-base">保存配置</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── 删除确认弹窗 ─────────────────────────────────────────────────
function DeleteConfirmModal({
  visible,
  name,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/50 items-center justify-center px-8">
        <View className="bg-background rounded-3xl p-6 w-full">
          <Text className="text-foreground font-bold text-lg text-center mb-2">删除音频</Text>
          <Text className="text-muted-foreground text-sm text-center mb-6">
            确定要删除「{name}」吗？{'\n'}删除后无法恢复。
          </Text>
          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancel}
              className="flex-1 bg-muted rounded-2xl py-3.5 items-center"
            >
              <Text className="text-foreground font-semibold">取消</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 rounded-2xl py-3.5 items-center"
              style={{ backgroundColor: '#EF4444' }}
            >
              <Text className="text-white font-semibold">删除</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────
export default function AudioLibraryScreen() {
  const router = useRouter();
  const bgMusic = useBgMusic();
  const [audios, setAudios] = useState<AudioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [configItem, setConfigItem] = useState<AudioItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<AudioItem | null>(null);

  // pendingPlay：replace() 后等待 isLoaded 再 play()
  const pendingPlayRef = useRef(false);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // 等待音频加载完成后再播放（修复 replace() 后立即 play() 的竞态）
  useEffect(() => {
    if (pendingPlayRef.current && status.isLoaded) {
      pendingPlayRef.current = false;
      player.play();
    }
  }, [status.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // 播放结束时重置状态
  useEffect(() => {
    if (status.didJustFinish) {
      setPlayingId(null);
    }
  }, [status.didJustFinish]);

  useFocusEffect(
    useCallback(() => {
      void loadAudios();
    }, []),
  );

  async function loadAudios() {
    setLoading(true);
    const list = await getAllAudios();
    setAudios(list);
    setLoading(false);
  }

  // ── 导入 ─────────────────────────────────────────────────────
  async function handleImport() {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const ext = asset.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'].includes(ext)) {
        return;
      }

      const name = asset.name.replace(/\.[^.]+$/, '');
      await addAudio(asset.uri, name, 0);
      await loadAudios();
    } finally {
      setImporting(false);
    }
  }

  // ── 播放 / 暂停（预览） ──────────────────────────────────────
  function handlePlay(item: AudioItem) {
    if (playingId === item.id) {
      player.pause();
      setPlayingId(null);
      return;
    }
    pendingPlayRef.current = true;
    player.replace({ uri: item.uri });
    player.loop = false;
    setPlayingId(item.id);
  }

  function handlePause() {
    player.pause();
    setPlayingId(null);
  }

  // ── 保存配置（含背景音乐联动）───────────────────────────────
  async function handleSaveConfig(id: string, usages: AudioUsage[], name: string) {
    await updateAudioUsages(id, usages);
    await updateAudioName(id, name);

    // 若勾选了「软件背景音乐」，立即切换 BgMusicContext 播放
    const audio = audios.find(a => a.id === id);
    if (audio) {
      if (usages.includes('background')) {
        // 先清除其他曲目的 background 标记（保证唯一）
        const others = audios.filter(a => a.id !== id && a.usages.includes('background'));
        await Promise.all(others.map(a => updateAudioUsages(a.id, a.usages.filter(u => u !== 'background'))));
        await bgMusic.startBgMusic(audio.uri, name.trim() || audio.name);
      } else if (bgMusic.currentUri === audio.uri) {
        // 取消了背景音乐勾选 → 停止
        await bgMusic.stopBgMusic();
      }
    }
    await loadAudios();
  }

  // ── 删除 ─────────────────────────────────────────────────────
  async function handleDeleteConfirm() {
    if (!deleteItem) return;
    if (playingId === deleteItem.id) {
      player.pause();
      setPlayingId(null);
    }
    // 若删除的是当前背景音乐，同步停止
    if (bgMusic.currentUri === deleteItem.uri) {
      await bgMusic.stopBgMusic();
    }
    await deleteAudio(deleteItem.id);
    setDeleteItem(null);
    await loadAudios();
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* 顶栏 */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-foreground font-bold text-lg flex-1">音频库</Text>
        {/* 导入按钮 */}
        <Pressable
          onPress={handleImport}
          disabled={importing}
          className="flex-row items-center rounded-2xl px-4 py-2.5"
          style={{ backgroundColor: '#E8A365' }}
        >
          {importing
            ? <ActivityIndicator size="small" color="white" />
            : <>
                <Text className="text-white font-semibold text-sm mr-1">＋</Text>
                <Text className="text-white font-semibold text-sm">导入音频</Text>
              </>}
        </Pressable>
      </View>

      {/* 背景音乐正在播放 Banner */}
      {bgMusic.isPlaying && bgMusic.currentName && (
        <View className="mx-4 mb-3 flex-row items-center px-4 py-2.5 rounded-2xl gap-2"
          style={{ backgroundColor: 'rgba(232,163,101,0.12)', borderWidth: 1, borderColor: 'rgba(232,163,101,0.25)' }}>
          <Text style={{ fontSize: 16 }}>🎶</Text>
          <Text className="flex-1 text-xs font-semibold" style={{ color: '#C07830' }} numberOfLines={1}>
            正在播放：{bgMusic.currentName}
          </Text>
          <Pressable onPress={() => bgMusic.stopBgMusic()} className="rounded-full px-2 py-1"
            style={{ backgroundColor: 'rgba(232,163,101,0.2)' }}>
            <Text style={{ fontSize: 10, color: '#C07830', fontWeight: '700' }}>停止</Text>
          </Pressable>
        </View>
      )}

      {/* 说明卡片 */}
      <View className="mx-4 mb-4 px-4 py-3 rounded-2xl"
        style={{ backgroundColor: 'rgba(232,163,101,0.08)', borderWidth: 1, borderColor: 'rgba(232,163,101,0.2)' }}>
        <Text className="text-sm font-semibold mb-1" style={{ color: '#E8A365' }}>
          🎵 个人音频库
        </Text>
        <Text className="text-xs text-muted-foreground leading-5">
          导入本地 MP3 / M4A / WAV 文件，为冥想、测评和呼吸训练添加专属背景音乐。
          点击 ⚙️ 配置音频的使用场景。
        </Text>
      </View>

      {/* 列表 */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#E8A365" />
        </View>
      ) : audios.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-4">🎵</Text>
          <Text className="text-foreground font-bold text-lg mb-2">暂无音频</Text>
          <Text className="text-muted-foreground text-sm text-center leading-6">
            点击右上角「导入音频」{'\n'}从本地选取音乐文件{'\n'}为冥想、测评、呼吸训练添加背景音乐
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          {/* 场景快速状态 */}
          <View className="flex-row gap-2 mb-4">
            {USAGE_CONFIG.map(cfg => {
              const matched = audios.filter(a => a.usages.includes(cfg.key));
              const active = matched.length > 0;
              return (
                <View
                  key={cfg.key}
                  className="flex-1 rounded-xl py-2.5 px-2 items-center"
                  style={{ backgroundColor: active ? `${cfg.color}18` : 'rgba(0,0,0,0.04)' }}
                >
                  <Text className="text-lg">{cfg.emoji}</Text>
                  <Text style={{ fontSize: 9, color: active ? cfg.color : '#9CA3AF', fontWeight: '600', marginTop: 2, textAlign: 'center' }}>
                    {cfg.label.replace('背景音', '').replace('训练音', '')}
                  </Text>
                  <Text style={{ fontSize: 9, color: active ? cfg.color : '#9CA3AF' }}>
                    {active ? `已配置` : '未配置'}
                  </Text>
                </View>
              );
            })}
          </View>

          {audios.map(item => (
            <AudioRow
              key={item.id}
              item={item}
              isPlaying={playingId === item.id}
              isBgTrack={bgMusic.currentUri === item.uri}
              onPlay={() => handlePlay(item)}
              onPause={handlePause}
              onConfig={() => setConfigItem(item)}
              onDelete={() => setDeleteItem(item)}
            />
          ))}
          <View className="h-8" />
        </ScrollView>
      )}

      {/* 配置弹窗 */}
      {configItem && (
        <ConfigModal
          item={configItem}
          visible
          onClose={() => setConfigItem(null)}
          onSave={handleSaveConfig}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteItem && (
        <DeleteConfirmModal
          visible
          name={deleteItem.name}
          onCancel={() => setDeleteItem(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </SafeAreaView>
  );
}
