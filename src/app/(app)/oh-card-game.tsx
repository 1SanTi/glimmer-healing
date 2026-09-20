import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  useWindowDimensions, ImageBackground, Modal, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import {
  GestureDetector, Gesture, GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS, withSpring, withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import {
  X, Pin, RotateCcw, Layers, Sparkles, BookOpen,
  ArrowLeft, Archive, RefreshCw, Layout, FlipHorizontal, Maximize2, Minimize2,
  ChevronDown, ChevronUp, Shuffle, RotateCw, ArrowUp, ArrowDown, Eye, EyeOff,
} from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/client/supabase';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

const SB = 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-card-bg';

// ─── 桌面主题定义：4张AI高清生成 + 4张用户图片 + 3张经典背景 ──
const DESKTOPS = [
  // ── AI生成（高级版·深海星空）
  {
    id: 'adv1',
    name: '深海星空',
    desc: 'AI生成·荧光水母冥想空间',
    emoji: '🪼',
    bgUrl: `${SB}/adv_bg_1.jpg`,
    accentColor: '#5B8FD4',
    overlay: 'rgba(4,10,28,0.45)',
  },
  // ── AI生成（高级版·神圣森林）
  {
    id: 'adv2',
    name: '神圣森林',
    desc: 'AI生成·晨光疗愈圣地',
    emoji: '🌿',
    bgUrl: `${SB}/adv_bg_2.jpg`,
    accentColor: '#5A9E6F',
    overlay: 'rgba(6,14,8,0.42)',
  },
  // ── AI生成（高级版·宇宙曼陀罗）
  {
    id: 'adv3',
    name: '宇宙曼陀罗',
    desc: 'AI生成·神圣几何星尘',
    emoji: '🔮',
    bgUrl: `${SB}/adv_bg_3.jpg`,
    accentColor: '#8B5CF6',
    overlay: 'rgba(8,4,20,0.45)',
  },
  // ── AI生成（高级版·月光湖）
  {
    id: 'adv4',
    name: '月光之湖',
    desc: 'AI生成·宁静月夜倒影',
    emoji: '🌕',
    bgUrl: `${SB}/adv_bg_4.jpg`,
    accentColor: '#4A8AB5',
    overlay: 'rgba(4,8,18,0.42)',
  },
  // ── 用户传入图片（暗紫色调）
  {
    id: 'user1',
    name: '紫境冥想',
    desc: '原创素材·深邃紫调',
    emoji: '💜',
    bgUrl: `${SB}/user_bg_1.jpg`,
    accentColor: '#9B7FD4',
    overlay: 'rgba(10,6,20,0.38)',
  },
  // ── 用户传入图片（深色系）
  {
    id: 'user2',
    name: '暗夜静室',
    desc: '原创素材·沉静暗调',
    emoji: '🌑',
    bgUrl: `${SB}/user_bg_2.jpg`,
    accentColor: '#6B7280',
    overlay: 'rgba(0,0,0,0.35)',
  },
  {
    id: 'user3',
    name: '墨色禅意',
    desc: '原创素材·极简禅境',
    emoji: '⬛',
    bgUrl: `${SB}/user_bg_3.jpg`,
    accentColor: '#78716C',
    overlay: 'rgba(0,0,0,0.3)',
  },
  {
    id: 'user4',
    name: '夜语',
    desc: '原创素材·深夜私语',
    emoji: '🌙',
    bgUrl: `${SB}/user_bg_4.jpg`,
    accentColor: '#64748B',
    overlay: 'rgba(0,0,0,0.32)',
  },
  // ── 经典搜索背景
  {
    id: 'mandala',
    name: '曼陀罗',
    desc: '神圣几何，向内探索',
    emoji: '🌸',
    bgUrl: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_b45bb2c2-f2c9-4e3d-bc63-57f8f4303064.jpg',
    accentColor: '#8B5CF6',
    overlay: 'rgba(13,13,32,0.62)',
  },
  {
    id: 'ripple',
    name: '水波纹',
    desc: '层层荡开，柔和平静',
    emoji: '🌊',
    bgUrl: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_9138a625-7ef1-4477-ba3a-e8c9c7af86cb.jpg',
    accentColor: '#0EA5E9',
    overlay: 'rgba(13,13,32,0.62)',
  },
  {
    id: 'star',
    name: '星空',
    desc: '繁星连线，指引方向',
    emoji: '✨',
    bgUrl: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_a8b1a9af-6e13-4f0a-b7be-411dfeb545c0.jpg',
    accentColor: '#6366F1',
    overlay: 'rgba(13,13,32,0.62)',
  },
  // ── PDF 导入背景（11页·疗愈图集）
  { id: 'pdf1', name: '疗愈图1', desc: 'PDF导入·第1页', emoji: '📄', bgUrl: `${SB}/pdf_bg_001.jpg`, accentColor: '#A78BFA', overlay: 'rgba(10,8,24,0.4)' },
  { id: 'pdf2', name: '疗愈图2', desc: 'PDF导入·第2页', emoji: '📄', bgUrl: `${SB}/pdf_bg_002.jpg`, accentColor: '#7BBFE8', overlay: 'rgba(8,12,22,0.4)' },
  { id: 'pdf3', name: '疗愈图3', desc: 'PDF导入·第3页', emoji: '📄', bgUrl: `${SB}/pdf_bg_003.jpg`, accentColor: '#9ED9C2', overlay: 'rgba(8,16,14,0.4)' },
  { id: 'pdf4', name: '疗愈图4', desc: 'PDF导入·第4页', emoji: '📄', bgUrl: `${SB}/pdf_bg_004.jpg`, accentColor: '#F9C57A', overlay: 'rgba(20,14,6,0.4)' },
  { id: 'pdf5', name: '疗愈图5', desc: 'PDF导入·第5页', emoji: '📄', bgUrl: `${SB}/pdf_bg_005.jpg`, accentColor: '#A78BFA', overlay: 'rgba(10,8,24,0.4)' },
  { id: 'pdf6', name: '疗愈图6', desc: 'PDF导入·第6页', emoji: '📄', bgUrl: `${SB}/pdf_bg_006.jpg`, accentColor: '#F9A8D4', overlay: 'rgba(22,8,16,0.4)' },
  { id: 'pdf7', name: '疗愈图7', desc: 'PDF导入·第7页', emoji: '📄', bgUrl: `${SB}/pdf_bg_007.jpg`, accentColor: '#86EFAC', overlay: 'rgba(8,16,10,0.4)' },
  { id: 'pdf8', name: '疗愈图8', desc: 'PDF导入·第8页', emoji: '📄', bgUrl: `${SB}/pdf_bg_008.jpg`, accentColor: '#7DD3FC', overlay: 'rgba(6,12,22,0.4)' },
  { id: 'pdf9', name: '疗愈图9', desc: 'PDF导入·第9页', emoji: '📄', bgUrl: `${SB}/pdf_bg_009.jpg`, accentColor: '#C4B5FD', overlay: 'rgba(10,8,24,0.4)' },
  { id: 'pdf10', name: '疗愈图10', desc: 'PDF导入·第10页', emoji: '📄', bgUrl: `${SB}/pdf_bg_010.jpg`, accentColor: '#FCA5A5', overlay: 'rgba(22,8,8,0.4)' },
  { id: 'pdf11', name: '疗愈图11', desc: 'PDF导入·第11页', emoji: '📄', bgUrl: `${SB}/pdf_bg_011.jpg`, accentColor: '#A78BFA', overlay: 'rgba(10,8,24,0.4)' },
  // ── AI生成·平面对称图案（8张）
  { id: 'sym1', name: '曼陀罗花语', desc: '神圣几何·金与靛蓝', emoji: '🌸', bgUrl: `${SB}/sym_bg_01.jpg`, accentColor: '#C084FC', overlay: 'rgba(16,8,32,0.38)' },
  { id: 'sym2', name: '万花镜', desc: '彩色万花筒对称', emoji: '🔭', bgUrl: `${SB}/sym_bg_02.jpg`, accentColor: '#34D399', overlay: 'rgba(6,18,16,0.36)' },
  { id: 'sym3', name: '阿拉贝斯克', desc: '薰衣草金色花藤对称', emoji: '🌿', bgUrl: `${SB}/sym_bg_03.jpg`, accentColor: '#E9D5FF', overlay: 'rgba(14,10,22,0.35)' },
  { id: 'sym4', name: '雪晶六合', desc: '六边冰晶对称·禅意', emoji: '❄️', bgUrl: `${SB}/sym_bg_04.jpg`, accentColor: '#7DD3FC', overlay: 'rgba(6,10,22,0.36)' },
  { id: 'sym5', name: '扬特拉冥想', desc: '三角同心圆·印度神性', emoji: '🔺', bgUrl: `${SB}/sym_bg_05.jpg`, accentColor: '#F59E0B', overlay: 'rgba(20,10,6,0.36)' },
  { id: 'sym6', name: '凯尔特结', desc: '古老交错曲线·森林琥珀', emoji: '☘️', bgUrl: `${SB}/sym_bg_06.jpg`, accentColor: '#A3E635', overlay: 'rgba(6,14,6,0.36)' },
  { id: 'sym7', name: '樱花曼陀罗', desc: '四叶花对称·日式禅境', emoji: '🌺', bgUrl: `${SB}/sym_bg_07.jpg`, accentColor: '#FDA4AF', overlay: 'rgba(22,10,14,0.34)' },
  { id: 'sym8', name: '水晶方格', desc: '紫水晶六角晶格·神圣', emoji: '💎', bgUrl: `${SB}/sym_bg_08.jpg`, accentColor: '#C4B5FD', overlay: 'rgba(12,8,28,0.36)' },
  // ── 新增对称图案背景（8张）
  { id: 'sym9',  name: '紫金曼陀罗', desc: '深紫底·金线神圣几何', emoji: '🔮', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_09.jpg', accentColor: '#A855F7', overlay: 'rgba(14,6,28,0.40)' },
  { id: 'sym10', name: '彩虹万花筒', desc: '七彩万花筒·疗愈能量', emoji: '🌈', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_10.jpg', accentColor: '#F472B6', overlay: 'rgba(10,6,20,0.36)' },
  { id: 'sym11', name: '伊斯兰星格', desc: '靛蓝松石·阿拉伯几何', emoji: '⭐', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_11.jpg', accentColor: '#38BDF8', overlay: 'rgba(4,12,24,0.38)' },
  { id: 'sym12', name: '莲花禅心', desc: '深蓝底·莲花对称禅意', emoji: '🪷', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_12.jpg', accentColor: '#818CF8', overlay: 'rgba(6,8,22,0.38)' },
  { id: 'sym13', name: '凯尔特金叶', desc: '森林绿底·凯尔特交织', emoji: '🍀', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_13.jpg', accentColor: '#4ADE80', overlay: 'rgba(4,14,6,0.38)' },
  { id: 'sym14', name: '冰晶星芒', desc: '冰蓝底·六角雪晶对称', emoji: '❄️', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_14.jpg', accentColor: '#BAE6FD', overlay: 'rgba(4,10,22,0.36)' },
  { id: 'sym15', name: '火焰扬特拉', desc: '橙金底·三角神圣几何', emoji: '🔺', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_15.jpg', accentColor: '#FB923C', overlay: 'rgba(22,10,4,0.36)' },
  { id: 'sym16', name: '玫瑰花窗', desc: '深蓝底·哥特玫瑰彩窗', emoji: '🌹', bgUrl: 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/backgrounds/sym_bg_16.jpg', accentColor: '#F9A8D4', overlay: 'rgba(8,4,18,0.38)' },
] as const;

type Desktop = typeof DESKTOPS[number];

// ─── 类型定义 ─────────────────────────────────────────────
interface OhCard {
  id: string;
  type: 'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait';
  image_url: string;
  card_index: number;
}

interface PlacedCard {
  uid: string;
  card: OhCard;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  flipped: boolean;
  pinned: boolean;
  // selected: 单击选中态，显示操作按钮
  selected: boolean;
  // enlarged: 双击放大态
  enlarged: boolean;
  // isNew: 刚从抽牌面板拖入，触发入场动画
  isNew?: boolean;
}

// ─── 卡片尺寸常量 ───────────────────────────────────────
// 初始尺寸调大到约1.5倍（原90×120 → 135×180）
const CARD_W = 135;
const CARD_H = 180;
// 放大后尺寸保持原双击放大后的合理大小
const CARD_W_LG = 200;
const CARD_H_LG = 267;

const BACK_URL = 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/back/back_001.jpg';
// 克服牌专用牌背（与OH卡不同）
const OVERCOME_BACK_URL = 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/back/overcome_back_001.jpg';
// 英雄卡专用牌背
const HERO_BACK_URL = 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/hero/hero_back_001.jpg';
// 孩童情况卡专用牌背
const CHILD_SIT_BACK_URL = 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/child/back/child_sit_back_001.jpg';
// 孩童人像卡专用牌背
const CHILD_POR_BACK_URL = 'https://backend.appmiaoda.com/projects/supabase324379980391825408/storage/v1/object/public/oh-cards/child/portrait_back/child_por_back_001.jpg';

interface DraggableCardProps {
  placed: PlacedCard;
  onBringToFront: (uid: string) => void;
  onTogglePin: (uid: string) => void;
  onSelect: (uid: string) => void;
  onDeselect: () => void;
  onRemove: (uid: string) => void;
  onFlip: (uid: string) => void;
  onToggleEnlarge: (uid: string) => void;
  onPositionChange: (uid: string, x: number, y: number) => void;
  onRotationChange: (uid: string, rotation: number) => void;
  onLayerUp: (uid: string) => void;
  onLayerDown: (uid: string) => void;
  /** 纯净模式：隐藏所有操作浮层/标签/角标 */
  pureMode: boolean;
}

function DraggableCard({
  placed, onBringToFront, onTogglePin, onSelect, onDeselect,
  onRemove, onFlip, onToggleEnlarge, onPositionChange, onRotationChange,
  onLayerUp, onLayerDown, pureMode,
}: DraggableCardProps) {
  const translateX = useSharedValue(placed.x);
  const translateY = useSharedValue(placed.y);
  const rotation = useSharedValue(placed.rotation);
  // 翻牌动画：0=背面, 1=正面（[0,0.5)显示背面, [0.5,1]显示正面）
  const flipAnim = useSharedValue(placed.flipped ? 1 : 0);
  // 入场动画：从缩小飞入
  const entryScale = useSharedValue(placed.isNew ? 0.3 : 1);
  const entryOpacity = useSharedValue(placed.isNew ? 0 : 1);
  const isWeb = Platform.OS === 'web';

  const cardW = placed.enlarged ? CARD_W_LG : CARD_W;
  const cardH = placed.enlarged ? CARD_H_LG : CARD_H;

  React.useEffect(() => {
    translateX.value = placed.x;
    translateY.value = placed.y;
  }, [placed.x, placed.y]);

  React.useEffect(() => {
    rotation.value = placed.rotation;
  }, [placed.rotation]);

  // 当 flipped 状态变化时触发3D翻牌动画
  React.useEffect(() => {
    flipAnim.value = withTiming(placed.flipped ? 1 : 0, { duration: 420 });
  }, [placed.flipped]);

  // 入场动画触发（仅首次渲染时）
  React.useEffect(() => {
    if (placed.isNew) {
      entryScale.value = withSpring(1, { damping: 12, stiffness: 180 });
      entryOpacity.value = withSpring(1, { damping: 14, stiffness: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 翻牌前半（背面）：rotateY 0→90deg，opacity 1→0
  const backFaceStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flipAnim.value, [0, 0.5], [0, 90])}deg` }],
    opacity: flipAnim.value < 0.5 ? 1 : 0,
    position: 'absolute' as const,
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden' as const,
  }));

  // 翻牌后半（正面）：rotateY 270→360deg，opacity 0→1
  const frontFaceStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flipAnim.value, [0.5, 1], [270, 360])}deg` }],
    opacity: flipAnim.value >= 0.5 ? 1 : 0,
    position: 'absolute' as const,
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden' as const,
  }));

  // 旋转按钮热区（相对卡片左上角坐标系）：与 RotateHandle 的 VISUAL_OFFSET=26, TOUCH_SIZE=48 保持一致
  // 按钮 right: -(26+7)=-33 → 在卡片坐标 x: [cardW-15, cardW+33]，y: [-33, 15]
  const ROT_HIT_LEFT = cardW - 15;
  const ROT_HIT_TOP = -33;
  const ROT_HIT_RIGHT = cardW + 33;
  const ROT_HIT_BOTTOM = 15;

  // 用 SharedValue 记录本次手势起始是否在旋转按钮热区，实现旋转/拖动完全互斥
  const skipDrag = useSharedValue(false);

  // 单指拖动：起始点在旋转按钮热区时跳过，避免与 RotateHandle 的 rotGesture 互斥
  const dragGesture = Gesture.Pan()
    .enabled(!placed.pinned)
    .minPointers(1)
    .maxPointers(1)
    .minDistance(8)
    .onStart((e) => {
      // 如果触摸起始点在旋转按钮热区内，标记跳过本次拖动
      skipDrag.value = (
        e.x >= ROT_HIT_LEFT && e.x <= ROT_HIT_RIGHT &&
        e.y >= ROT_HIT_TOP && e.y <= ROT_HIT_BOTTOM
      );
    })
    .onUpdate((e) => {
      if (skipDrag.value) return;
      translateX.value = placed.x + e.translationX;
      translateY.value = placed.y + e.translationY;
    })
    .onEnd((e) => {
      if (skipDrag.value) return;
      const nx = placed.x + e.translationX;
      const ny = placed.y + e.translationY;
      runOnJS(onPositionChange)(placed.uid, nx, ny);
      runOnJS(onBringToFront)(placed.uid);
    })
    .onFinalize(() => {
      skipDrag.value = false;
    });

  // 双指旋转（原生端启用，Web 不支持 Rotation 手势）
  const rotateGesture = Gesture.Rotation()
    .enabled(!placed.pinned && !isWeb)
    .onUpdate((e) => {
      rotation.value = placed.rotation + (e.rotation * 180) / Math.PI;
    })
    .onEnd(() => {
      runOnJS(onRotationChange)(placed.uid, rotation.value);
    });

  // 单击：选中卡片，显示操作按钮（maxDistance=8 与 Pan 的 minDistance 保持一致）
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .maxDistance(8)
    .onEnd(() => {
      runOnJS(onBringToFront)(placed.uid);
      if (placed.selected) {
        runOnJS(onDeselect)();
      } else {
        runOnJS(onSelect)(placed.uid);
      }
    });

  // 双击：放大/缩小
  // maxDelay(300) 强制两次点击必须在 300ms 内完成，避免两次慢速拖动被误识别
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .maxDistance(8)
    .onEnd(() => {
      runOnJS(onBringToFront)(placed.uid);
      runOnJS(onToggleEnlarge)(placed.uid);
    });

  // Race 架构：拖动/旋转 与 点击 互斥竞争
  // - 移动超过 minDistance(8) → dragGesture 激活，Tap 被取消
  // - 移动不足 8px → Pan 不激活，Tap 接管处理单/双击
  // - 双指旋转与单指拖动可同时响应（Simultaneous）
  // - 旋转按钮通过内层 GestureDetector 嵌套方式处理（RNGH v2 内层优先）
  const composed = Gesture.Race(
    Gesture.Simultaneous(dragGesture, rotateGesture),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
      { scale: entryScale.value },
    ],
    opacity: entryOpacity.value,
    zIndex: placed.zIndex,
    position: 'absolute' as const,
  }));

  // 选中高亮边框颜色（纯净模式下不显示）
  const borderColor = (!pureMode && placed.selected) ? '#A78BFA' : (!pureMode && placed.pinned) ? '#F59E0B' : 'transparent';
  const borderWidth = (!pureMode && (placed.selected || placed.pinned)) ? 2 : 0;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={animStyle}>
        {/* 卡片本体：前后双面叠加，通过 3D rotateY 动画切换 */}
        <View
          style={{
            width: cardW,
            height: cardH,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: (!pureMode && placed.selected)
              ? '0px 0px 18px rgba(167,139,250,0.6), 0px 6px 20px rgba(0,0,0,0.3)'
              : '0px 4px 12px rgba(0,0,0,0.25)',
            borderWidth,
            borderColor,
          }}
        >
          {/* 背面：各类型用专属牌背，OH卡用标准牌背 */}
          <Animated.View style={backFaceStyle}>
            <Image
              source={{ uri: placed.card.type === 'overcome' ? OVERCOME_BACK_URL
                : placed.card.type === 'hero' ? HERO_BACK_URL
                : placed.card.type === 'child_situation' ? CHILD_SIT_BACK_URL
                : placed.card.type === 'child_portrait' ? CHILD_POR_BACK_URL
                : BACK_URL }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          </Animated.View>
          {/* 正面 */}
          <Animated.View style={frontFaceStyle}>
            <Image source={{ uri: placed.card.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </Animated.View>
        </View>

        {/* 纯净模式下隐藏所有操作浮层 */}
        {!pureMode && (
          <>
            {/* 选中状态：操作按钮浮层（底部）*/}
            {placed.selected && (
              <View style={{
                position: 'absolute',
                bottom: -38,
                left: '50%',
                transform: [{ translateX: -(cardW / 2 + 4) }],
                width: cardW + 8,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}>
                {/* 翻转 */}
                <Pressable
                  onPress={() => onFlip(placed.uid)}
                  style={{
                    backgroundColor: 'rgba(139,92,246,0.88)',
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8,
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                  }}
                >
                  <FlipHorizontal size={13} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                    {placed.flipped ? '背面' : '翻开'}
                  </Text>
                </Pressable>

                {/* 上移一层 */}
                <Pressable
                  onPress={() => onLayerUp(placed.uid)}
                  style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, padding: 8 }}
                >
                  <ArrowUp size={13} color="#fff" />
                </Pressable>

                {/* 下移一层 */}
                <Pressable
                  onPress={() => onLayerDown(placed.uid)}
                  style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, padding: 8 }}
                >
                  <ArrowDown size={13} color="#fff" />
                </Pressable>

                {/* 放大/缩小 */}
                <Pressable
                  onPress={() => onToggleEnlarge(placed.uid)}
                  style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, padding: 8 }}
                >
                  {placed.enlarged
                    ? <Minimize2 size={13} color="#fff" />
                    : <Maximize2 size={13} color="#fff" />
                  }
                </Pressable>

                {/* 删除 */}
                <Pressable
                  onPress={() => onRemove(placed.uid)}
                  style={{ backgroundColor: 'rgba(220,38,38,0.88)', borderRadius: 20, padding: 8 }}
                >
                  <X size={13} color="#fff" />
                </Pressable>
              </View>
            )}

            {/* 旋转拖拽手柄（选中且未固定时显示在右上角，独立 GestureDetector 嵌套） */}
            {placed.selected && !placed.pinned && (
              <RotateHandle
                cardW={cardW}
                cardH={cardH}
                currentRotation={placed.rotation}
                onRotationChange={(r) => onRotationChange(placed.uid, r)}
              />
            )}

            {/* 左上角固定按钮（仅选中时显示，点击切换固定状态；固定时高亮琥珀色） */}
            {placed.selected && (
              <Pressable
                onPress={() => onTogglePin(placed.uid)}
                style={{
                  position: 'absolute', top: -10, left: -10,
                  backgroundColor: placed.pinned ? '#F59E0B' : 'rgba(0,0,0,0.55)',
                  borderRadius: 12, padding: 5,
                  boxShadow: '0px 2px 6px rgba(0,0,0,0.3)',
                  borderWidth: 1.5,
                  borderColor: placed.pinned ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
                }}
              >
                <Pin size={11} color="#fff" />
              </Pressable>
            )}

            {/* 左上角固定角标（未选中但已固定时显示，提示固定状态） */}
            {!placed.selected && placed.pinned && (
              <View style={{
                position: 'absolute', top: -8, left: -8,
                backgroundColor: '#F59E0B',
                borderRadius: 10, padding: 4,
                boxShadow: '0px 2px 4px rgba(0,0,0,0.3)',
              }}>
                <Pin size={9} color="#fff" />
              </View>
            )}

            {/* 放大角标（未选中时显示） */}
            {placed.enlarged && !placed.selected && (
              <View style={{
                position: 'absolute', top: 4, right: 4,
                backgroundColor: 'rgba(139,92,246,0.7)', borderRadius: 8, padding: 3,
              }}>
                <Maximize2 size={9} color="#fff" />
              </View>
            )}
          </>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── 旋转拖拽手柄（独立 GestureDetector，嵌套在卡片内，RNGH v2 内层优先） ──────
interface RotateHandleProps {
  cardW: number;
  cardH: number;
  currentRotation: number;
  onRotationChange: (rotation: number) => void;
}

function RotateHandle({ cardW, cardH, currentRotation, onRotationChange }: RotateHandleProps) {
  const TOUCH_SIZE = 48;
  const VISUAL_SIZE = 34;
  // 视觉偏移量：按钮远离卡片边缘，减少边缘误触
  const VISUAL_OFFSET = 26;
  // 旋转计算基准偏移量：与视觉解耦，保持旋转灵敏度不变
  const ROT_CALC_OFFSET = 16;

  // 旋转算法基准点（卡片本地坐标系，固定用 ROT_CALC_OFFSET 保证灵敏度不随视觉位置改变）
  const handleCx = cardW + ROT_CALC_OFFSET;
  const handleCy = -ROT_CALC_OFFSET;
  const centerX = cardW / 2;
  const centerY = cardH / 2;

  const startAngle = useSharedValue(0);
  const startRotation = useSharedValue(currentRotation);

  const rotGesture = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      startAngle.value = Math.atan2(handleCy - centerY, handleCx - centerX) * (180 / Math.PI);
      startRotation.value = currentRotation;
    })
    .onUpdate((e) => {
      const dx = handleCx + e.translationX - centerX;
      const dy = handleCy + e.translationY - centerY;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      let delta = angle - startAngle.value;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      runOnJS(onRotationChange)(startRotation.value + delta);
    });

  const hitOffset = (TOUCH_SIZE - VISUAL_SIZE) / 2;

  return (
    <GestureDetector gesture={rotGesture}>
      <View
        style={{
          position: 'absolute',
          right: -(VISUAL_OFFSET + hitOffset),
          top: -(VISUAL_OFFSET + hitOffset),
          width: TOUCH_SIZE,
          height: TOUCH_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
        <View style={{
          width: VISUAL_SIZE,
          height: VISUAL_SIZE,
          borderRadius: VISUAL_SIZE / 2,
          backgroundColor: 'rgba(139,92,246,0.92)',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0px 2px 10px rgba(0,0,0,0.40)',
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.45)',
        }}>
          <RotateCw size={16} color="#fff" />
        </View>
      </View>
    </GestureDetector>
  );
}

// ─── 纯净模式浮动按钮（可自由拖动） ──────────────────────────
// 点击切换纯净模式，长按拖动到屏幕任意位置
interface PureModeButtonProps {
  pureMode: boolean;
  onToggle: () => void;
  initX: number;
  initY: number;
  screenW: number;
  screenH: number;
}

function PureModeButton({ pureMode, onToggle, initX, initY, screenW, screenH }: PureModeButtonProps) {
  const BTN_SIZE = 44;
  const MARGIN = 8;

  const posX = useSharedValue(initX);
  const posY = useSharedValue(initY);
  const startX = useSharedValue(initX);
  const startY = useSharedValue(initY);

  // 图标淡入淡出动画
  const iconOpacity = useSharedValue(1);
  React.useEffect(() => {
    iconOpacity.value = withTiming(pureMode ? 0.7 : 1, { duration: 200 });
  }, [pureMode]);

  // ── 点击：切换纯净模式（Tap 手势，maxDistance 防误触）──
  const tapGesture = Gesture.Tap()
    .maxDistance(8)
    .onEnd(() => {
      runOnJS(onToggle)();
    });

  // ── 拖动：自由拖动到屏幕任意位置（Pan 手势，minDistance 防抖）──
  const panGesture = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      startX.value = posX.value;
      startY.value = posY.value;
    })
    .onUpdate((e) => {
      posX.value = Math.max(MARGIN, Math.min(screenW - BTN_SIZE - MARGIN, startX.value + e.translationX));
      posY.value = Math.max(MARGIN + 40, Math.min(screenH - BTN_SIZE - MARGIN - 20, startY.value + e.translationY));
    });

  // Exclusive：tap 优先竞争，移动超过 maxDistance 后 tap 失败、pan 接管
  const composed = Gesture.Exclusive(tapGesture, panGesture);

  const animStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: posX.value,
    top: posY.value,
    zIndex: 9999,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={animStyle}>
        <View style={{
          width: BTN_SIZE,
          height: BTN_SIZE,
          borderRadius: BTN_SIZE / 2,
          backgroundColor: pureMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.38)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: pureMode ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)',
          boxShadow: '0px 3px 12px rgba(0,0,0,0.35)',
        }}>
          <Animated.View style={iconStyle}>
            {pureMode
              ? <Eye size={18} color="#fff" />
              : <EyeOff size={18} color="#fff" />
            }
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── 抽牌面板（底部横向滑动） ──────────────────────────────
// 功能：展示随机洗牌后的卡牌，可左右滑动，点击即放置到桌面中央
interface DrawPanelProps {
  visible: boolean;
  allCards: OhCard[];
  cardType: 'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait';
  onChangeType: (t: 'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait') => void;
  onClose: () => void;
  onDrawCard: (card: OhCard) => void;
  onShuffle: () => void;
  drawnIds: Set<string>;   // 已抽到桌面的卡牌ID集合（灰显）
}

// 卡牌类型标签配置
const CARD_TYPE_TABS: { key: 'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait'; label: string }[] = [
  { key: 'image', label: '图像卡' },
  { key: 'text', label: '文字卡' },
  { key: 'overcome', label: '克服卡' },
  { key: 'hero', label: '英雄卡' },
  { key: 'child_situation', label: '孩童情况' },
  { key: 'child_portrait', label: '孩童人像' },
];

function DrawPanel({ visible, allCards, cardType, onChangeType, onClose, onDrawCard, onShuffle, drawnIds }: DrawPanelProps) {
  const cards = allCards.filter(c => c.type === cardType);

  if (!visible) return null;

  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      zIndex: 9998,
    }}>
      <View style={{
        backgroundColor: 'rgba(252,248,243,0.97)',
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        paddingBottom: 32,
        boxShadow: '0px -4px 28px rgba(180,140,100,0.18)',
        maxHeight: 560,
      }}>
        {/* 把手 */}
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(160,120,80,0.2)' }} />
        </View>

        {/* 标题栏：与抽卡库风格统一 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
          <Text style={{ color: '#5C3D1E', fontWeight: '700', fontSize: 16, flex: 1 }}>
            🃏 抽取卡牌
          </Text>
          {/* 提示文字 */}
          <Text style={{ color: 'rgba(120,90,60,0.4)', fontSize: 11, marginRight: 8 }}>
            点击抽取
          </Text>
          {/* 洗牌按钮 */}
          <Pressable
            onPress={onShuffle}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: 'rgba(180,130,70,0.12)',
              borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
              marginRight: 8,
              borderWidth: 1, borderColor: 'rgba(180,130,70,0.25)',
            }}
          >
            <Shuffle size={13} color="#A0763A" />
            <Text style={{ color: '#A0763A', fontSize: 12, fontWeight: '600' }}>洗牌</Text>
          </Pressable>
          {/* 关闭 */}
          <Pressable
            onPress={onClose}
            style={{ backgroundColor: 'rgba(180,130,70,0.1)', borderRadius: 14, padding: 6 }}
          >
            <ChevronDown size={18} color="#A0763A" />
          </Pressable>
        </View>

        {/* 类型切换 Tab（横向滚动，支持5个以上标签） */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexShrink: 0 }}
          contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 14 }}
        >
          {CARD_TYPE_TABS.map(tab => (
            <Pressable
              key={tab.key}
              onPress={() => onChangeType(tab.key)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
                backgroundColor: cardType === tab.key ? '#C0874A' : 'rgba(180,130,70,0.08)',
                borderWidth: 1,
                borderColor: cardType === tab.key ? '#C0874A' : 'rgba(180,130,70,0.2)',
              }}
            >
              <Text style={{
                color: cardType === tab.key ? '#fff' : '#A0763A',
                fontSize: 12, fontWeight: cardType === tab.key ? '700' : '500',
              }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* 纵向滚动卡牌网格（4列） */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cards.map(card => {
              const isDrawn = drawnIds.has(card.id);
              return (
                <Pressable
                  key={card.id}
                  onPress={() => !isDrawn && onDrawCard(card)}
                  style={{ opacity: isDrawn ? 0.35 : 1, width: 68 }}
                >
                  <View style={{
                    width: 68, height: 91,
                    borderRadius: 10, overflow: 'hidden',
                    boxShadow: isDrawn ? 'none' : '0px 3px 10px rgba(120,80,40,0.2)',
                    borderWidth: 1,
                    borderColor: isDrawn ? 'transparent' : 'rgba(200,160,100,0.25)',
                  }}>
                    <Image
                      source={{ uri: card.type === 'overcome' ? OVERCOME_BACK_URL
                        : card.type === 'hero' ? HERO_BACK_URL
                        : card.type === 'child_situation' ? CHILD_SIT_BACK_URL
                        : card.type === 'child_portrait' ? CHILD_POR_BACK_URL
                        : BACK_URL }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                    {isDrawn && (
                      <View style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(255,255,255,0.55)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ color: '#C0874A', fontSize: 18, fontWeight: '700' }}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{
                    color: isDrawn ? 'rgba(120,90,60,0.3)' : 'rgba(120,90,60,0.55)',
                    fontSize: 9, textAlign: 'center', marginTop: 3,
                  }}>
                    #{card.card_index}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── 桌面选择 Modal ─────────────────────────────────────────
interface DesktopPickerProps {
  visible: boolean;
  current: Desktop;
  onSelect: (d: Desktop) => void;
  onClose: () => void;
}

function DesktopPicker({ visible, current, onSelect, onClose }: DesktopPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: '#12122a',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingBottom: 32, maxHeight: '75%',
        }}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>选择投射桌面</Text>
            <Pressable onPress={onClose}><X size={20} color="rgba(255,255,255,0.5)" /></Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
            {DESKTOPS.map(d => (
              <Pressable
                key={d.id}
                onPress={() => { onSelect(d); onClose(); }}
                style={{
                  borderRadius: 16, overflow: 'hidden',
                  borderWidth: current.id === d.id ? 2 : 0,
                  borderColor: d.accentColor,
                }}
              >
                <ImageBackground
                  source={{ uri: d.bgUrl }}
                  style={{ height: 72 }}
                  imageStyle={{ opacity: 0.4 }}
                >
                  <View style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: d.overlay ?? 'rgba(13,13,32,0.55)',
                  }} />
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
                    <Text style={{ fontSize: 24 }}>{d.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{d.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 }}>{d.desc}</Text>
                    </View>
                    {current.id === d.id && (
                      <View style={{ backgroundColor: d.accentColor, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>当前</Text>
                      </View>
                    )}
                  </View>
                </ImageBackground>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── 卡牌库抽屉 ─────────────────────────────────────────────
interface CardLibraryProps {
  visible: boolean;
  cardType: 'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait';
  cards: OhCard[];
  loading: boolean;
  onClose: () => void;
  onSelectCard: (card: OhCard) => void;
  onChangeType: (type: 'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait') => void;
}

function CardLibraryDrawer({
  visible, cardType, cards, loading,
  onClose, onSelectCard, onChangeType,
}: CardLibraryProps) {
  if (!visible) return null;

  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: 'rgba(252,248,243,0.98)',
      borderTopLeftRadius: 26, borderTopRightRadius: 26,
      paddingBottom: 28, maxHeight: 520,
      zIndex: 9999,
      boxShadow: '0px -4px 28px rgba(180,140,100,0.18)',
    }}>
      {/* 把手 */}
      <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 6 }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(160,120,80,0.2)' }} />
      </View>

      {/* 标题行：卡牌库 + 关闭按钮 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 8 }}>
        <Text style={{ color: '#5C3D1E', fontWeight: '700', fontSize: 16, flex: 1 }}>📚 卡牌库</Text>
        <Pressable
          onPress={onClose}
          style={{ backgroundColor: 'rgba(180,130,70,0.1)', borderRadius: 14, padding: 6 }}
        >
          <X size={18} color="#A0763A" />
        </Pressable>
      </View>

      {/* 类型 Tab（横向滚动） */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexShrink: 0 }}
        contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 18, marginBottom: 12 }}
      >
        {CARD_TYPE_TABS.map(tab => (
          <Pressable
            key={tab.key}
            onPress={() => onChangeType(tab.key)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
              backgroundColor: cardType === tab.key ? '#C0874A' : 'rgba(180,130,70,0.08)',
              borderWidth: 1,
              borderColor: cardType === tab.key ? '#C0874A' : 'rgba(180,130,70,0.2)',
            }}
          >
            <Text style={{
              color: cardType === tab.key ? '#fff' : '#A0763A',
              fontSize: 12, fontWeight: cardType === tab.key ? '700' : '500',
            }}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* 卡牌网格（全量连续滚动，无分页） */}
      {loading ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
          <ActivityIndicator color="#C0874A" size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cards.map(card => (
              <Pressable
                key={card.id}
                onPress={() => onSelectCard(card)}
                style={{
                  width: 76, height: 101, borderRadius: 9, overflow: 'hidden',
                  boxShadow: '0px 2px 8px rgba(120,80,40,0.18)',
                  borderWidth: 1, borderColor: 'rgba(200,160,100,0.2)',
                }}
              >
                <Image source={{ uri: card.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── AI解读 Modal ─────────────────────────────────────────
interface InterpretModalProps {
  visible: boolean;
  loading: boolean;
  result: string;
  error: string;
  desktopName: string;
  onClose: () => void;
  onSave: () => void;
  onGoConsult: () => void;
}

function InterpretModal({ visible, loading, result, error, onClose, onSave, onGoConsult }: InterpretModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: '#0f0f1e',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: 24, maxHeight: '80%',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="#8B5CF6" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>AI 牌阵解读</Text>
            </View>
            <Pressable onPress={onClose}><X size={22} color="rgba(255,255,255,0.5)" /></Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
            {loading && (
              <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
                <ActivityIndicator color="#8B5CF6" size="large" />
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>正在感受你的牌阵…</Text>
              </View>
            )}
            {!loading && error && (
              <Text style={{ color: '#F87171', fontSize: 14, lineHeight: 22 }}>{error}</Text>
            )}
            {!loading && result && (
              <>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 24 }}>{result}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, lineHeight: 18, marginTop: 16, fontStyle: 'italic' }}>
                  ⚠️ 本解读仅为投射性探索，不构成诊断或医疗建议
                </Text>
              </>
            )}
          </ScrollView>

          {!loading && result && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <Pressable
                onPress={onSave}
                style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              >
                <Archive size={16} color="rgba(255,255,255,0.6)" />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>存档</Text>
              </Pressable>
              <Pressable
                onPress={onGoConsult}
                style={{ flex: 1, backgroundColor: '#8B5CF6', borderRadius: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              >
                <BookOpen size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>去咨询深入探索</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── 工具函数：Fisher-Yates 洗牌 ──────────────────────────
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── 主游戏页面 ─────────────────────────────────────────────
let uidCounter = 0;
function genUid() { return `card_${++uidCounter}_${Date.now()}`; }

export default function OhCardGameScreen() {
  const router = useRouter();
  const { width: W, height: H } = useWindowDimensions();

  // ── 桌面主题状态 ───────────────────────────────────────
  // ── 默认桌面改为扬特拉冥想（sym5）
  const [desktop, setDesktop] = useState<Desktop>(
    DESKTOPS.find(d => d.id === 'sym5') ?? DESKTOPS[0]
  );
  const [desktopPickerVisible, setDesktopPickerVisible] = useState(false);

  // ── 卡牌库状态 ─────────────────────────────────────────
  const [allCards, setAllCards] = useState<OhCard[]>([]);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [cardType, setCardType] = useState<'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait'>('image');
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ── 抽牌面板状态 ────────────────────────────────────────
  const [drawPanelVisible, setDrawPanelVisible] = useState(false);
  const [drawCardType, setDrawCardType] = useState<'image' | 'text' | 'overcome' | 'hero' | 'child_situation' | 'child_portrait'>('image');
  // 洗牌后的随机顺序卡牌列表
  const [shuffledCards, setShuffledCards] = useState<OhCard[]>([]);

  const filteredCards = allCards.filter(c => c.type === cardType);

  // ── 桌面卡牌状态 ─────────────────────────────────────────
  const [placedCards, setPlacedCards] = useState<PlacedCard[]>([]);
  const zIndexRef = useRef(1);

  // ── 纯净模式 ──────────────────────────────────────────
  const [pureMode, setPureMode] = useState(false);

  // ── AI解读状态 ─────────────────────────────────────────
  const [interpretVisible, setInterpretVisible] = useState(false);
  const [interpretLoading, setInterpretLoading] = useState(false);
  const [interpretResult, setInterpretResult] = useState('');
  const [interpretError, setInterpretError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── 已抽到桌面的卡牌ID集合 ────────────────────────────
  const drawnIds = new Set(placedCards.map(p => p.card.id));

  // ── 加载卡牌库 ─────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (allCards.length > 0) return;
        setLibraryLoading(true);
        const { data } = await supabase
          .from('oh_cards')
          .select('*')
          .in('type', ['image', 'text', 'overcome', 'hero', 'child_situation', 'child_portrait'])
          .order('card_index');
        if (data) {
          setAllCards(data as OhCard[]);
          setShuffledCards(shuffleArray(data as OhCard[]));
        }
        setLibraryLoading(false);
      })();
    }, [allCards.length]),
  );

  // ── 打开抽牌面板 ───────────────────────────────────────
  const handleOpenDrawPanel = useCallback(() => {
    // 初次或重新洗牌时对当前类型卡牌随机排序
    if (shuffledCards.length === 0 && allCards.length > 0) {
      setShuffledCards(shuffleArray(allCards));
    }
    setDrawPanelVisible(true);
    // 关闭卡牌库（互斥）
    setLibraryVisible(false);
  }, [shuffledCards.length, allCards]);

  // ── 洗牌 ───────────────────────────────────────────────
  const handleShuffle = useCallback(() => {
    setShuffledCards(shuffleArray(allCards));
  }, [allCards]);

  // ── 桌面操作 ─────────────────────────────────────────
  const handleBringToFront = useCallback((uid: string) => {
    zIndexRef.current += 1;
    setPlacedCards(prev => prev.map(p => p.uid === uid ? { ...p, zIndex: zIndexRef.current } : p));
  }, []);

  // 上移一层：当前 zIndex + 2（超过紧邻上层）
  const handleLayerUp = useCallback((uid: string) => {
    setPlacedCards(prev => {
      const card = prev.find(p => p.uid === uid);
      if (!card) return prev;
      const newZ = card.zIndex + 2;
      if (newZ > zIndexRef.current) zIndexRef.current = newZ;
      return prev.map(p => p.uid === uid ? { ...p, zIndex: newZ } : p);
    });
  }, []);

  // 下移一层：当前 zIndex - 2（低于紧邻下层），最小值为 1
  const handleLayerDown = useCallback((uid: string) => {
    setPlacedCards(prev => {
      const card = prev.find(p => p.uid === uid);
      if (!card) return prev;
      const newZ = Math.max(1, card.zIndex - 2);
      return prev.map(p => p.uid === uid ? { ...p, zIndex: newZ } : p);
    });
  }, []);

  const handleTogglePin = useCallback((uid: string) => {
    setPlacedCards(prev => prev.map(p => p.uid === uid ? { ...p, pinned: !p.pinned } : p));
  }, []);

  // 选中：取消其他卡片的选中，选中目标卡片
  const handleSelect = useCallback((uid: string) => {
    setPlacedCards(prev => prev.map(p => ({
      ...p, selected: p.uid === uid,
    })));
  }, []);

  // 取消所有卡片选中（点击桌面空白处时调用）
  const handleDeselect = useCallback(() => {
    setPlacedCards(prev => prev.map(p => ({ ...p, selected: false })));
  }, []);

  const handleRemove = useCallback((uid: string) => {
    setPlacedCards(prev => prev.filter(p => p.uid !== uid));
  }, []);

  const handleFlip = useCallback((uid: string) => {
    setPlacedCards(prev => prev.map(p => p.uid === uid ? { ...p, flipped: !p.flipped } : p));
  }, []);

  const handleToggleEnlarge = useCallback((uid: string) => {
    setPlacedCards(prev => prev.map(p => p.uid === uid ? { ...p, enlarged: !p.enlarged } : p));
  }, []);

  const handlePositionChange = useCallback((uid: string, x: number, y: number) => {
    setPlacedCards(prev => prev.map(p => p.uid === uid ? { ...p, x, y } : p));
  }, []);

  const handleRotationChange = useCallback((uid: string, rotation: number) => {
    setPlacedCards(prev => prev.map(p => p.uid === uid ? { ...p, rotation } : p));
  }, []);

  // 从卡牌库选择一张（直接添加到桌面中央）
  const handleSelectCard = useCallback((card: OhCard) => {
    const cx = W / 2 - CARD_W / 2 + (Math.random() - 0.5) * 80;
    const cy = H / 2 - CARD_H / 2 + (Math.random() - 0.5) * 60;
    zIndexRef.current += 1;
    setPlacedCards(prev => [
      ...prev,
      {
        uid: genUid(), card,
        x: cx, y: cy,
        rotation: (Math.random() - 0.5) * 20,
        zIndex: zIndexRef.current,
        // 从卡牌库挑选：用户已看到正面，直接正面朝上放入桌面
        flipped: true, pinned: false,
        selected: false, enlarged: false,
        isNew: true,
      },
    ]);
    setLibraryVisible(false);
  }, [W, H]);

  // 从抽牌面板抽取一张（放置到桌面）
  const handleDrawCard = useCallback((card: OhCard) => {
    // 分散放置，避免重叠
    const existingCount = placedCards.length;
    const angle = (existingCount * 137.5) % 360; // 黄金角度分布
    const radius = Math.min(W, H) * 0.25;
    const cx = W / 2 - CARD_W / 2 + Math.cos(angle * Math.PI / 180) * radius * 0.6;
    const cy = H / 2 - CARD_H / 2 + Math.sin(angle * Math.PI / 180) * radius * 0.5;
    zIndexRef.current += 1;
    setPlacedCards(prev => [
      ...prev,
      {
        uid: genUid(), card,
        x: Math.max(8, Math.min(W - CARD_W - 8, cx)),
        y: Math.max(100, Math.min(H - CARD_H - 80, cy)),
        rotation: (Math.random() - 0.5) * 24,
        zIndex: zIndexRef.current,
        flipped: false, pinned: false,
        selected: false, enlarged: false,
        isNew: true, // 触发入场弹出动画
      },
    ]);
  }, [W, H, placedCards.length]);

  const handleReset = useCallback(() => { setPlacedCards([]); }, []);

  // ── 纯净模式切换 ──────────────────────────────────────────
  const handleTogglePureMode = useCallback(() => {
    setPureMode(prev => {
      const next = !prev;
      if (next) {
        // 进入纯净模式：关闭所有面板、取消选中
        setDrawPanelVisible(false);
        setLibraryVisible(false);
        setPlacedCards(cards => cards.map(c => ({ ...c, selected: false })));
      }
      return next;
    });
  }, []);

  // ── AI解读 ─────────────────────────────────────────────
  const handleInterpret = async () => {
    if (placedCards.length === 0) return;
    setInterpretVisible(true);
    setInterpretLoading(true);
    setInterpretResult('');
    setInterpretError('');

    // 校验并扣减每日 AI 积分（每次解读消耗 5 点积分）
    const quota = await checkAndConsumeCredits(5);
    if (!quota.allowed) {
      setInterpretError(quota.message || '今日 AI 积分不足（单次解读消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
      setInterpretLoading(false);
      return;
    }

    const cardDescriptions = placedCards
      .filter(p => p.flipped)
      .map((p, i) => `卡${i + 1}: ${p.card.type === 'image' ? '图像卡' : '文字卡'}（编号${p.card.card_index}）`)
      .join('；');

    try {
      const { data, error } = await supabase.functions.invoke('oh-card-interpret', {
        body: {
          cards: placedCards.filter(p => p.flipped).map(p => ({
            type: p.card.type,
            card_index: p.card.card_index,
            image_url: p.card.image_url,
          })),
          cardDescriptions,
          desktopName: desktop.name,
        },
      });
      if (error) throw error;
      setInterpretResult(data?.interpretation || '暂无解读结果');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setInterpretError(`解读失败：${msg}`);
    } finally {
      setInterpretLoading(false);
    }
  };

  // ── 存档 ─────────────────────────────────────────────
  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('oh_card_records').insert({
      user_id: user.id,
      ai_interpretation: interpretResult,
      cards_used: placedCards.map(p => ({
        card_id: p.card.id, card_type: p.card.type,
        card_index: p.card.card_index, flipped: p.flipped,
        x: p.x, y: p.y, rotation: p.rotation,
      })),
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
    setInterpretVisible(false);
  };

  const handleGoConsult = () => {
    setInterpretVisible(false);
    router.push('/(app)/(tabs)/heal' as RelativePathString);
  };

  const flippedCount = placedCards.filter(p => p.flipped).length;
  // 抽牌面板中当前类型的洗牌卡牌
  const drawPanelCards = shuffledCards.filter(c => c.type === drawCardType);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* 桌面背景 */}
      <ImageBackground
        source={{ uri: desktop.bgUrl }}
        style={{ flex: 1 }}
        imageStyle={{ opacity: 0.55 }}
      >
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: desktop.overlay ?? 'rgba(13,13,32,0.55)',
        }} />

        {/* ── 顶部工具栏（透明，只保留裸按钮；纯净模式下隐藏） ─── */}
        {!pureMode && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
            paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16,
            flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            {/* 返回 */}
            <Pressable
              onPress={() => router.back()}
              style={{
                backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 22, padding: 9,
              }}
            >
              <ArrowLeft size={18} color="#fff" />
            </Pressable>

            {/* 桌面名称（可点击切换） */}
            <Pressable
              onPress={() => setDesktopPickerVisible(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ fontSize: 20 }}>{desktop.emoji}</Text>
              <View>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                  {desktop.name}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                  {placedCards.length} 张 · 轻触切换桌面
                </Text>
              </View>
            </Pressable>

            {/* 复位 */}
            <Pressable
              onPress={handleReset}
              style={{
                backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 22, padding: 9,
              }}
            >
              <RotateCcw size={16} color="#fff" />
            </Pressable>

            {/* 切换桌面 */}
            <Pressable
              onPress={() => setDesktopPickerVisible(true)}
              style={{
                backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 22, padding: 9,
              }}
            >
              <Layout size={16} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* ── 卡牌桌面（点击空白取消选中） ─── */}
        <Pressable
          onPress={handleDeselect}
          style={{ flex: 1 }}
        >
          {placedCards.map(placed => (
            <DraggableCard
              key={placed.uid}
              placed={placed}
              pureMode={pureMode}
              onBringToFront={handleBringToFront}
              onTogglePin={handleTogglePin}
              onSelect={handleSelect}
              onDeselect={handleDeselect}
              onRemove={handleRemove}
              onFlip={handleFlip}
              onToggleEnlarge={handleToggleEnlarge}
              onPositionChange={handlePositionChange}
              onRotationChange={handleRotationChange}
              onLayerUp={handleLayerUp}
              onLayerDown={handleLayerDown}
            />
          ))}

          {/* 空白提示：纯净模式下隐藏 */}
          {placedCards.length === 0 && !pureMode && (
            <View style={{ position: 'absolute', top: '35%', left: '50%', transform: [{ translateX: -120 }], alignItems: 'center', width: 240 }}>
              <Text style={{ fontSize: 42, marginBottom: 12 }}>🃏</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
                点击下方「抽牌」{'\n'}将卡牌拖入内心空间
              </Text>
            </View>
          )}
        </Pressable>

        {/* ── 底部操作栏（纯净模式下隐藏） ─── */}
        {!pureMode && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
            paddingBottom: 40, paddingTop: 16, paddingHorizontal: 24,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20,
          }}>
            {/* 卡牌库（小圆按钮） */}
            <Pressable
              onPress={() => { setLibraryVisible(true); setDrawPanelVisible(false); }}
              style={{
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <BookOpen size={20} color="#fff" />
            </Pressable>

            {/* 抽牌（中央大圆按钮） */}
            <Pressable
              onPress={handleOpenDrawPanel}
              style={{
                width: 68, height: 68, borderRadius: 34,
                backgroundColor: drawPanelVisible ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: drawPanelVisible ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
              }}
            >
              {drawPanelVisible
                ? <ChevronDown size={26} color="#fff" />
                : <Layers size={26} color="#fff" />
              }
            </Pressable>

            {/* AI解读（小圆按钮） */}
            <Pressable
              onPress={handleInterpret}
              disabled={flippedCount === 0}
              style={{
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: flippedCount > 0 ? 'rgba(192,135,74,0.85)' : 'rgba(0,0,0,0.35)',
                alignItems: 'center', justifyContent: 'center',
                opacity: flippedCount === 0 ? 0.5 : 1,
              }}
            >
              <Sparkles size={20} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* ── 纯净模式浮动按钮（可拖动，始终置顶，zIndex 最高） ─── */}
        <PureModeButton
          pureMode={pureMode}
          onToggle={handleTogglePureMode}
          initX={W - 72}
          initY={H - 180}
          screenW={W}
          screenH={H}
        />

        {/* ── 抽牌面板（纯净模式下不渲染） ─── */}
        {drawPanelVisible && !pureMode && (
          <DrawPanel
            visible={drawPanelVisible}
            allCards={shuffledCards}
            cardType={drawCardType}
            onChangeType={(t) => { setDrawCardType(t); }}
            onClose={() => setDrawPanelVisible(false)}
            onDrawCard={(card) => {
              handleDrawCard(card);
            }}
            onShuffle={handleShuffle}
            drawnIds={drawnIds}
          />
        )}

        {/* ── 卡牌库抽屉（纯净模式下不渲染） ─── */}
        {!pureMode && (
          <CardLibraryDrawer
            visible={libraryVisible}
            cardType={cardType}
            cards={filteredCards}
            loading={libraryLoading}
            onClose={() => setLibraryVisible(false)}
            onSelectCard={handleSelectCard}
            onChangeType={(t) => { setCardType(t); }}
          />
        )}

        {/* ── 桌面选择弹窗 ─── */}
        <DesktopPicker
          visible={desktopPickerVisible}
          current={desktop}
          onSelect={setDesktop}
          onClose={() => setDesktopPickerVisible(false)}
        />

        {/* ── AI解读弹窗 ─── */}
        <InterpretModal
          visible={interpretVisible}
          loading={interpretLoading}
          result={interpretResult}
          error={interpretError}
          desktopName={desktop.name}
          onClose={() => setInterpretVisible(false)}
          onSave={handleSave}
          onGoConsult={handleGoConsult}
        />

        {/* 存档成功提示 */}
        {saveSuccess && (
          <View style={{
            position: 'absolute', top: 120, left: W / 2 - 80, zIndex: 9999,
            backgroundColor: '#10B981', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10,
          }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>✓ 已归档至「我的」</Text>
          </View>
        )}
      </ImageBackground>
    </GestureHandlerRootView>
  );
}
