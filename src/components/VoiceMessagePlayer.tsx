/**
 * VoiceMessagePlayer — 咨询师语音消息播放器
 * 功能：加载 TTS 音频 URL，显示波形进度条，支持播放/暂停/拖动
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Play, Pause, Volume2 } from 'lucide-react-native';

interface Props {
  audioUrl: string | null;      // TTS 生成的音频 URL
  audioLength: number;          // 音频时长（毫秒），0 表示未知
  accentColor: string;          // 咨询师主题色
  loading?: boolean;            // TTS 生成中
  onError?: (msg: string) => void;
}

/** 毫秒 → mm:ss */
function msToLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceMessagePlayer({ audioUrl, audioLength, accentColor, loading, onError }: Props) {
  const player = useAudioPlayer();
  const status  = useAudioPlayerStatus(player);
  const [dragging, setDragging]       = useState(false);
  const [dragPct, setDragPct]         = useState(0);
  const trackRef = useRef<View>(null);
  const trackWidthRef = useRef(0);

  // 加载音源
  useEffect(() => {
    if (!audioUrl) return;
    try {
      player.replace({ uri: audioUrl });
    } catch (e) {
      onError?.('音频加载失败');
    }
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const duration  = status.duration  ?? (audioLength / 1000);   // 秒
  const position  = status.currentTime ?? 0;
  const isPlaying = status.playing;
  const isLoaded  = (status.duration ?? 0) > 0 || (audioLength > 0 && !!audioUrl) || !!audioUrl;

  const progress = duration > 0
    ? (dragging ? dragPct : Math.min(position / duration, 1))
    : 0;

  const togglePlay = () => {
    if (!isLoaded) return;
    if (isPlaying) {
      player.pause();
    } else {
      if (position >= duration - 0.1) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const handleTrackPress = (pageX: number) => {
    if (!isLoaded || trackWidthRef.current === 0) return;
    trackRef.current?.measure((_x, _y, width, _height, px) => {
      const pct = Math.max(0, Math.min(1, (pageX - px) / width));
      player.seekTo(pct * duration);
    });
  };

  const currentLabel = msToLabel(
    dragging ? dragPct * duration * 1000 : position * 1000
  );
  const totalLabel = msToLabel(duration > 0 ? duration * 1000 : audioLength);

  // 顶层：加载中骨架
  if (loading) {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 12, paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
        marginTop: 6, minWidth: 180,
      }}>
        <ActivityIndicator size="small" color={accentColor} />
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>正在生成语音…</Text>
      </View>
    );
  }

  if (!audioUrl) return null;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 10, paddingVertical: 8,
      backgroundColor: `${accentColor}18`,
      borderRadius: 14,
      borderWidth: 1, borderColor: `${accentColor}30`,
      marginTop: 6, minWidth: 200, maxWidth: 260,
    }}>
      {/* 播放/暂停按钮 */}
      <Pressable
        onPress={togglePlay}
        style={{
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: accentColor,
          alignItems: 'center', justifyContent: 'center',
          opacity: isLoaded ? 1 : 0.5,
        }}
      >
        {isLoaded
          ? (isPlaying
              ? <Pause size={14} color="#fff" />
              : <Play  size={14} color="#fff" />)
          : <ActivityIndicator size="small" color="#fff" />
        }
      </Pressable>

      {/* 进度条区域 */}
      <View style={{ flex: 1, gap: 4 }}>
        {/* 波形进度条 */}
        <View
          ref={trackRef}
          onLayout={e => { trackWidthRef.current = e.nativeEvent.layout.width; }}
          style={{ height: 22, justifyContent: 'center' }}
        >
          {/* 背景轨道 + 波形装饰 */}
          <View style={{ height: 3, backgroundColor: `${accentColor}30`, borderRadius: 2 }}>
            {/* 已播放进度 */}
            <View style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${progress * 100}%`,
              backgroundColor: accentColor,
              borderRadius: 2,
            }} />
          </View>
          {/* 波形音量小条（纯装饰，随机高度） */}
          <View style={{
            position: 'absolute', left: 0, right: 0,
            flexDirection: 'row', alignItems: 'center',
            gap: 2, overflow: 'hidden',
            pointerEvents: 'none',
          }}>
            {[4,7,10,6,12,8,5,11,7,9,6,10,8,5,9,7,11,6].map((h, i) => {
              const barPct = i / 17;
              const active = barPct < progress;
              return (
                <View key={i} style={{
                  width: 2, height: h,
                  backgroundColor: active ? accentColor : `${accentColor}40`,
                  borderRadius: 1,
                  opacity: active ? 1 : 0.6,
                }} />
              );
            })}
          </View>
          {/* 可点击拖动透明遮罩 */}
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            onPress={e => handleTrackPress(e.nativeEvent.pageX)}
          />
        </View>

        {/* 时间标签 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 10, color: accentColor, opacity: 0.8 }}>{currentLabel}</Text>
          <Text style={{ fontSize: 10, color: accentColor, opacity: 0.5 }}>{totalLabel}</Text>
        </View>
      </View>

      {/* 音量图标 */}
      <Volume2 size={14} color={accentColor} style={{ opacity: 0.5 }} />
    </View>
  );
}
