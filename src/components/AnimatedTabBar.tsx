/**
 * AnimatedTabBar — 带流体滑动指示器的标题栏组件
 *
 * 两种驱动模式（自动选择）：
 *
 *   1. 实时模式（传入 scrollX + screenW）：
 *      指示器和文字颜色在 UI 线程实时跟随 SwipeTabView 的水平偏移量，
 *      手指拖动过程中连续插值，松手后自动吸附。
 *      - indicatorX = scrollX / screenW * tabWidth（worklet 内计算，零延迟）
 *      - 文字颜色 = interpolateColor(1 - |scrollX/screenW - tabIndex|, inactive→active)
 *
 *   2. 离散模式（不传 scrollX）：
 *      点击 tab 时通过 withSpring/withTiming 执行离散弹跳动画（向下兼容）。
 */
import { useState, useEffect } from 'react';
import { View, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

interface TabItem {
  id: string;
  label: string;
}

interface AnimatedTabBarProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** 整体容器背景色，默认 muted 色 */
  bgColor?: string;
  /** 激活 tab 文字颜色，默认 #0F172A */
  activeTextColor?: string;
  /** 非激活 tab 文字颜色，默认 #94A3B8 */
  inactiveTextColor?: string;
  /** 指示器颜色，默认白色 */
  indicatorColor?: string;
  /**
   * 实时模式：SwipeTabView 的水平滚动偏移量（SharedValue）。
   * 需配合 screenW 一起传入。
   */
  scrollX?: SharedValue<number>;
  /**
   * 实时模式：屏幕宽度（来自 useWindowDimensions().width）。
   * 用于将 scrollX offset 归一化为 [0, tabCount-1] 页码空间。
   */
  screenW?: number;
}

export function AnimatedTabBar({
  tabs,
  activeId,
  onChange,
  bgColor = 'rgba(241,245,249,1)',
  activeTextColor = '#0F172A',
  inactiveTextColor = '#94A3B8',
  indicatorColor = '#FFFFFF',
  scrollX,
  screenW,
}: AnimatedTabBarProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  // containerWidthSV：供 useAnimatedStyle worklet 读取（不能直接读 state）
  const containerWidthSV = useSharedValue(0);
  const tabCount = tabs.length;

  const activeIndex = tabs.findIndex(t => t.id === activeId);

  // 离散模式指示器偏移（实时模式时此值由 scrollX 替代）
  const indicatorX = useSharedValue(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setContainerWidth(w);
    containerWidthSV.value = w;
    // 初始定位：不播动画，直接到位
    const idx = tabs.findIndex(t => t.id === activeId);
    indicatorX.value = idx * ((w - 8) / tabCount);
  };

  // 离散模式：activeId / containerWidth 变化时弹簧动画移动指示器
  useEffect(() => {
    if (containerWidth <= 0) return;
    const tw = (containerWidth - 8) / tabCount;
    indicatorX.value = withSpring(activeIndex * tw, {
      damping: 20, stiffness: 300, mass: 0.6,
    });
  }, [activeIndex, containerWidth]);

  // 指示器位置：实时模式 → 从 scrollX 连续插值；离散模式 → withSpring
  const indicatorStyle = useAnimatedStyle(() => {
    if (scrollX && screenW && containerWidthSV.value > 0) {
      const tw = (containerWidthSV.value - 8) / tabCount;
      // scrollX 的范围是 [0, (tabCount-1)*screenW]
      // 归一化为页码 [0, tabCount-1]，再乘以单个 tab 宽度
      const page = scrollX.value / screenW;
      return { transform: [{ translateX: page * tw }] };
    }
    return { transform: [{ translateX: indicatorX.value }] };
  });

  return (
    <View
      onLayout={handleLayout}
      style={{
        flexDirection: 'row',
        backgroundColor: bgColor,
        borderRadius: 16,
        padding: 4,
        position: 'relative',
      }}
    >
      {/* 滑动指示器（底层胶囊） */}
      {containerWidth > 0 && (
        <Reanimated.View
          style={[
            {
              position: 'absolute',
              top: 4, left: 4, bottom: 4,
              width: (containerWidth - 8) / tabCount,
              borderRadius: 12,
              backgroundColor: indicatorColor,
              boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.08)' }],
            } as any,
            indicatorStyle,
          ]}
        />
      )}
      {/* Tab 按钮 */}
      {tabs.map((tab, index) => (
        <AnimatedTabItem
          key={tab.id}
          label={tab.label}
          isActive={tab.id === activeId}
          tabIndex={index}
          activeTextColor={activeTextColor}
          inactiveTextColor={inactiveTextColor}
          scrollX={scrollX}
          screenW={screenW}
          tabCount={tabCount}
          onPress={() => onChange(tab.id)}
        />
      ))}
    </View>
  );
}

// ── 单个 Tab 按钮（文字颜色过渡动画）─────────────────────────
function AnimatedTabItem({
  label, isActive, tabIndex, activeTextColor, inactiveTextColor,
  scrollX, screenW, tabCount, onPress,
}: {
  label: string;
  isActive: boolean;
  tabIndex: number;
  activeTextColor: string;
  inactiveTextColor: string;
  scrollX?: SharedValue<number>;
  screenW?: number;
  tabCount: number;
  onPress: () => void;
}) {
  // 离散模式：0→1 插值颜色
  const colorProg = useSharedValue(isActive ? 1 : 0);
  // ⚠️ 必须在 useEffect 中驱动 withTiming，禁止在渲染函数体直接调用
  useEffect(() => {
    colorProg.value = withTiming(isActive ? 1 : 0, { duration: 220 });
  }, [isActive]);

  // 文字颜色：实时模式 → 从 scrollX 连续插值；离散模式 → withTiming
  const textStyle = useAnimatedStyle(() => {
    if (scrollX && screenW) {
      // 当前 tab 的激活程度：scrollX 越接近 tabIndex * screenW，activation 越接近 1
      const page = scrollX.value / screenW;
      // 线性距离激活度，clamp 到 [0, 1]
      const activation = Math.max(0, Math.min(1, 1 - Math.abs(page - tabIndex)));
      return {
        color: interpolateColor(activation, [0, 1], [inactiveTextColor, activeTextColor]),
      };
    }
    // 离散模式兜底
    return {
      color: interpolateColor(colorProg.value, [0, 1], [inactiveTextColor, activeTextColor]),
    };
  });

  // 字重：实时模式 → 中间过渡时用较轻字重，激活时变粗
  const fontStyle = useAnimatedStyle(() => {
    if (scrollX && screenW) {
      const page = scrollX.value / screenW;
      const activation = Math.max(0, Math.min(1, 1 - Math.abs(page - tabIndex)));
      // 激活度 > 0.5 时用粗体，否则细一档
      return { fontWeight: activation > 0.5 ? ('600' as const) : ('400' as const) };
    }
    return { fontWeight: isActive ? ('600' as const) : ('400' as const) };
  });

  void tabCount; // 预留未来按 tabCount 调整字号

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 9,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}
    >
      <Reanimated.Text style={[{ fontSize: 13 }, textStyle, fontStyle]}>
        {label}
      </Reanimated.Text>
    </Pressable>
  );
}
