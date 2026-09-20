import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, cancelAnimation, runOnJS,
} from 'react-native-reanimated';

import AVATAR from '../../../assets/heron/heron-avatar.png';
const BALL = 56;

interface Props {
  active: boolean;
  hasUnread: boolean;
  onOpen: () => void;
}

export function DraggableFloat({ active, hasUnread, onOpen }: Props) {
  const { width, height } = useWindowDimensions();

  // 当前落点（最终位置）
  const tx = useSharedValue(width - BALL - 16);
  const ty = useSharedValue(height * 0.42);
  // 手势起始时的快照 —— 避免每帧累加 translationX/Y（那是从起点算的总偏移，不是帧增量）
  const startX = useSharedValue(width - BALL - 16);
  const startY = useSharedValue(height * 0.42);
  const glow = useSharedValue(0.4);

  useEffect(() => {
    glow.value = withRepeat(withTiming(0.9, { duration: 1600 }), -1, true);
  }, [glow]);

  const snapToEdge = (x: number, y: number) => {
    const midX = width / 2;
    const targetX = x + BALL / 2 < midX ? 16 : width - BALL - 16;
    tx.value = withSpring(targetX, { damping: 16, stiffness: 160 });
    startX.value = targetX;
    const minY = 80;
    const maxY = height - BALL - 120;
    const clampedY = Math.min(Math.max(y, minY), maxY);
    ty.value = withSpring(clampedY, { damping: 16, stiffness: 160 });
    startY.value = clampedY;
  };

  // ★ 核心修复：onStart 快照起始位置，onUpdate/onEnd 用「起点 + 总偏移」而非累加
  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = tx.value;
      startY.value = ty.value;
      cancelAnimation(glow);
      glow.value = withTiming(1, { duration: 150 });
    })
    .onUpdate((e) => {
      tx.value = startX.value + e.translationX;
      ty.value = startY.value + e.translationY;
    })
    .onEnd((e) => {
      runOnJS(snapToEdge)(
        startX.value + e.translationX,
        startY.value + e.translationY,
      );
      glow.value = withRepeat(withTiming(0.9, { duration: 1600 }), -1, true);
    });

  // Exclusive: pan 激活后 tap 自动取消，不会同时触发 onOpen
  const tap = Gesture.Tap().onEnd(() => { runOnJS(onOpen)(); });

  const composed = Gesture.Exclusive(pan, tap);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: active ? 1 : 0.5,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 0.9 + glow.value * 0.35 }],
  }));

  return (
    <GestureDetector gesture={composed}>
      {/* pointerEvents="auto" 确保手势可命中；外层不再包 Pressable（onPress 与 tap gesture 冲突） */}
      <Animated.View
        style={[{ position: 'absolute', left: 0, top: 0, width: BALL, height: BALL }, containerStyle]}
      >
        <View style={{ width: BALL, height: BALL, alignItems: 'center', justifyContent: 'center' }}>
          {/* 呼吸光晕 */}
          <Animated.View
            style={[{
              position: 'absolute', width: BALL, height: BALL,
              borderRadius: BALL / 2, backgroundColor: 'rgba(122,157,140,0.32)',
            }, glowStyle]}
          />
          {/* 彩色外环 */}
          <View style={{
            width: BALL - 2, height: BALL - 2, borderRadius: (BALL - 2) / 2,
            borderWidth: 2.5, borderColor: '#7A9D8C',
            backgroundColor: '#F5F0E8',
            overflow: 'hidden',
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}>
            <Image source={AVATAR} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
          </View>
          {hasUnread ? (
            <View style={{
              position: 'absolute', right: 1, top: 1,
              width: 12, height: 12, borderRadius: 6,
              backgroundColor: '#ef4444', borderWidth: 2, borderColor: '#fff',
            }} />
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}