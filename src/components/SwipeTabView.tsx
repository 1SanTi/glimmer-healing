/**
 * SwipeTabView v3 — 完全手动控制的流畅 Tab 滑动容器
 *
 * 架构：GestureDetector (Pan) + Reanimated.View translateX
 * - 彻底摒弃 pagingEnabled ScrollView，消除双重动画竞争卡顿
 * - 手指跟随：translateX = -activeIndex*screenW + pan.translationX（UI 线程，零延迟）
 * - 松手：withSpring 弹到目标页，damping=18 stiffness=120 给丝滑弹性感
 * - 点击 TabBar：scrollX 立即到位，withSpring 同步视图
 * - scrollX SharedValue 实时反映页面偏移量，供 AnimatedTabBar 读取
 */
import { useEffect, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

interface SwipeTabViewProps {
  activeIndex: number;
  onIndexChange: (index: number) => void;
  children: React.ReactNode[];
  scrollX?: SharedValue<number>;
}

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 120,
  mass: 0.8,
  overshootClamping: false,
};

export function SwipeTabView({ activeIndex, onIndexChange, children, scrollX }: SwipeTabViewProps) {
  const { width: screenW } = useWindowDimensions();
  const tabCount = children.length;

  // translateX：内容条的水平偏移，-activeIndex*screenW 为静止位
  const translateX = useSharedValue(-activeIndex * screenW);
  // committedIndexSV：UI 线程上的已提交页码，供 worklet 读取（不经过 JS bridge）
  const committedIndexSV = useSharedValue(activeIndex);
  // JS ref：防止 useEffect 与手势回调的 notifyIndexChange 重复触发
  const committedRef = useRef(activeIndex);

  // 点击 TabBar → activeIndex 外部变化 → 弹簧跳页
  useEffect(() => {
    if (committedRef.current === activeIndex) return;
    committedRef.current = activeIndex;
    committedIndexSV.value = activeIndex;
    const target = -activeIndex * screenW;
    if (scrollX) scrollX.value = activeIndex * screenW;
    translateX.value = withSpring(target, SPRING_CONFIG);
  }, [activeIndex, screenW]);

  // JS 线程回调：通知父组件页码变更
  const notifyIndexChange = (index: number) => {
    if (committedRef.current === index) return;
    committedRef.current = index;
    onIndexChange(index);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])    // 水平 8px 才激活，避免误触垂直滚动
    .failOffsetY([-12, 12])    // 垂直超 12px 则让位给父级 ScrollView
    .onUpdate((e) => {
      // UI 线程直接计算，零延迟跟手
      const base = -committedIndexSV.value * screenW;
      const rawX = base + e.translationX;
      const minX = -(tabCount - 1) * screenW;
      // 边界阻力：超出首尾页给 30% 阻力感
      const clamped = rawX > 0
        ? rawX * 0.3
        : rawX < minX
          ? minX + (rawX - minX) * 0.3
          : rawX;
      translateX.value = clamped;
      if (scrollX) scrollX.value = -clamped;
    })
    .onEnd((e) => {
      const current = committedIndexSV.value;
      const vx = e.velocityX;
      const dx = e.translationX;

      // 速度 200 px/s 或位移超 25% 屏幕宽则切页
      let target = current;
      if (vx < -200 || dx < -screenW * 0.25) {
        target = Math.min(current + 1, tabCount - 1);
      } else if (vx > 200 || dx > screenW * 0.25) {
        target = Math.max(current - 1, 0);
      }

      committedIndexSV.value = target;
      const targetX = -target * screenW;
      translateX.value = withSpring(targetX, SPRING_CONFIG);
      if (scrollX) scrollX.value = target * screenW;
      runOnJS(notifyIndexChange)(target);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1, overflow: 'hidden' }}>
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            {
              flex: 1,
              flexDirection: 'row',
              width: screenW * tabCount,
            },
            animatedStyle,
          ]}
        >
          {children.map((child, i) => (
            <View key={i} style={{ width: screenW, flex: 1 }}>
              {child}
            </View>
          ))}
        </Reanimated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
