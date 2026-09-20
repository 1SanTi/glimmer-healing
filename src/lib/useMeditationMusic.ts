/**
 * useMeditationMusic — 共享 AI 背景音乐 Hook
 *
 * 工作流程（对齐 ai-music-generation skill）：
 * 1. 若 localAudioUri 存在，直接用本地音频，跳过 AI 生成
 * 2. 否则调用 music-generate Edge Function 提交 MiniMax Music 任务
 * 3. 每 7 秒轮询 music-query Edge Function 直到 status === 'Success'
 * 4. 成功后通过 player.replace() 切换到 AI 生成的持久化 MP3 URL
 * 5. 失败时静默回退到 fallback MP3，不影响使用
 *
 * @param scene 'meditation' | 'test' — 区分冥想和心理测试的音乐风格
 * @param autoPlay 为 true 时组件挂载后立即开始播放
 * @param localAudioUri 用户配置的本地音频 URI，存在时优先使用
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { supabase } from '@/client/supabase';

// ── 场景化 AI 提示词 ─────────────────────────────────────────────
const PROMPTS: Record<'meditation' | 'test', string> = {
  meditation: '纯音乐，空灵治愈，轻柔钢琴与弦乐，冥想放松，深度平静，轻柔流水声，无人声',
  test:       '纯音乐，舒缓柔和，钢琴与轻弦乐，专注冥想，温暖治愈，轻柔背景，无人声',
};

// ── Fallback：不依赖外部 CDN，AI 生成前静音等待 ───────────────────
// 原 freesound CDN 链接已 404，改为无初始源，AI 生成成功后再加载

export type MeditationScene = 'meditation' | 'test';

export interface UseMeditationMusicResult {
  musicOn: boolean;
  musicLoading: boolean;
  aiReady: boolean;       // AI 生成已完成（或已用本地音频）
  isLocal: boolean;       // 当前使用本地音频
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  startIfOff: () => void; // 若当前关闭则立即开启
}

export function useMeditationMusic(
  scene: MeditationScene = 'meditation',
  autoPlay = false,
  localAudioUri?: string | null,
): UseMeditationMusicResult {
  const [musicOn, setMusicOn]           = useState(autoPlay);
  const [musicLoading, setMusicLoading] = useState(false);
  const [aiReady, setAiReady]           = useState(false);
  const isLocal = !!(localAudioUri);

  // 初始化播放器：本地音频直接加载，否则 null 等待 AI 生成后再替换
  const initialSource = localAudioUri ? { uri: localAudioUri } : null;
  const player     = useAudioPlayer(initialSource);
  const taskIdRef  = useRef<string | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ── 清理轮询 ────────────────────────────────────────────────────
  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── 提交 AI 音乐生成任务（仅在无本地音频时触发） ──────────────
  const generateMusic = useCallback(async () => {
    if (isLocal) {
      // 本地音频模式：跳过 AI 生成，直接标记 ready
      setAiReady(true);
      return;
    }
    if (taskIdRef.current) return;
    if (!mountedRef.current) return;

    setMusicLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('music-generate', {
        body: {
          prompt: PROMPTS[scene],
          model: 'music-01',
        },
      });

      if (!mountedRef.current) return;
      if (error || !data?.task_id) {
        console.warn('[useMeditationMusic] 提交生成任务失败:', error?.message ?? '未返回 task_id');
        setMusicLoading(false);
        return;
      }

      taskIdRef.current = data.task_id;

      const deadline = Date.now() + 10 * 60 * 1000;
      pollRef.current = setInterval(async () => {
        if (!mountedRef.current) { stopPoll(); return; }
        if (Date.now() > deadline)  { stopPoll(); setMusicLoading(false); return; }

        try {
          const { data: qData, error: qErr } = await supabase.functions.invoke('music-query', {
            body: { task_id: taskIdRef.current },
          });

          if (!mountedRef.current) { stopPoll(); return; }
          if (qErr) return;

          if (qData?.status === 'Success' && qData.url) {
            stopPoll();
            setMusicLoading(false);
            setAiReady(true);
            try {
              player.replace({ uri: qData.url });
              if (musicOn) {
                player.loop = true;
                player.play();
              }
            } catch (replaceErr) {
              console.warn('[useMeditationMusic] replace 失败，继续用 fallback:', replaceErr);
            }
          } else if (qData?.status === 'Failed') {
            stopPoll();
            setMusicLoading(false);
            console.warn('[useMeditationMusic] AI 音乐生成失败，使用 fallback');
          }
        } catch {
          // 轮询网络错误，忽略继续等待
        }
      }, 7000);
    } catch (e) {
      if (mountedRef.current) setMusicLoading(false);
      console.warn('[useMeditationMusic] generateMusic error:', e);
    }
  }, [scene, isLocal, player, musicOn, stopPoll]);

  // ── 本地音频切换时更新播放器 ────────────────────────────────────
  useEffect(() => {
    if (localAudioUri) {
      try {
        player.replace({ uri: localAudioUri });
        setAiReady(true);
        setMusicLoading(false);
      } catch {
        // ignore
      }
    }
  }, [localAudioUri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 响应 musicOn 状态 ──────────────────────────────────────────
  useEffect(() => {
    if (musicOn) {
      player.loop = true;
      player.play();
      generateMusic();
    } else {
      player.pause();
    }
  }, [musicOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 组件卸载时清理 ──────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPoll();
      try { player.pause(); } catch { /* 已卸载 */ }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle     = useCallback(() => setMusicOn(v => !v), []);
  const pause      = useCallback(() => { setMusicOn(false); player.pause(); }, [player]);
  const resume     = useCallback(() => { setMusicOn(true); }, []);
  const startIfOff = useCallback(() => { setMusicOn(v => v ? v : true); }, []);

  return { musicOn, musicLoading, aiReady, isLocal, toggle, pause, resume, startIfOff };
}
