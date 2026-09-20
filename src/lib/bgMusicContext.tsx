/**
 * bgMusicContext.tsx — 全局背景音乐上下文
 *
 * 在根 layout 中挂载，播放器生命周期 = App 生命周期。
 * 跨页面切换不会中断播放。
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── 持久化 key ──────────────────────────────────────────────────
const BG_URI_KEY      = 'bg_music_uri_v1';
const BG_NAME_KEY     = 'bg_music_name_v1';
// 用户主动停止的标记：存在且为 '1' 时，绝不自动恢复播放
const BG_STOPPED_KEY  = 'bg_music_stopped_v1';

// ── Context 类型 ─────────────────────────────────────────────────
export interface BgMusicContextValue {
  isPlaying: boolean;
  currentName: string | null;
  currentUri:  string | null;
  /** 切换并播放新的背景音乐（uri = null 表示停止） */
  startBgMusic: (uri: string, name: string) => Promise<void>;
  stopBgMusic:  () => Promise<void>;
}

const BgMusicContext = createContext<BgMusicContextValue>({
  isPlaying:    false,
  currentName:  null,
  currentUri:   null,
  startBgMusic: async () => {},
  stopBgMusic:  async () => {},
});

export function useBgMusic() {
  return useContext(BgMusicContext);
}

// ── Provider ─────────────────────────────────────────────────────
export function BgMusicProvider({ children }: { children: ReactNode }) {
  const [currentUri,  setCurrentUri]  = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string | null>(null);

  // keepAudioSessionActive=true：页面切换后保持 iOS 音频会话
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);

  // 标记「已加载后需要立即播放」
  const pendingPlay = useRef(false);

  // ── 初始化：仅设置音频模式，不自动恢复播放 ─────────────────
  // Bug修复：不在应用启动时自动恢复播放，仅恢复显示状态
  // 用户需在音频库中主动点击"设为背景音乐"才会播放
  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode:      true,
          shouldPlayInBackground: true,
          interruptionMode:       'mixWithOthers',
        });
      } catch {
        // 部分模拟器不支持，忽略
      }

      // 仅恢复显示状态（名称/URI），不触发自动播放
      const [savedUri, savedName, stopped] = await Promise.all([
        AsyncStorage.getItem(BG_URI_KEY),
        AsyncStorage.getItem(BG_NAME_KEY),
        AsyncStorage.getItem(BG_STOPPED_KEY),
      ]);
      // 用户主动停止过 → 绝不自动恢复
      if (stopped === '1') return;
      if (savedUri && savedName) {
        setCurrentUri(savedUri);
        setCurrentName(savedName);
        // 不调用 player.replace / player.play，不自动开始播放
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 等待 isLoaded 后再 play（避免竞态）
  useEffect(() => {
    if (pendingPlay.current && status.isLoaded) {
      pendingPlay.current = false;
      player.play();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isLoaded]);

  // ── 开始播放 ─────────────────────────────────────────────────
  const startBgMusic = useCallback(async (uri: string, name: string) => {
    setCurrentUri(uri);
    setCurrentName(name);
    // 用户主动播放 → 清除"已停止"标记
    await AsyncStorage.multiSet([
      [BG_URI_KEY,     uri],
      [BG_NAME_KEY,    name],
    ]);
    await AsyncStorage.removeItem(BG_STOPPED_KEY);
    pendingPlay.current = true;
    player.replace({ uri });
    player.loop = true;
  }, [player]);

  // ── 停止播放 ─────────────────────────────────────────────────
  const stopBgMusic = useCallback(async () => {
    player.pause();
    try { player.replace(null as any); } catch { /* ignore */ }
    setCurrentUri(null);
    setCurrentName(null);
    // 写入"用户主动停止"标记，防止下次启动自动恢复
    await AsyncStorage.multiSet([[BG_STOPPED_KEY, '1']]);
    await AsyncStorage.multiRemove([BG_URI_KEY, BG_NAME_KEY]);
  }, [player]);

  return (
    <BgMusicContext.Provider value={{
      isPlaying:   status.playing,
      currentUri,
      currentName,
      startBgMusic,
      stopBgMusic,
    }}>
      {children}
    </BgMusicContext.Provider>
  );
}
