/**
 * music-healing-room.tsx — 音乐粒子疗愈室（v247 重构）
 *
 * 改动：
 * - 音频库改为对接 App 内「个人音频库」(audioStore) particle_healing 场景
 * - 移除原生侧重复的「上传音乐」按钮（WebView 内置 #loadBtn 按钮保留）
 * - 曲库弹窗展示用户个人音频库中标记了 particle_healing 的曲目
 */
import { useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ActivityIndicator,
  StyleSheet, FlatList, Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getAllAudios, type AudioItem } from '@/lib/audioStore';
import { MUSIC_HEALING_HTML } from '@/lib/MusicHealingScene';
import MusicWebView, { type MusicWebViewRef } from '@/components/MusicWebView';

export default function MusicHealingRoomScreen() {
  const router = useRouter();
  const webViewRef = useRef<MusicWebViewRef>(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [audios, setAudios] = useState<AudioItem[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [playingId, setPlayingId] = useState('');

  // ── 向 WebView / iframe 发送消息 ─────────────────────
  const postToScene = useCallback((data: object) => {
    webViewRef.current?.postMessage(JSON.stringify(data));
  }, []);

  // ── 处理 WebView → RN 的消息 ─────────────────────────
  const handleMessage = useCallback((event: any) => {
    try {
      const raw = event?.nativeEvent?.data ?? event?.data;
      const msg = JSON.parse(raw);
      if (msg.type === 'AUDIO_UPLOAD') {
        setUploadMsg(`已载入：${msg.name}`);
      }
    } catch (_) {}
  }, []);

  // ── 加载个人音频库中 particle_healing 场景的曲目 ──────
  const fetchLibrary = useCallback(async () => {
    setLoadingTracks(true);
    try {
      const all = await getAllAudios();
      setAudios(all.filter(a => a.usages.includes('particle_healing')));
    } catch (_) {
      setAudios([]);
    } finally {
      setLoadingTracks(false);
    }
  }, []);

  // 每次进入页面刷新
  useFocusEffect(useCallback(() => { void fetchLibrary(); }, [fetchLibrary]));

  // ── 打开曲库弹窗 ─────────────────────────────────────
  const openLibrary = useCallback(() => {
    setShowLibrary(true);
    fetchLibrary();
  }, [fetchLibrary]);

  // ── 播放个人音频库中的曲目 ───────────────────────────
  const playTrack = useCallback((audio: AudioItem) => {
    postToScene({ type: 'LOAD_AUDIO_URL', url: audio.uri, name: audio.name });
    setPlayingId(audio.id);
    setShowLibrary(false);
    setUploadMsg('▶ ' + audio.name);
  }, [postToScene]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* ── 3D 场景（平台文件自动切换 WebView / iframe）── */}
      <MusicWebView
        ref={webViewRef}
        html={MUSIC_HEALING_HTML}
        onMessage={handleMessage}
      />

      {/* ── 返回按钮 ── */}
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>✕</Text>
      </Pressable>

      {/* ── 原生侧：仅保留「音频库」入口；上传由 WebView 内置按钮处理 ── */}
      {process.env.EXPO_OS !== 'web' && (
        <View style={styles.musicBtnRow}>
          <Pressable onPress={openLibrary} style={styles.libraryBtn}>
            <Text style={styles.btnText}>🎵 音频库</Text>
          </Pressable>
        </View>
      )}

      {/* ── 正在播放提示 ── */}
      {uploadMsg ? (
        <View style={styles.msgBadge}>
          <Text style={styles.msgText} numberOfLines={1}>{uploadMsg}</Text>
        </View>
      ) : null}

      {/* ── 个人音频库弹窗 ── */}
      <Modal
        visible={showLibrary}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLibrary(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLibrary(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>✨ 粒子疗愈音频库</Text>
            <Text style={styles.modalSub}>选择已标记「粒子疗愈背景音」的曲目</Text>

            {loadingTracks ? (
              <ActivityIndicator color="#7C3AED" style={{ marginTop: 32 }} />
            ) : audios.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>暂无粒子疗愈音频</Text>
                <Text style={styles.emptyHint}>
                  前往 我的 → 声音库，为音频添加「粒子疗愈背景音」标签
                </Text>
              </View>
            ) : (
              <FlatList
                data={audios}
                keyExtractor={(a) => a.id}
                style={styles.trackList}
                contentContainerStyle={{ paddingBottom: 12 }}
                renderItem={({ item }) => {
                  const isPlaying = item.id === playingId;
                  return (
                    <Pressable
                      onPress={() => playTrack(item)}
                      style={[styles.trackRow, isPlaying && styles.trackRowActive]}
                    >
                      <Text style={styles.trackIcon}>{isPlaying ? '▶' : '♪'}</Text>
                      <Text
                        style={[styles.trackName, isPlaying && styles.trackNameActive]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#000' },
  backBtn:     { position: 'absolute', bottom: 36, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backText:    { color: '#fff', fontSize: 16, fontWeight: '600' },
  musicBtnRow: { position: 'absolute', top: 52, left: 16, flexDirection: 'row', gap: 8 },
  libraryBtn:  { backgroundColor: 'rgba(124,58,237,0.75)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 13 },
  btnText:     { color: '#fff', fontSize: 12, fontWeight: '600' },
  msgBadge:    { position: 'absolute', top: 92, left: 16, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, maxWidth: 240 },
  msgText:     { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:  { backgroundColor: '#13102A', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 32, maxHeight: '70%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  modalTitle:  { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSub:    { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 16 },
  trackList:   { maxHeight: 320 },
  trackRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.06)', gap: 12 },
  trackRowActive: { backgroundColor: 'rgba(124,58,237,0.3)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.6)' },
  trackIcon:   { color: 'rgba(255,255,255,0.5)', fontSize: 14, width: 18, textAlign: 'center' },
  trackName:   { color: 'rgba(255,255,255,0.85)', fontSize: 14, flex: 1 },
  trackNameActive: { color: '#A78BFA', fontWeight: '600' },
  emptyBox:    { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText:   { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
  emptyHint:   { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});

