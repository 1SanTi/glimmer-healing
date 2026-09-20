/**
 * painting-house.tsx — 心绘小屋
 * 心理教师 AI 可视化创作工具
 * 三大模式：心理故事漫画化 / 心理理论科普图 / 游戏规则可视化
 * 简易模式 + 画布模式双轨制
 * 画布模式：项目管理 → 巨型画布工作区 → 节点卡片生成
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput,
  ActivityIndicator, Modal, useWindowDimensions,
  KeyboardAvoidingView, PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Sparkles, X, Download, Clock,
  Trash2, CheckCircle2, AlertCircle, Wand2,
  Plus, FolderOpen, ChevronRight,
  RefreshCw, ImageIcon, Maximize2, GitBranch,
  Palette, Map, Crosshair, Scissors, Pen, Eraser,
} from 'lucide-react-native';
import {
  Gesture, GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withRepeat, withTiming, Easing,
  useAnimatedProps,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Svg, Defs, ClipPath, Marker, Path, G, Text as SvgText, Rect, Pattern } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

// ── 主题色 ──────────────────────────────────────────────────────
const T = {
  bg:        '#F8F6FF',
  canvasBg:  '#F0EDF9',   // 画布深背景
  card:      '#FFFFFF',
  primary:   '#9B8EC4',
  accent:    '#7BBFB5',
  warm:      '#F5B8A0',
  text:      '#2C2456',
  sub:       '#8A84A8',
  border:    '#E8E4F4',
  teal:      '#7BBFB5',
  lavender:  '#C3B8E8',
  dot:       'rgba(155,142,196,0.15)',  // 画布点阵色
};

// ── 创作模式 ──────────────────────────────────────────────────────
type WorkMode  = 'story' | 'theory' | 'game' | 'poster';
type GenStyle  = 'healing' | 'cartoon' | 'sketch' | 'infograph' | 'flow'
  | 'pixel' | 'papercut' | 'retro' | 'ghibli' | 'blueprint' | 'doodle' | 'flat' | 'realistic';
type Aspect    = '1:1' | '4:3' | '16:9' | '3:4' | '9:16';
type GenModel = 'gpt' | 'vidu' | 'hunyuan'; // gpt=默认模型, vidu=Vidu-Image-q2, hunyuan=混元hy-image-v3
type WorkStatus = 'pending' | 'generating' | 'done' | 'error';
type AppMode = 'simple' | 'canvas';
type CanvasView = 'projects' | 'workspace'; // 画布模式内部页面

const MODES: { id: WorkMode; emoji: string; label: string; desc: string; placeholder: string; color: string }[] = [
  {
    id: 'story', emoji: '📖', label: '心理故事漫画化', color: T.warm,
    desc: '将心理小故事或案例描述转化为治愈漫画',
    placeholder: '例如：小明因为考试失利感到沮丧，他的好朋友小华过来安慰他，两人一起讨论如何面对挫折。最终小明明白失败是成长的机会……',
  },
  {
    id: 'theory', emoji: '🧠', label: '心理理论科普图', color: T.primary,
    desc: '将心理学理论转化为层次清晰的科普讲解图',
    placeholder: '例如：马斯洛需求层次理论——生理需求、安全需求、社交需求、尊重需求、自我实现需求，从底层到顶层逐级递进……',
  },
  {
    id: 'game', emoji: '🎮', label: '游戏规则可视化', color: T.accent,
    desc: '将课堂游戏活动规则转化为可视化流程图',
    placeholder: '步骤1：所有同学围坐成圆形\n步骤2：每人抽取一张情绪卡片\n步骤3：用身体动作表演卡片上的情绪\n步骤4：其他同学猜测是什么情绪……',
  },
  {
    id: 'poster', emoji: '📢', label: '心育海报宣传图', color: '#7C3AED',
    desc: '生成心理健康教育主题的宣传海报，适合校园展示、活动推广',
    placeholder: '例如：以"关注心理健康，拥抱美好生活"为主题，设计一张面向青少年的心理健康宣传海报，包含积极向上的主题文字和温暖的插画元素……',
  },
];

const STYLES: { id: GenStyle; label: string; emoji: string }[] = [
  { id: 'healing',    label: '治愈水彩', emoji: '🎨' },
  { id: 'cartoon',    label: '可爱卡通', emoji: '✏️' },
  { id: 'sketch',     label: '极简手绘', emoji: '🖊️' },
  { id: 'infograph',  label: '信息图表', emoji: '📊' },
  { id: 'flow',       label: '流程可视', emoji: '🔀' },
  { id: 'pixel',      label: '像素艺术', emoji: '🕹️' },
  { id: 'papercut',   label: '剪纸插画', emoji: '✂️' },
  { id: 'retro',      label: '复古海报', emoji: '📯' },
  { id: 'ghibli',     label: '吉卜力风', emoji: '🌿' },
  { id: 'blueprint',  label: '蓝图线稿', emoji: '📐' },
  { id: 'doodle',     label: '涂鸦贴纸', emoji: '🖍️' },
  { id: 'flat',       label: '扁平插画', emoji: '🟣' },
  { id: 'realistic',  label: '逼真写实', emoji: '📷' },
];

const ASPECTS: { id: Aspect; label: string; w: number; h: number }[] = [
  { id: '1:1',  label: '1:1',  w: 1,  h: 1  },
  { id: '4:3',  label: '4:3',  w: 4,  h: 3  },
  { id: '16:9', label: '16:9', w: 16, h: 9  },
  { id: '3:4',  label: '3:4',  w: 3,  h: 4  },
  { id: '9:16', label: '9:16', w: 9,  h: 16 },
];

// 画布背景色盘（18种纯色，风格参考关系网络图）
const CANVAS_BG_COLORS: { color: string; name: string }[] = [
  { color: '#F0EDF9', name: '薰衣紫' },
  { color: '#EDF4F9', name: '天空蓝' },
  { color: '#EDF9F1', name: '嫩芽绿' },
  { color: '#FDF5ED', name: '暖杏黄' },
  { color: '#FDF0ED', name: '蜜桃粉' },
  { color: '#F5EDF9', name: '丁香紫' },
  { color: '#EDFAF8', name: '薄荷绿' },
  { color: '#FDFAED', name: '香草米' },
  { color: '#F9EDF4', name: '玫瑰粉' },
  { color: '#EDF0F9', name: '矢车菊' },
  { color: '#E8F5E9', name: '清苔绿' },
  { color: '#FFF3E0', name: '琥珀橙' },
  { color: '#F3E5F5', name: '紫藤花' },
  { color: '#E0F7FA', name: '冰晶蓝' },
  { color: '#FCE4EC', name: '樱花粉' },
  { color: '#F1F8E9', name: '青翠叶' },
  { color: '#F5F5F5', name: '珍珠白' },
  { color: '#ECEFF1', name: '云雾灰' },
];
const NODE_W = 260;
const NODE_H_BASE = 380; // 含图片展示区高度
const NODE_H_EDIT = 160; // 编辑卡固定高度（垂直排列时偏移量）

interface CanvasProject {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface CanvasNodeData {
  id: string;
  project_id: string;
  pos_x: number;
  pos_y: number;
  prompt: string;
  aspect: Aspect;
  scene: WorkMode;
  style: GenStyle;
  gen_model?: GenModel;           // 生图模型（gpt | vidu）
  status: 'idle' | WorkStatus;
  image_url?: string | null;
  image_urls?: string[] | null;  // 多图结果（count>1 时使用）
  error_msg?: string | null;
  work_id?: string | null;
  parent_id?: string | null;
  // 新增字段
  node_type: 'edit' | 'image';  // edit=编辑卡片, image=图片结果卡片
  ref_image_url?: string | null; // 图生图参考图 URL
  count: number;                 // 生成数量
  created_at: string;
}


// ── PaintWork（简易模式历史作品） ────────────────────────────────
interface PaintWork {
  id: string;
  title: string;
  mode: WorkMode;
  style: GenStyle;
  prompt: string;
  image_urls: string[];
  status: WorkStatus;
  error_msg?: string | null;
  created_at: string;
}

// ── 工具函数 ──────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

// ═══════════════════════════════════════════════════════════════════
export default function PaintingHouseScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // ── 顶层模式 ────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('simple');
  // 画布模式内部页面：projects | workspace
  const [canvasView, setCanvasView] = useState<CanvasView>('projects');

  // ── 简易模式状态 ─────────────────────────────────────────────────
  const [selMode, setSelMode]       = useState<WorkMode>('story');
  const [selStyle, setSelStyle]     = useState<GenStyle>('healing');
  const [prompt, setPrompt]         = useState('');
  const [title, setTitle]           = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState('');
  const [genFallback, setGenFallback] = useState(false); // Vidu 降级为 GPT 时显示提示
  const [previewWork, setPreviewWork] = useState<PaintWork | null>(null);
  const [works, setWorks]           = useState<PaintWork[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(true);

  // ── 画布模式状态 ─────────────────────────────────────────────────
  const [projects, setProjects]       = useState<CanvasProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeProject, setActiveProject] = useState<CanvasProject | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [showNewProject, setShowNewProject]   = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [canvasNodes, setCanvasNodes] = useState<CanvasNodeData[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  // 稳定 ref：任何闭包可读最新 canvasNodes，无需 dep 更新
  const canvasNodesRef = useRef<CanvasNodeData[]>([]);
  useEffect(() => { canvasNodesRef.current = canvasNodes; }, [canvasNodes]);

  // 画布背景色（动态切换）
  const [canvasBgColor, setCanvasBgColor] = useState<string>(T.canvasBg);
  const [showBgPicker, setShowBgPicker]   = useState(false);

  // 简易模式绘图比例 & 生图模型
  const [selAspect, setSelAspect]   = useState<Aspect>('1:1');
  const [selModel,  setSelModel]    = useState<GenModel>('gpt'); // 简易模式生图模型

  // ── 画布变换模型（transformOrigin = 屏幕正中心）────────────────
  //
  // RN transform 的锚点默认是元素自身左上角，不是屏幕中心。
  // 直接用 [translateX, translateY, scale] 会从左上角缩放，内容向右下漂移。
  //
  // 正确方案：把缩放原点移到屏幕中心，等价于：
  //   1. translate(cx, cy)           — 把画布原点移到屏幕中心
  //   2. scale(s)                    — 以屏幕中心缩放
  //   3. translate(panX/s, panY/s)   — 应用用户平移（在画布坐标系内）
  //
  // 用 matrix2d(a,b,c,d,tx,ty) 一步表达：
  //   a=s, d=s（等比缩放）
  //   tx = cx + panX - cx*s = cx*(1-s) + panX
  //   ty = cy + panY - cy*s = cy*(1-s) + panY
  //
  // panX/panY：用户平移量（屏幕坐标）；scale：缩放倍率
  // 节点 left/top 是画布坐标，父容器 matrix 变换后节点随之正确缩放平移
  //
  const panX  = useSharedValue(0);   // 用户累积平移 X（屏幕坐标）
  const panY  = useSharedValue(0);   // 用户累积平移 Y（屏幕坐标）
  const scale = useSharedValue(1);   // 缩放倍率

  // 保存手势开始时的快照
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(0);
  const savedScale = useSharedValue(1);

  // 画布区域实际尺寸（header 以下，不含 header 高度）
  // 用 onLayout 动态获取，SharedValue 供 worklet 读取
  const [canvasAreaSize, setCanvasAreaSize] = useState({ w: screenW, h: screenH });
  const canvasAreaW = useSharedValue(screenW);
  const canvasAreaH = useSharedValue(screenH);

  // 屏幕尺寸变化时同步画布区域初始值（onLayout 会覆盖，这里只是初始化用）
  useEffect(() => {
    canvasAreaW.value = screenW;
    canvasAreaH.value = screenH;
  }, [screenW, screenH, canvasAreaW, canvasAreaH]);

  // 缩略图导航：是否展开
  const [minimapVisible, setMinimapVisible] = useState(false);

  // ── Web 端鼠标滚轮缩放（新变换模型：screenX = cx + panX + canvasX * s）
  // 仅在画布模式注册：简易模式不拦截 wheel，保留页面正常滚动
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    if (appMode !== 'canvas') return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.97 : 1.03;
      const oldScale = scale.value;
      const newScale = Math.min(Math.max(oldScale * zoomFactor, 0.1), 5.0);
      const cx = canvasAreaW.value / 2;
      const cy = canvasAreaH.value / 2;
      // 鼠标位置对应的画布坐标：fc = (mouseX - cx - panX) / s
      const focalCanvasX = (e.clientX - cx - panX.value) / oldScale;
      const focalCanvasY = (e.clientY - cy - panY.value) / oldScale;
      // 保持焦点不动：newPanX = mouseX - cx - fc * newScale
      panX.value = e.clientX - cx - focalCanvasX * newScale;
      panY.value = e.clientY - cy - focalCanvasY * newScale;
      scale.value = newScale;
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
      savedScale.value = newScale;
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  // appMode 加入依赖：简易模式切回时移除监听，画布模式重新注册
  }, [scale, panX, panY, savedPanX, savedPanY, savedScale, canvasAreaW, canvasAreaH, appMode]);

  // 新节点输入面板
  const [showNodeInput, setShowNodeInput] = useState(false);
  const [nodePrompt, setNodePrompt]       = useState('');
  const [nodeScene, setNodeScene]         = useState<WorkMode>('story');
  const [nodeStyle, setNodeStyle]         = useState<GenStyle>('healing');
  const [nodeAspect, setNodeAspect]       = useState<Aspect>('1:1');
  const [nodeCount, setNodeCount]         = useState<1|2|4>(1);  // 生成数量
  const [nodeModel, setNodeModel]         = useState<GenModel>('gpt'); // 画布模式生图模型
  const [nodeParentId, setNodeParentId]   = useState<string | null>(null);
  const [addingNode, setAddingNode]       = useState(false);
  const [addNodeError, setAddNodeError]   = useState('');

  // 新节点输入面板 — 参考图上传
  const [nodeRefImageUri, setNodeRefImageUri]   = useState<string | null>(null);  // 本地预览URI
  const [nodeRefImageUrl, setNodeRefImageUrl]   = useState<string | null>(null);  // 上传后公开URL
  const [uploadingRef, setUploadingRef]         = useState(false);
  const [refPermDenied, setRefPermDenied]       = useState(false);

  // 图片全屏预览
  const [previewImg, setPreviewImg]   = useState<string | null>(null);
  const [saveStatus, setSaveStatus]   = useState<'idle'|'saving'|'saved'|'err'>('idle');

  // 局部修改蒙版绘画弹窗
  const [localPaintNode, setLocalPaintNode] = useState<CanvasNodeData | null>(null);

  // 用 Record 代替 Map，规避 DOM lib 的 Map 构造器类型歧义
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 重置节点输入面板
  const resetNodeInput = useCallback(() => {
    setNodePrompt('');
    setNodeRefImageUri(null);
    setNodeRefImageUrl(null);
    setNodeParentId(null);
    setRefPermDenied(false);
    setNodeScene('story');
    setNodeStyle('healing');
    setNodeAspect('1:1');
    setNodeCount(1);
    setAddNodeError('');
  }, []);

  // 上传参考图到 Supabase Storage
  const uploadRefImage = async (uri: string, mimeType?: string, width?: number): Promise<string> => {
    const isPng = mimeType === 'image/png';
    const format = isPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
    const ctx = ImageManipulator.ImageManipulator.manipulate(uri);
    if (width && width > 1080) ctx.resize({ width: 1080 });
    const ref = await ctx.renderAsync();
    const compressed = await ref.saveAsync({ compress: isPng ? 1 : 0.8, format });
    const ext      = isPng ? 'png' : 'jpg';
    const mimeOut  = isPng ? 'image/png' : 'image/jpeg';
    const fileName = `ref-images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const b64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: FileSystem.EncodingType.Base64 });
    const ab  = decode(b64);
    const { error } = await supabase.storage.from('painting-house-images').upload(fileName, ab, { contentType: mimeOut, upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = supabase.storage.from('painting-house-images').getPublicUrl(fileName);
    return pub.publicUrl;
  };

  // 从相册选取参考图
  const pickRefImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setRefPermDenied(true); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setNodeRefImageUri(asset.uri);
    setUploadingRef(true);
    try {
      const url = await uploadRefImage(asset.uri, asset.mimeType ?? undefined, asset.width ?? undefined);
      setNodeRefImageUrl(url);
    } catch { setNodeRefImageUri(null); }
    setUploadingRef(false);
  };

  // ── 简易模式：加载历史 ────────────────────────────────────────────
  // ── 简易模式：加载历史作品，离焦时清理轮询定时器 ─────────────────
  useFocusEffect(useCallback(() => {
    if (!session) return;
    if (appMode !== 'simple') return;
    (async () => {
      setLoadingWorks(true);
      const { data } = await supabase
        .from('painting_house_works')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setWorks((data ?? []) as PaintWork[]);
      setLoadingWorks(false);
    })();
    // cleanup：离开简易模式时清除轮询定时器，防止离屏后仍持续请求
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [session, appMode]));

  // ── 画布模式：加载项目列表 ───────────────────────────────────────
  useFocusEffect(useCallback(() => {
    if (!session) return;
    if (appMode !== 'canvas') return;
    if (canvasView !== 'projects') return;
    (async () => {
      setLoadingProjects(true);
      const { data } = await supabase
        .from('canvas_projects')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });
      setProjects((data ?? []) as CanvasProject[]);
      setLoadingProjects(false);
    })();
  }, [session, appMode, canvasView]));

  // ── 进入项目：加载节点 ────────────────────────────────────────────
  const enterProject = useCallback(async (proj: CanvasProject) => {
    setActiveProject(proj);
    setCanvasView('workspace');
    setLoadingNodes(true);
    // 重置变换：panX/panY=0（屏幕中心），scale=0.85→1.0 入场动画
    panX.value  = 0;
    panY.value  = 0;
    savedPanX.value = 0;
    savedPanY.value = 0;
    savedScale.value = 1;
    scale.value = 0.85;
    scale.value = withTiming(1.0, { duration: 300, easing: Easing.out(Easing.cubic) });

    const { data, error } = await supabase
      .from('canvas_nodes')
      .select('*')
      .eq('project_id', proj.id)
      .order('created_at', { ascending: true });
    // 防御：查询失败时不崩溃，保持空列表
    if (error) { console.error('加载节点失败:', error.message); setLoadingNodes(false); return; }
    const nodes = (data ?? []) as CanvasNodeData[];
    setCanvasNodes(nodes);
    setLoadingNodes(false);
    // 注意：startNodePoll 是 useCallback，通过 startNodePollRef 稳定引用
    nodes
      .filter(n => n.node_type === 'image' && (n.status === 'generating' || n.status === 'pending'))
      .forEach(n => {
        if (n.work_id) {
          const editParent = nodes.find(p => p.id === n.parent_id);
          startNodePollRef.current(n.id, n.work_id, editParent?.id);
        }
      });
  }, [panX, panY, savedPanX, savedPanY, savedScale, scale]);

  // ── 新建项目 ──────────────────────────────────────────────────────
  const createProject = async () => {
    if (!session || !newProjectTitle.trim()) return;
    setCreatingProject(true);
    const { data } = await supabase
      .from('canvas_projects')
      .insert({ user_id: session.user.id, title: newProjectTitle.trim() })
      .select()
      .maybeSingle();
    setCreatingProject(false);
    if (!data) return;
    const proj = data as CanvasProject;
    setProjects(prev => [proj, ...prev]);
    setNewProjectTitle('');
    setShowNewProject(false);
    enterProject(proj);
  };

  // ── 删除项目 ──────────────────────────────────────────────────────
  const deleteProject = async (id: string) => {
    await supabase.from('canvas_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  // ── 双指状态跟踪
  const isPinching = useSharedValue(false);
  // Pinch 开始时焦点（手指中点）对应的画布坐标快照，缩放全程保持此点不动
  const pinchFocalCanvasX = useSharedValue(0);
  const pinchFocalCanvasY = useSharedValue(0);

  // ── 画布 Pan 手势（单指平移）────────────────────────────────────
  // 注意：不再使用 canvasPanRef + blocksExternalGesture 方案（该方案在 Android 上
  //       因 ref 手动赋值无法被 RNGH 内部协调器识别，导致节点拖拽完全失效）。
  // 改为：canvasPanGesture 设 requireExternalGestureToFail(nodeDragRef)，
  //       由节点侧通过共享 SharedValue isDraggingNode 标记来通知画布 Pan 暂停。
  const isDraggingNode = useSharedValue(false); // 有任意节点正在拖拽时为 true
  const panGesture = useMemo(() => {
    const g = Gesture.Pan()
      .minPointers(1)
      .maxPointers(1)
      .averageTouches(true)
      .onStart(() => {
        savedPanX.value = panX.value;
        savedPanY.value = panY.value;
      })
      .onUpdate(e => {
        // 有节点正在被拖拽时，画布 Pan 不执行，避免两者同时移动
        if (isPinching.value || isDraggingNode.value) return;
        panX.value = savedPanX.value + e.translationX;
        panY.value = savedPanY.value + e.translationY;
      })
      .onEnd(() => {
        savedPanX.value = panX.value;
        savedPanY.value = panY.value;
      });
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 画布 Pinch 手势（双指缩放，以手指中点 focalX/Y 为焦点）─────
  // 新变换模型：screenX = cx + panX + canvasX * s
  // 焦点画布坐标：fc = (focalX - cx - panX) / s   （onStart 快照，全程不变）
  // 保持焦点不动：newPanX = focalX - cx - fc * newScale
  // 注意：focalX/Y 是相对 GestureDetector 容器（画布区域 left=0,top=0）的坐标
  //       cx/cy 是画布区域中心（= Animated.View 锚点），两者坐标系一致，无需额外偏移
  const pinchFocalScreenX = useSharedValue(0);
  const pinchFocalScreenY = useSharedValue(0);
  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onStart(e => {
      isPinching.value = true;
      savedScale.value = scale.value;
      savedPanX.value  = panX.value;
      savedPanY.value  = panY.value;
      // 固定焦点屏幕坐标（onUpdate 全程用此值，防止双指移动时中点漂移）
      pinchFocalScreenX.value = e.focalX;
      pinchFocalScreenY.value = e.focalY;
      // 计算焦点对应的画布坐标（缩放全程保持此点在屏幕位置不变）
      const s  = savedScale.value;
      const cx = canvasAreaW.value / 2;
      const cy = canvasAreaH.value / 2;
      pinchFocalCanvasX.value = (e.focalX - cx - savedPanX.value) / s;
      pinchFocalCanvasY.value = (e.focalY - cy - savedPanY.value) / s;
    })
    .onUpdate(e => {
      const newScale = Math.min(Math.max(savedScale.value * e.scale, 0.1), 5.0);
      const cx = canvasAreaW.value / 2;
      const cy = canvasAreaH.value / 2;
      const fx = pinchFocalScreenX.value;
      const fy = pinchFocalScreenY.value;
      // 保持焦点画布坐标映射到同一屏幕位置
      panX.value  = fx - cx - pinchFocalCanvasX.value * newScale;
      panY.value  = fy - cy - pinchFocalCanvasY.value * newScale;
      scale.value = newScale;
    })
    .onEnd(() => {
      isPinching.value = false;
      savedPanX.value  = panX.value;
      savedPanY.value  = panY.value;
      savedScale.value = scale.value;
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Pan + Pinch 同时识别（Simultaneous 保证双指时两者都收到事件）
  const composed = useMemo(() => Gesture.Simultaneous(panGesture, pinchGesture), [panGesture, pinchGesture]);

  // ── 画布矩阵变换 ──────────────────────────────────────────────────
  // Animated.View 本身 left=0, top=0（在 GestureDetector 容器左上角）。
  // 变换公式把视口中心偏移 (cx,cy) 合并进 translate，等效于锚点在中心：
  //   最终屏幕位置: screenX = cx + panX + canvasX * s
  //   translateX = cx + panX   （先平移到中心再加用户 pan）
  //   然后 scale(s) 以当前原点（左上角）放大，等效于以 (cx,cy) 为锚缩放
  // 注意：RN transform 顺序 translateX → translateY → scale
  //   屏幕X = (0 + translateX) * 1 → 再 scale: (canvasX * s)
  //   但 RN transform 是"先 translate 后 scale"，实际效果：
  //     screenX = translateX + canvasX * s = cx + panX + canvasX * s  ✅
  const canvasAnimStyle = useAnimatedStyle(() => {
    const s  = scale.value;
    const cx = canvasAreaW.value / 2;
    const cy = canvasAreaH.value / 2;
    return {
      transform: [
        { translateX: cx + panX.value },
        { translateY: cy + panY.value },
        { scale: s },
      ],
    };
  });

  // ── 添加节点（编辑卡片 → 立即触发生成） ──────────────────────────
  const handleAddNode = async () => {
    if (!session || !activeProject || !nodePrompt.trim()) return;
    setAddingNode(true);

    // 自动布局：画布坐标以 (0,0) 为起点（视口中心），节点向右下排列
    // 初始 panX=0 panY=0 scale=1 时，(0,0) 即屏幕中心，节点可见
    const editNodes = canvasNodes.filter(n => n.node_type === 'edit');
    const maxX = editNodes.reduce((m, n) => Math.max(m, n.pos_x), -100);
    const posX = editNodes.length === 0 ? -NODE_W / 2 : maxX + NODE_W + 40;
    const posY = -60;

    const { data, error: insertErr } = await supabase
      .from('canvas_nodes')
      .insert({
        project_id: activeProject.id,
        user_id: session.user.id,
        pos_x: posX,
        pos_y: posY,
        prompt: nodePrompt.trim(),
        aspect: nodeAspect,
        scene: nodeScene,
        style: nodeStyle,
        gen_model: nodeModel,
        status: 'pending',
        parent_id: nodeParentId,
        node_type: 'edit',
        ref_image_url: nodeRefImageUrl ?? null,
        count: nodeCount,
      })
      .select()
      .maybeSingle();

    setAddingNode(false);
    if (!data) {
      setAddNodeError(insertErr?.message ?? '节点创建失败，请重试');
      return;
    }
    setAddNodeError('');
    const node = data as CanvasNodeData;
    setCanvasNodes(prev => [...prev, node]);
    setShowNodeInput(false);
    resetNodeInput();
    // await 确保 triggerNodeGenerate 完成后才结束 handleAddNode，时序正确
    await triggerNodeGenerate(node);
  };

  // ── 触发节点生成（创建图片子节点，垂直排列：图片卡在编辑卡正下方）──
  // useCallback + session 依赖：session 变化时重建，避免 stale 闭包
  const triggerNodeGenerate = useCallback(async (editNode: CanvasNodeData) => {
    if (!session) return;

    // 校验并扣减每日 AI 积分（每次生成消耗 5 点积分）
    const quota = await checkAndConsumeCredits(5);
    if (!quota.allowed) {
      alert(quota.message || '今日 AI 积分不足（单次生成消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
      return;
    }

    const aspectSizeMap: Record<Aspect, string> = {
      '1:1': '1024x1024', '4:3': '1024x768',
      '16:9': '1024x576', '3:4': '768x1024',
      '9:16': '576x1024',
    };
    const cnt = editNode.count ?? 1;

    // 先建 work 记录
    const { data: row } = await supabase
      .from('painting_house_works')
      .insert({
        user_id: session.user.id,
        title: editNode.prompt.slice(0, 20),
        mode: editNode.scene,
        style: editNode.style,
        prompt: editNode.prompt,
        status: 'pending',
      })
      .select()
      .maybeSingle();
    if (!row) return;

    // 垂直排列：图片节点在编辑卡正下方，X 坐标相同
    const imgPosX = editNode.pos_x;
    const imgPosY = editNode.pos_y + NODE_H_EDIT + 20;
    const { data: imgNodeData } = await supabase
      .from('canvas_nodes')
      .insert({
        project_id: editNode.project_id,
        user_id: session.user.id,
        pos_x: imgPosX,
        pos_y: imgPosY,
        prompt: editNode.prompt,
        aspect: editNode.aspect,
        scene: editNode.scene,
        style: editNode.style,
        status: 'generating',
        parent_id: editNode.id,
        node_type: 'image',
        work_id: row.id,
        ref_image_url: editNode.ref_image_url ?? null,
        count: cnt,
      })
      .select()
      .maybeSingle();

    if (!imgNodeData) return;
    const imgNode = imgNodeData as CanvasNodeData;
    setCanvasNodes(prev => [...prev, imgNode]);

    // 更新编辑节点状态
    await supabase.from('canvas_nodes').update({ work_id: row.id, status: 'generating' }).eq('id', editNode.id);
    setCanvasNodes(prev => prev.map(n => n.id === editNode.id ? { ...n, work_id: row.id, status: 'generating' } : n));

    // 调用 Edge Function（传入 n 生成多张）
    await supabase.functions.invoke('paint-generate', {
      body: {
        work_id: row.id,
        prompt: editNode.prompt,
        style: editNode.style,
        user_id: session.user.id,
        mode: editNode.scene,
        size: aspectSizeMap[editNode.aspect] ?? '1024x1024',
        n: cnt,
        ref_image_url: editNode.ref_image_url ?? undefined,
        gen_model: editNode.gen_model ?? 'gpt',
      },
    });

    // 通过 ref 调用最新版 startNodePoll，避免 useCallback 依赖链问题
    startNodePollRef.current(imgNode.id, row.id, editNode.id);
  }, [session]);

  // ── 轮询图片节点结果（同步更新编辑节点状态）────────────────────────
  const startNodePoll = useCallback((imgNodeId: string, workId: string, editNodeId?: string) => {
    if (pollTimers.current[imgNodeId] !== undefined) clearInterval(pollTimers.current[imgNodeId]);
    const deadline = Date.now() + 4 * 60 * 1000;
    const timer = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(timer);
        delete pollTimers.current[imgNodeId];
        const upd = { status: 'error' as const, error_msg: '生成超时' };
        setCanvasNodes(prev => prev.map(n =>
          (n.id === imgNodeId || n.id === editNodeId) ? { ...n, ...upd } : n
        ));
        await supabase.from('canvas_nodes').update(upd).eq('id', imgNodeId);
        if (editNodeId) await supabase.from('canvas_nodes').update(upd).eq('id', editNodeId);
        return;
      }
      const { data } = await supabase
        .from('painting_house_works').select('*').eq('id', workId).maybeSingle();
      if (!data) return;
      if (data.status === 'done' || data.status === 'error') {
        clearInterval(timer);
        delete pollTimers.current[imgNodeId];
        const urls: string[] = data.image_urls ?? [];
        const imageUrl = urls[0] ?? null;
        // 图片节点写入结果（含多图列表）
        const imgUpd = {
          status: data.status as WorkStatus,
          image_url: imageUrl,
          image_urls: urls.length ? urls : null,
          error_msg: data.error_msg ?? null,
        };
        setCanvasNodes(prev => prev.map(n => n.id === imgNodeId ? { ...n, ...imgUpd } : n));
        await supabase.from('canvas_nodes').update(imgUpd).eq('id', imgNodeId);
        // 编辑节点同步完成状态
        if (editNodeId) {
          const editUpd = { status: data.status as WorkStatus, error_msg: data.error_msg ?? null };
          setCanvasNodes(prev => prev.map(n => n.id === editNodeId ? { ...n, ...editUpd } : n));
          await supabase.from('canvas_nodes').update(editUpd).eq('id', editNodeId);
        }
      }
    }, 3000);
    pollTimers.current[imgNodeId] = timer;
  }, []);

  // startNodePoll 的稳定 ref：enterProject 等在 useCallback 闭包外调用时避免过时引用
  const startNodePollRef = useRef(startNodePoll);
  useEffect(() => { startNodePollRef.current = startNodePoll; }, [startNodePoll]);

  // ── 节点重新生成（仅对 image 节点触发）──────────────────────────────
  const retryNode = useCallback(async (node: CanvasNodeData) => {
    if (!session) return;
    // 用函数式快照拿最新 canvasNodes，避免旧闭包
    const editNode = node.parent_id
      ? canvasNodesRef.current.find(n => n.id === node.parent_id)
      : undefined;
    const sourceNode = editNode ?? node;
    // 先更新本地 state，再异步写库，避免在 state updater 里做异步（反模式）
    setCanvasNodes(prev =>
      prev.map(n =>
        n.id === node.id ? { ...n, status: 'pending' as const, image_url: null, error_msg: null } : n
      )
    );
    await supabase.from('canvas_nodes')
      .update({ status: 'pending', image_url: null, error_msg: null })
      .eq('id', node.id);
    await triggerNodeGenerate({
      ...sourceNode,
      id:        editNode?.id ?? node.id,
      status:    'pending',
      node_type: 'edit',
    });
  }, [session]);

  // ── 继续编辑：从图片节点衍生新编辑节点 ────────────────────────────
  // ── 稳定的拖拽结束回调：useCallback 保证引用不变，DraggableNodeCard 才能 memo ──
  const onDragEndStable = useCallback((id: string, x: number, y: number) => {
    setCanvasNodes(prev => prev.map(n => n.id === id ? { ...n, pos_x: x, pos_y: y } : n));
    supabase.from('canvas_nodes').update({ pos_x: x, pos_y: y }).eq('id', id);
  }, []);

  const handleContinueEdit = useCallback((imgNode: CanvasNodeData) => {
    // 自动填入父图片作为参考图
    setNodeRefImageUri(imgNode.image_url ?? null);
    setNodeRefImageUrl(imgNode.image_url ?? null);
    setNodeParentId(imgNode.id);
    setNodeScene(imgNode.scene);
    setNodeStyle(imgNode.style);
    setNodeAspect(imgNode.aspect);
    setNodePrompt('');
    setShowNodeInput(true);
  }, []);

  // ── 局部修改：打开蒙版绘画弹窗 ──────────────────────────────────
  const handleOpenLocalPaint = useCallback((imgNode: CanvasNodeData) => {
    setLocalPaintNode(imgNode);
  }, []);

  // ── 局部修改确认：mask + prompt → 新节点对 ─────────────────────
  const handleLocalEdit = useCallback(async (
    imgNode: CanvasNodeData,
    maskBase64: string,
    inpaintPrompt: string,
  ) => {
    if (!session || !activeProject) return;

    // 始终使用干净原图作为 inpaint 参考图（不能用含笔迹的合成图，否则 AI 会改变未涂抹区域）
    const srcImageUrl = imgNode.image_url
      ?? imgNode.image_urls?.[0]
      ?? null;
    if (!srcImageUrl) {
      console.warn('handleLocalEdit: 原图 URL 为空，无法执行 inpaint');
      return;
    }
    if (!maskBase64) {
      console.warn('handleLocalEdit: maskBase64 为空，无法执行 inpaint');
      return;
    }

    setLocalPaintNode(null);

    // 自动布局：在父图片节点右侧偏移（用 ref 读最新快照，不依赖闭包 canvasNodes）
    const latestNodes = canvasNodesRef.current;
    const siblingEditNodes = latestNodes.filter(
      n => n.node_type === 'edit' && n.parent_id === imgNode.id,
    );
    const offsetX = (siblingEditNodes.length + 1) * (NODE_W + 40);
    const posX    = imgNode.pos_x + offsetX;
    const posY    = imgNode.pos_y - NODE_H_EDIT - 20;

    // 建编辑节点（ref_image_url 指向原图，供 triggerLocalGenerate 读取）
    const { data: editNodeData } = await supabase
      .from('canvas_nodes')
      .insert({
        project_id:    activeProject.id,
        user_id:       session.user.id,
        pos_x:         posX,
        pos_y:         posY,
        prompt:        inpaintPrompt,
        aspect:        imgNode.aspect,
        scene:         imgNode.scene,
        style:         imgNode.style,
        status:        'pending',
        parent_id:     imgNode.id,
        node_type:     'edit',
        ref_image_url: srcImageUrl,   // ← 确保非空原图 URL
        count:         1,
      })
      .select()
      .maybeSingle();
    if (!editNodeData) return;
    const editNode = editNodeData as CanvasNodeData;
    setCanvasNodes(prev => [...prev, editNode]);

    // 触发局部修改生成（带 mask_base64）
    await triggerLocalGenerate(editNode, maskBase64);
  }, [session, activeProject]);

  // ── 触发局部修改生成（inpaint）──────────────────────────────────
  // useCallback + session 依赖：避免 handleLocalEdit 持有 stale session 引用
  const triggerLocalGenerate = useCallback(async (editNode: CanvasNodeData, maskBase64: string) => {
    if (!session) return;
    // 防御：ref_image_url 必须有值，否则 EF 无法走 inpaint 分支
    if (!editNode.ref_image_url || !maskBase64) {
      console.error('triggerLocalGenerate: ref_image_url 或 maskBase64 缺失，终止 inpaint');
      return;
    }
    const aspectSizeMap: Record<Aspect, string> = {
      '1:1': '1024x1024', '4:3': '1024x768',
      '16:9': '1024x576', '3:4': '768x1024',
      '9:16': '576x1024',
    };

    const { data: row } = await supabase
      .from('painting_house_works')
      .insert({
        user_id: session.user.id,
        title:   editNode.prompt.slice(0, 20),
        mode:    editNode.scene,
        style:   editNode.style,
        prompt:  editNode.prompt,
        status:  'pending',
      })
      .select()
      .maybeSingle();
    if (!row) return;

    const imgPosX = editNode.pos_x;
    const imgPosY = editNode.pos_y + NODE_H_EDIT + 20;
    const { data: imgNodeData } = await supabase
      .from('canvas_nodes')
      .insert({
        project_id:    editNode.project_id,
        user_id:       session.user.id,
        pos_x:         imgPosX,
        pos_y:         imgPosY,
        prompt:        editNode.prompt,
        aspect:        editNode.aspect,
        scene:         editNode.scene,
        style:         editNode.style,
        status:        'generating',
        parent_id:     editNode.id,
        node_type:     'image',
        work_id:       row.id,
        ref_image_url: editNode.ref_image_url,  // 原图 URL（已确保非空）
        count:         1,
      })
      .select()
      .maybeSingle();
    if (!imgNodeData) return;
    const imgNode = imgNodeData as CanvasNodeData;
    setCanvasNodes(prev => [...prev, imgNode]);

    await supabase.from('canvas_nodes')
      .update({ work_id: row.id, status: 'generating' })
      .eq('id', editNode.id);
    setCanvasNodes(prev => prev.map(n =>
      n.id === editNode.id ? { ...n, work_id: row.id, status: 'generating' } : n,
    ));

    // inpaint 模式：携带 mask_base64（PNG base64）与 ref_image_url（原图 URL）
    // EF 分支条件：inpaint=true && refImageUrl && maskBase64 → 走 image-edits inpaint 路径
    await supabase.functions.invoke('paint-generate', {
      body: {
        work_id:       row.id,
        prompt:        editNode.prompt,
        style:         editNode.style,
        user_id:       session.user.id,
        mode:          editNode.scene,
        size:          aspectSizeMap[editNode.aspect] ?? '1024x1024',
        n:             1,
        ref_image_url: editNode.ref_image_url,  // 原图（已确保非空）
        mask_base64:   maskBase64,               // 黑白 PNG base64（白=修改区）
        inpaint:       true,
      },
    });

    startNodePollRef.current(imgNode.id, row.id, editNode.id);
  }, [session]);

  // ── 删除节点（级联删除所有子节点，清理轮询计时器）──────────────────
  const deleteNode = async (nodeId: string) => {
    // 收集要删除的 ID：当前节点 + 所有直接子节点（image 节点）
    const allNodes = canvasNodesRef.current;
    const childIds = allNodes
      .filter(n => n.parent_id === nodeId)
      .map(n => n.id);
    const toDelete = [nodeId, ...childIds];

    // 清理所有相关轮询计时器
    toDelete.forEach(id => {
      if (pollTimers.current[id] !== undefined) {
        clearInterval(pollTimers.current[id]);
        delete pollTimers.current[id];
      }
    });

    // 批量从 DB 删除（逐个删，避免 RLS 限制）
    await Promise.all(
      toDelete.map(id => supabase.from('canvas_nodes').delete().eq('id', id))
    );
    setCanvasNodes(prev => prev.filter(n => !toDelete.includes(n.id)));
  };

  // ── 简易模式轮询 ──────────────────────────────────────────────────
  const pollWork = useCallback(async (workId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    const deadline = Date.now() + 4 * 60 * 1000;
    pollTimerRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(pollTimerRef.current!);
        setGenerating(false);
        setGenError('生成超时，请重试');
        return;
      }
      const { data } = await supabase
        .from('painting_house_works').select('*').eq('id', workId).maybeSingle();
      if (!data) return;
      const w = data as PaintWork;
      if (w.status === 'done') {
        clearInterval(pollTimerRef.current!);
        setGenerating(false);
        setPreviewWork(w);
        setWorks(prev => [w, ...prev.filter(p => p.id !== workId)]);
      } else if (w.status === 'error') {
        clearInterval(pollTimerRef.current!);
        setGenerating(false);
        setGenError(w.error_msg ?? '生成失败，请重试');
        setWorks(prev => [w, ...prev.filter(p => p.id !== workId)]);
      }
    }, 3000);
  }, []);

  // ── 简易模式生成 ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!session || !prompt.trim()) return;
    setGenerating(true);
    setGenError('');
    setGenFallback(false);
    setPreviewWork(null);

    // 校验并扣减每日 AI 积分（每次生图消耗 5 点积分）
    const quota = await checkAndConsumeCredits(5);
    if (!quota.allowed) {
      setGenError(quota.message || '今日 AI 积分不足（单次生成消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
      setGenerating(false);
      return;
    }

    // 将比例转换为像素尺寸字符串（EF 需要 size 参数，不接受 aspect）
    const ASPECT_SIZE_MAP: Record<Aspect, string> = {
      '1:1':  '1024x1024',
      '4:3':  '1024x768',
      '16:9': '1024x576',
      '3:4':  '768x1024',
      '9:16': '576x1024',
    };
    const genSize = ASPECT_SIZE_MAP[selAspect] ?? '1024x1024';
    const { data: row, error: insErr } = await supabase
      .from('painting_house_works')
      .insert({
        user_id: session.user.id,
        title: title.trim() || (MODES.find(m => m.id === selMode)?.label ?? ''),
        mode: selMode, style: selStyle,
        prompt: prompt.trim(), status: 'pending',
      }).select().maybeSingle();
    if (insErr || !row) { setGenerating(false); setGenError('创建作品失败，请重试'); return; }
    const work = row as PaintWork;
    setWorks(prev => [work, ...prev]);
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('paint-generate', {
      body: { work_id: work.id, prompt: prompt.trim(), style: selStyle, user_id: session.user.id, mode: selMode, size: genSize, gen_model: selModel },
    });
    if (fnErr) { setGenerating(false); setGenError(fnErr.message ?? '生成失败，请重试'); return; }
    // Vidu 计费未生效时 EF 自动降级 GPT，给用户提示
    if (fnData?.fallback_to_gpt) setGenFallback(true);
    pollWork(work.id);
  };

  // ── 保存图片 ──────────────────────────────────────────────────────
  const handleSaveImage = async (url: string) => {
    if (!url) return; // 防御：url 为空时不执行，避免 download crash
    setSaveStatus('saving');
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') { setSaveStatus('err'); return; }
    const dest = FileSystem.cacheDirectory + `paint_${Date.now()}.jpg`;
    try {
      await FileSystem.downloadAsync(url, dest);
      await MediaLibrary.createAssetAsync(dest);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch { setSaveStatus('err'); }
  };

  // ── 删除简易模式作品 ──────────────────────────────────────────────
  const handleDelete = async (workId: string) => {
    await supabase.from('painting_house_works').delete().eq('id', workId);
    setWorks(prev => prev.filter(w => w.id !== workId));
  };

  // MODES.find 加兜底，防止 selMode 异常时 undefined 非空断言 crash
  const modeInfo = MODES.find(m => m.id === selMode) ?? MODES[0];
  const imgSize = (screenW - 48) / 2;

  // ── 连线数据计算（编辑卡底部中心 → 图片卡顶部中心，垂直贝塞尔）──
  // connections 只依赖节点的位置和父子关系（id/pos_x/pos_y/parent_id/style/aspect），
  // 用稳定的派生 key 避免 status 轮询变化触发连线层重渲染 + dashOffset 动画重启
  const connectionsDep = useMemo(
    () => canvasNodes
      .map(n => `${n.id}:${n.pos_x}:${n.pos_y}:${n.parent_id ?? ''}:${n.style}:${n.aspect}`)
      .join('|'),
    [canvasNodes],
  );
  const connections = useMemo(() =>
    canvasNodes
      .filter(n => n.parent_id)
      .map(n => {
        const parent = canvasNodes.find(p => p.id === n.parent_id);
        if (!parent) return null;
        // 父节点（编辑卡）底部中心
        const x1 = parent.pos_x + NODE_W / 2;
        // 编辑卡底部中心：pos_y + 编辑卡高度（含内边距 ~160px）
        const y1 = parent.pos_y + NODE_H_EDIT;
        // 子节点（图片卡）顶部中心：pos_y 本身即顶边，+0 即顶部中心
        const x2 = n.pos_x + NODE_W / 2;
        // 修复：图片卡 pos_y 已经是该节点左上角，连线直接指向顶部边缘
        // 之前 y2 = n.pos_y 正确，但箭头 markerEnd 消耗约 8px，
        // 减去箭头高度使箭头尖端恰好落在节点边框上
        const y2 = n.pos_y + 1;
        // 摘要标签：风格 + 比例
        const styleInfo  = STYLES.find(s => s.id === parent.style);
        const aspectInfo = ASPECTS.find(a => a.id === parent.aspect);
        const label = `${styleInfo?.emoji ?? ''}${styleInfo?.label ?? ''} · ${aspectInfo?.label ?? ''}`;
        return { id: `${parent.id}-${n.id}`, x1, y1, x2, y2, label };
      })
      .filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number; label: string }[]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [connectionsDep]);

  // ── 渲染 ─────────────────────────────────────────────────────────
  return (
    // 最外层用 GestureHandlerRootView 且 flex:1，确保整个屏幕都是手势区域
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar style="dark" />
      {/* ── 顶部导航：zIndex:100 始终在画布节点之上 ── */}
      <View style={{
        paddingTop: 52, paddingBottom: 14, paddingHorizontal: 18,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(248,246,255,0.97)',
        borderBottomWidth: 1, borderBottomColor: T.border,
        zIndex: 100,
        // Android 需要 elevation 才能遮住下层 View
        elevation: 10,
      }}>
        <Pressable
          onPress={() => {
            if (appMode === 'canvas' && canvasView === 'workspace') {
              // 离开工作区：清除所有节点轮询定时器，防止离开后仍触发 setCanvasNodes
              Object.values(pollTimers.current).forEach(t => clearInterval(t));
              pollTimers.current = {};
              setCanvasView('projects');
              setActiveProject(null);
              setCanvasNodes([]);
            } else {
              router.back();
            }
          }}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center',
          }}>
          <ArrowLeft size={20} color={T.primary} />
        </Pressable>

        <View style={{ flex: 1 }}>
          {/* 画布工作区只显示项目名，其他情况显示主标题 */}
          {appMode === 'canvas' && canvasView === 'workspace' && activeProject ? (
            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }} numberOfLines={1}>{activeProject.title}</Text>
          ) : (
            <>
              <Text style={{ fontSize: 18, fontWeight: '700', color: T.text }}>🎨 心绘小屋</Text>
              <Text style={{ fontSize: 11, color: T.sub }}>AI可视化教学素材生成</Text>
            </>
          )}
        </View>

        {/* 简易/画布切换：工作区时只显示图标，其余显示文字 */}
        <View style={{ flexDirection: 'row', backgroundColor: T.border, borderRadius: 20, padding: 3 }}>
          {(['simple', 'canvas'] as const).map(id => {
            const isWorkspace = appMode === 'canvas' && canvasView === 'workspace';
            return (
              <Pressable key={id} onPress={() => { setAppMode(id); if (id === 'canvas') setCanvasView('projects'); }}
                style={{
                  paddingHorizontal: isWorkspace ? 8 : 12, paddingVertical: 5, borderRadius: 16,
                  backgroundColor: appMode === id ? T.primary : 'transparent',
                }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: appMode === id ? '#fff' : T.sub }}>
                  {isWorkspace ? (id === 'simple' ? '⚡' : '🖼') : (id === 'simple' ? '⚡ 简易' : '🖼 画布')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 画布模式工作区：换背景 + 添加节点按钮 */}
        {appMode === 'canvas' && canvasView === 'workspace' && (
          <>
            <Pressable
              onPress={() => setShowBgPicker(true)}
              style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: canvasBgColor,
                borderWidth: 2, borderColor: T.primary + '60',
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Palette size={16} color={T.primary} />
            </Pressable>
            <Pressable
              onPress={() => { setShowNodeInput(true); setNodeParentId(null); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: T.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
              }}>
              <Plus size={14} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>新节点</Text>
            </Pressable>
          </>
        )}
      </View>
      {/* ════════════════════ 简易模式 ════════════════════ */}
      {appMode === 'simple' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ padding: 18, gap: 18 }}>

              {/* 模式选择 */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 10 }}>选择创作模式</Text>
                <View style={{ gap: 10 }}>
                  {MODES.map(m => (
                    <Pressable key={m.id} onPress={() => setSelMode(m.id)} style={{
                      backgroundColor: selMode === m.id ? m.color + '18' : T.card,
                      borderRadius: 16, padding: 14,
                      borderWidth: 2, borderColor: selMode === m.id ? m.color : T.border,
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                    } as any}>
                      <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: m.color + '20', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>{m.label}</Text>
                        <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{m.desc}</Text>
                      </View>
                      {selMode === m.id && <CheckCircle2 size={18} color={m.color} />}
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 绘图比例 */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 10 }}>选择绘图比例</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {ASPECTS.map(a => {
                    const isSelected = selAspect === a.id;
                    // 预览小框比例
                    const previewW = 36;
                    const previewH = Math.round(previewW * a.h / a.w);
                    return (
                      <Pressable key={a.id} onPress={() => setSelAspect(a.id)} style={{
                        flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 14,
                        backgroundColor: isSelected ? T.primary + '15' : T.card,
                        borderWidth: 2, borderColor: isSelected ? T.primary : T.border,
                      }}>
                        {/* 比例预览小框 */}
                        <View style={{
                          width: previewW, height: Math.min(previewH, 44),
                          borderRadius: 4,
                          backgroundColor: isSelected ? T.primary + '40' : T.border,
                          borderWidth: 1.5, borderColor: isSelected ? T.primary : T.sub + '60',
                        }} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? T.primary : T.sub }}>{a.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 风格 */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 10 }}>选择画面风格</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {STYLES.map(s => (
                      <Pressable key={s.id} onPress={() => setSelStyle(s.id)} style={{
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                        backgroundColor: selStyle === s.id ? T.primary : T.card,
                        borderWidth: 1.5, borderColor: selStyle === s.id ? T.primary : T.border,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}>
                        <Text style={{ fontSize: 14 }}>{s.emoji}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: selStyle === s.id ? '#fff' : T.sub }}>{s.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* 生图模型 */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 10 }}>生图模型</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([
                      { id: 'gpt'     as GenModel, label: '默认模型',     emoji: '🤖' },
                      { id: 'vidu'    as GenModel, label: 'Vidu-Image-q2', emoji: '🎨' },
                      { id: 'hunyuan' as GenModel, label: '混元 HY-v3',    emoji: '✨' },
                    ]).map(m => (
                      <Pressable key={m.id} onPress={() => setSelModel(m.id)} style={{
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                        backgroundColor: selModel === m.id ? T.primary : T.card,
                        borderWidth: 1.5, borderColor: selModel === m.id ? T.primary : T.border,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}>
                        <Text style={{ fontSize: 14 }}>{m.emoji}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: selModel === m.id ? '#fff' : T.sub }}>{m.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                {selModel === 'vidu' && (
                  <></>
                )}              </View>

              {/* 标题 */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 8 }}>作品标题（可选）</Text>
                <TextInput value={title} onChangeText={setTitle}
                  placeholder="例如：马斯洛需求层次科普图" placeholderTextColor={T.sub}
                  style={{ backgroundColor: T.card, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: T.border, fontSize: 14, color: T.text }}
                  maxLength={30} />
              </View>

              {/* 内容 */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 8 }}>
                  {selMode === 'story' ? '故事内容' : selMode === 'theory' ? '理论描述' : '活动规则'}
                </Text>
                <TextInput value={prompt} onChangeText={setPrompt}
                  placeholder={modeInfo.placeholder} placeholderTextColor={T.sub + 'CC'}
                  multiline style={{
                    backgroundColor: T.card, borderRadius: 14, padding: 14,
                    borderWidth: 1.5, borderColor: prompt ? T.primary : T.border,
                    fontSize: 13, color: T.text, minHeight: 130, maxHeight: 160, textAlignVertical: 'top',
                  }} maxLength={10000} scrollEnabled />
                <Text style={{ fontSize: 11, color: T.sub, textAlign: 'right', marginTop: 4 }}>{prompt.length}/10000</Text>
              </View>

              {genError ? (
                <View style={{ backgroundColor: '#FFF1F2', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} color="#DC2626" />
                  <Text style={{ fontSize: 13, color: '#DC2626', flex: 1 }}>{genError}</Text>
                </View>
              ) : genFallback ? (
                <View style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} color="#D97706" />
                  <Text style={{ fontSize: 13, color: '#92400E', flex: 1 }}>Vidu 暂不可用，已自动切换默认模型生成 ✓</Text>
                </View>
              ) : null}

              <Pressable onPress={handleGenerate} disabled={generating || !prompt.trim()} style={{
                backgroundColor: generating || !prompt.trim() ? '#C8C0E0' : T.primary,
                borderRadius: 20, padding: 16, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 8,
                shadowColor: T.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
              }}>
                {generating ? <ActivityIndicator size="small" color="#fff" /> : <Sparkles size={18} color="#fff" />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{generating ? '正在生成中…' : '✨ 一键生成'}</Text>
              </Pressable>

              {generating && (
                <View style={{ backgroundColor: T.lavender + '30', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: T.primary }}>🎨 AI 正在创作，约需 30 秒~2 分钟，请耐心等待</Text>
                </View>
              )}

              {/* 最新生成结果 */}
              {previewWork?.status === 'done' && previewWork.image_urls.length > 0 && (
                <View style={{ backgroundColor: T.card, borderRadius: 18, padding: 16, gap: 12, borderWidth: 2, borderColor: T.accent }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={18} color={T.accent} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>生成完成！</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {previewWork.image_urls.map((url, i) => (
                      <Pressable key={i} onPress={() => setPreviewImg(url)}>
                        <Image source={{ uri: url }} style={{ width: imgSize, height: imgSize, borderRadius: 12 }} contentFit="cover" />
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={() => previewWork.image_urls[0] && handleSaveImage(previewWork.image_urls[0])}
                    style={{ backgroundColor: T.accent + '18', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: T.accent, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Download size={15} color={T.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: T.accent }}>
                      {saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '✅ 已保存' : '保存到相册'}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* 历史作品 */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 10 }}>🗂 历史作品</Text>
                {loadingWorks
                  ? <ActivityIndicator color={T.primary} />
                  : works.length === 0
                    ? <View style={{ backgroundColor: T.card, borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: T.border }}>
                        <Text style={{ fontSize: 32, marginBottom: 8 }}>🖼️</Text>
                        <Text style={{ fontSize: 13, color: T.sub }}>还没有作品，快来创作第一张吧！</Text>
                      </View>
                    : works.map(w => <WorkCard key={w.id} work={w} onPreview={setPreviewImg} onDelete={handleDelete} onSave={handleSaveImage} imgW={imgSize} />)
                }
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      {/* ════════════════════ 画布模式 ════════════════════ */}
      {appMode === 'canvas' && (
        <>
          {/* ── 项目选择页 ── */}
          {canvasView === 'projects' && (
            <View style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
                {/* 新建项目 Banner */}
                <Pressable
                  onPress={() => setShowNewProject(true)}
                  style={{
                    backgroundColor: T.primary, borderRadius: 20, padding: 20,
                    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24,
                    shadowColor: T.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
                  }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={26} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>新建画布项目</Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>节点式创作，迭代生成，无限延展</Text>
                  </View>
                  <ChevronRight size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>

                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 12 }}>
                  我的项目 ({projects.length})
                </Text>

                {loadingProjects
                  ? <ActivityIndicator color={T.primary} style={{ marginTop: 24 }} />
                  : projects.length === 0
                    ? <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                        <Text style={{ fontSize: 40 }}>🗂️</Text>
                        <Text style={{ fontSize: 14, color: T.sub }}>还没有项目，创建第一个吧</Text>
                      </View>
                    : projects.map(proj => (
                        <Pressable key={proj.id} onPress={() => enterProject(proj)} style={{
                          backgroundColor: T.card, borderRadius: 16, padding: 16,
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          borderWidth: 1.5, borderColor: T.border, marginBottom: 10,
                          shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
                        }}>
                          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                            <FolderOpen size={22} color={T.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }} numberOfLines={1}>{proj.title}</Text>
                            <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>
                              <Clock size={10} color={T.sub} /> {timeAgo(proj.updated_at)}
                            </Text>
                          </View>
                          <Pressable onPress={() => deleteProject(proj.id)} style={{ padding: 6 }}>
                            <Trash2 size={15} color="#FCA5A5" />
                          </Pressable>
                          <ChevronRight size={16} color={T.sub} />
                        </Pressable>
                      ))
                }
              </ScrollView>
            </View>
          )}

          {/* ── 巨型画布工作区 ── */}
          {canvasView === 'workspace' && (
            // 外层容器：flex:1 撑满 header 以下区域，onLayout 获取实际尺寸
            // 画布手势层用容器实际尺寸，不用 screenW/H，避免被 header 遮挡
            (<View
              style={{ flex: 1, backgroundColor: canvasBgColor, zIndex: 0 }}
              onLayout={e => {
                const { width, height } = e.nativeEvent.layout;
                canvasAreaW.value = width;
                canvasAreaH.value = height;
                setCanvasAreaSize({ w: width, h: height });
              }}
            >
              {loadingNodes ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <ActivityIndicator size="large" color={T.primary} />
                  <Text style={{ fontSize: 13, color: T.sub }}>加载节点中…</Text>
                </View>
              ) : (
                <>
                  {/* ══ 网格背景层：固定在视口，随画布平移/缩放同步偏移，不参与手势 ══
                      放在 GestureDetector 之前（z 轴最底层），连线和节点在上方   ══ */}
                  <CanvasGridBackground
                    translateX={panX}
                    translateY={panY}
                    scale={scale}
                    bgColor={canvasBgColor}
                    width={canvasAreaSize.w}
                    height={canvasAreaSize.h}
                  />

                  {/* ══ 画布手势层 ══
                      关键变换模型说明：
                        Animated.View 大小设为 0×0，position 锚定在画布区域中心 (cx, cy)。
                        所有子节点的 left/top 是画布坐标（以原点(0,0)为中心）。
                        变换 translate(panX, panY) + scale(s) 的原点天然就是 (cx, cy)。
                        这样 scale 从中心向外扩展，节点不会漂移/消失。
                  ══ */}
                  <GestureDetector gesture={composed}>
                    <View style={{ position: 'absolute', left: 0, top: 0, width: canvasAreaSize.w, height: canvasAreaSize.h }}>
                      <Animated.View
                        pointerEvents="box-none"
                        style={[
                          {
                            position: 'absolute',
                            // left=0, top=0；中心偏移 (cx,cy) 已合并进 canvasAnimStyle 的 translateX/Y
                            // 实际变换：screenX = cx + panX + canvasX * s
                            width: 0,
                            height: 0,
                            left: 0,
                            top: 0,
                          },
                          canvasAnimStyle,
                        ]}
                      >
                        {/* ① SVG 连线层（在节点之下，不被网格遮挡） */}
                        <AnimatedConnectionLayer connections={connections} />

                        {/* ② 空画布提示：画布坐标 (-120, -60)，初始居中可见 */}
                        {canvasNodes.length === 0 && (
                          <View style={{
                            position: 'absolute',
                            left: -120,
                            top: -60,
                            width: 240,
                            alignItems: 'center', gap: 10,
                          }}>
                            <Text style={{ fontSize: 48 }}>🖼️</Text>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>画布空空如也</Text>
                            <Text style={{ fontSize: 13, color: T.sub, textAlign: 'center', lineHeight: 20 }}>
                              点击右上角「新节点」开始{'\n'}每次生成都会产生一个可迭代的节点卡片
                            </Text>
                          </View>
                        )}

                        {/* ③ 节点卡片层 */}
                        {canvasNodes.map(node => (
                          <DraggableNodeCard
                            key={node.id}
                            node={node}
                            canvasScale={scale}
                            isDraggingNode={isDraggingNode}
                            onDragEnd={onDragEndStable}
                            onPreview={setPreviewImg}
                            onRetry={retryNode}
                            onDelete={deleteNode}
                            onContinueEdit={handleContinueEdit}
                            onLocalEdit={handleOpenLocalPaint}
                            onExport={handleSaveImage}
                          />
                        ))}
                      </Animated.View>
                    </View>
                  </GestureDetector>

                  {/* ══ 缩略图导航（右下角浮动，可收纳）══ */}
                  <CanvasMinimap
                    nodes={canvasNodes}
                    panX={panX}
                    panY={panY}
                    scale={scale}
                    screenW={canvasAreaSize.w}
                    screenH={canvasAreaSize.h}
                    visible={minimapVisible}
                    onToggle={() => setMinimapVisible(v => !v)}
                    onNavigate={(newPanX, newPanY) => {
                      panX.value = withSpring(newPanX, { damping: 20, stiffness: 200 });
                      panY.value = withSpring(newPanY, { damping: 20, stiffness: 200 });
                      savedPanX.value = newPanX;
                      savedPanY.value = newPanY;
                    }}
                    onResetView={() => {
                      // 回到初始中心：panX=0 panY=0 scale=1，节点可见
                      panX.value  = withSpring(0, { damping: 20, stiffness: 180 });
                      panY.value  = withSpring(0, { damping: 20, stiffness: 180 });
                      scale.value = withSpring(1, { damping: 20, stiffness: 180 });
                      savedPanX.value  = 0;
                      savedPanY.value  = 0;
                      savedScale.value = 1;
                    }}
                    onFitAll={() => {
                      // 计算包围全部节点的视口 panX/Y/scale
                      if (canvasNodes.length === 0) return;
                      const xs = canvasNodes.map(n => n.pos_x);
                      const ys = canvasNodes.map(n => n.pos_y);
                      const minX = Math.min(...xs) - 60;
                      const minY = Math.min(...ys) - 60;
                      const maxX = Math.max(...xs) + NODE_W + 60;
                      const maxY = Math.max(...ys) + NODE_H_BASE + 60;
                      const contentW = maxX - minX;
                      const contentH = maxY - minY;
                      const areaW = canvasAreaSize.w || 360;
                      const areaH = canvasAreaSize.h || 600;
                      const fitScale = Math.min(0.95, Math.min(areaW / contentW, areaH / contentH));
                      // 让包围盒中心对准画布区域中心
                      const centerX = (minX + maxX) / 2;
                      const centerY = (minY + maxY) / 2;
                      const newPanX = -centerX * fitScale;
                      const newPanY = -centerY * fitScale;
                      panX.value  = withSpring(newPanX, { damping: 20, stiffness: 180 });
                      panY.value  = withSpring(newPanY, { damping: 20, stiffness: 180 });
                      scale.value = withSpring(fitScale, { damping: 20, stiffness: 180 });
                      savedPanX.value  = newPanX;
                      savedPanY.value  = newPanY;
                      savedScale.value = fitScale;
                    }}
                  />
                </>
              )}
            </View>)
          )}
        </>
      )}
      {/* ════════ 画布背景色盘 Modal ════════ */}
      <Modal visible={showBgPicker} transparent animationType="fade" onRequestClose={() => setShowBgPicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setShowBgPicker(false)}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{
              backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
              padding: 24, paddingBottom: 40, gap: 18,
            }}>
              {/* 标题行 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>🎨 画布背景颜色</Text>
                <Pressable onPress={() => setShowBgPicker(false)}
                  style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} color={T.sub} />
                </Pressable>
              </View>
              {/* 色盘网格 3列 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {CANVAS_BG_COLORS.map(item => {
                  const isSelected = canvasBgColor === item.color;
                  return (
                    <Pressable
                      key={item.color}
                      onPress={() => { setCanvasBgColor(item.color); setShowBgPicker(false); }}
                      style={{
                        width: '30%', aspectRatio: 1.4,
                        borderRadius: 14, backgroundColor: item.color,
                        borderWidth: isSelected ? 2.5 : 1.5,
                        borderColor: isSelected ? T.primary : 'rgba(0,0,0,0.08)',
                        alignItems: 'center', justifyContent: 'flex-end',
                        padding: 6, overflow: 'hidden',
                      }}>
                      {isSelected && (
                        <View style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 18, height: 18, borderRadius: 9,
                          backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
                        }}>
                          <CheckCircle2 size={12} color="#fff" />
                        </View>
                      )}
                      <Text style={{ fontSize: 10, fontWeight: '600', color: T.text + 'BB' }}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* ════════ 新增节点输入面板 Modal ════════ */}
      <Modal visible={showNodeInput} transparent animationType="slide" onRequestClose={() => { setShowNodeInput(false); resetNodeInput(); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => { setShowNodeInput(false); resetNodeInput(); }} />
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{
            backgroundColor: T.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 20, gap: 14,
          } as any}>
            {/* 标题行 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>
                {nodeParentId ? '🔗 继续编辑（衍生节点）' : '✨ 新建节点'}
              </Text>
              <Pressable onPress={() => { setShowNodeInput(false); resetNodeInput(); }}>
                <X size={20} color={T.sub} />
              </Pressable>
            </View>

            {/* 参考图上传区 */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 8 }}>
                参考图（可选，用于图生图迭代）
              </Text>
              <Pressable onPress={pickRefImage} disabled={uploadingRef} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                borderWidth: 1.5, borderColor: nodeRefImageUri ? T.accent : T.border,
                borderStyle: nodeRefImageUri ? 'solid' : 'dashed',
                borderRadius: 14, padding: 10, backgroundColor: T.bg,
              }}>
                {uploadingRef ? (
                  <ActivityIndicator size="small" color={T.primary} />
                ) : nodeRefImageUri ? (
                  <Image source={{ uri: nodeRefImageUri }} style={{ width: 52, height: 52, borderRadius: 10 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: T.lavender + '30', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={22} color={T.sub} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: nodeRefImageUri ? T.accent : T.sub }}>
                    {uploadingRef ? '上传中…' : nodeRefImageUri ? '已选参考图（点击更换）' : '点击选取参考图'}
                  </Text>
                  {!nodeRefImageUri && (
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>上传后 AI 将以此图为基础进行迭代</Text>
                  )}
                </View>
                {nodeRefImageUri && !uploadingRef && (
                  <Pressable onPress={() => { setNodeRefImageUri(null); setNodeRefImageUrl(null); }} style={{ padding: 4 }}>
                    <X size={14} color="#FCA5A5" />
                  </Pressable>
                )}
              </Pressable>
              {refPermDenied && (
                <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>
                  需要相册权限，请在系统设置中开启
                </Text>
              )}
            </View>

            {/* 场景类型 */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 8 }}>场景类型</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {MODES.map(m => (
                  <Pressable key={m.id} onPress={() => setNodeScene(m.id)} style={{
                    flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
                    backgroundColor: nodeScene === m.id ? m.color + '20' : T.bg,
                    borderWidth: 1.5, borderColor: nodeScene === m.id ? m.color : T.border,
                  }}>
                    <Text style={{ fontSize: 18 }}>{m.emoji}</Text>
                    <Text style={{ fontSize: 9, color: nodeScene === m.id ? m.color : T.sub, fontWeight: '700', marginTop: 2 }}>
                      {m.label.slice(0, 4)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 绘图比例 */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 8 }}>绘图比例</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {ASPECTS.map(a => (
                  <Pressable key={a.id} onPress={() => setNodeAspect(a.id)} style={{
                    flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center',
                    backgroundColor: nodeAspect === a.id ? T.primary : T.bg,
                    borderWidth: 1.5, borderColor: nodeAspect === a.id ? T.primary : T.border,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: nodeAspect === a.id ? '#fff' : T.sub }}>
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 图片风格 */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 8 }}>图片风格</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {STYLES.map(s => (
                    <Pressable key={s.id} onPress={() => setNodeStyle(s.id)} style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                      backgroundColor: nodeStyle === s.id ? T.primary : T.bg,
                      borderWidth: 1.5, borderColor: nodeStyle === s.id ? T.primary : T.border,
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                    }}>
                      <Text style={{ fontSize: 13 }}>{s.emoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: nodeStyle === s.id ? '#fff' : T.sub }}>{s.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* 生图模型 */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 8 }}>生图模型</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([
                    { id: 'gpt'     as GenModel, label: '默认模型',     emoji: '🤖' },
                    { id: 'vidu'    as GenModel, label: 'Vidu-Image-q2', emoji: '🎨' },
                    { id: 'hunyuan' as GenModel, label: '混元 HY-v3',    emoji: '✨' },
                  ]).map(m => (
                    <Pressable key={m.id} onPress={() => setNodeModel(m.id)} style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                      backgroundColor: nodeModel === m.id ? T.primary : T.bg,
                      borderWidth: 1.5, borderColor: nodeModel === m.id ? T.primary : T.border,
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                    }}>
                      <Text style={{ fontSize: 13 }}>{m.emoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: nodeModel === m.id ? '#fff' : T.sub }}>{m.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              {nodeModel === 'vidu' && (
                <Text style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>
                  ⚠️ 需在腾讯控制台开启后付费
                </Text>
              )}            </View>

            {/* 提示词输入 */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 8 }}>文本提示词</Text>
              <TextInput
                value={nodePrompt} onChangeText={setNodePrompt}
                placeholder={MODES.find(m => m.id === nodeScene)?.placeholder ?? '描述你想生成的内容…'}
                placeholderTextColor={T.sub + 'AA'}
                multiline
                style={{
                  backgroundColor: T.bg, borderRadius: 14, padding: 14,
                  borderWidth: 1.5, borderColor: nodePrompt ? T.primary : T.border,
                  fontSize: 13, color: T.text,
                  minHeight: 80, maxHeight: 160, textAlignVertical: 'top',
                }}
                scrollEnabled
                maxLength={10000}
              />
              <Text style={{ fontSize: 11, color: T.sub, textAlign: 'right', marginTop: 4 }}>{nodePrompt.length}/10000</Text>
            </View>

            {/* 生成数量 */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 8 }}>生成数量</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([1, 2, 4] as const).map(n => (
                  <Pressable key={n} onPress={() => setNodeCount(n)} style={{
                    flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                    backgroundColor: nodeCount === n ? T.primary : T.bg,
                    borderWidth: 1.5, borderColor: nodeCount === n ? T.primary : T.border,
                  }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: nodeCount === n ? '#fff' : T.text }}>{n}</Text>
                    <Text style={{ fontSize: 9, color: nodeCount === n ? 'rgba(255,255,255,0.8)' : T.sub, marginTop: 1 }}>张</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 错误提示 */}
            {!!addNodeError && (
              <Text style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', marginBottom: 4 }}>
                ⚠️ {addNodeError}
              </Text>
            )}

            {/* 生成按钮 */}
            <Pressable onPress={handleAddNode} disabled={addingNode || !nodePrompt.trim() || uploadingRef} style={{
              backgroundColor: (addingNode || !nodePrompt.trim() || uploadingRef) ? '#C8C0E0' : T.primary,
              borderRadius: 18, padding: 15, alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8,
            }}>
              {addingNode ? <ActivityIndicator size="small" color="#fff" /> : <Wand2 size={18} color="#fff" />}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {addingNode ? '创建中…' : nodeRefImageUrl ? '✨ 图生图生成' : '✨ 生成节点'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      {/* ════════ 新建项目 Modal ════════ */}
      <Modal visible={showNewProject} transparent animationType="slide" onRequestClose={() => setShowNewProject(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowNewProject(false)} />
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
          <View style={{
            backgroundColor: T.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>新建画布项目</Text>
            <TextInput value={newProjectTitle} onChangeText={setNewProjectTitle}
              placeholder="例如：情绪调节课程漫画系列" placeholderTextColor={T.sub}
              style={{ backgroundColor: T.bg, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: newProjectTitle ? T.primary : T.border, fontSize: 14, color: T.text }}
              autoFocus maxLength={30} onSubmitEditing={createProject} />
            <Pressable onPress={createProject} disabled={creatingProject || !newProjectTitle.trim()} style={{
              backgroundColor: creatingProject || !newProjectTitle.trim() ? '#C8C0E0' : T.primary,
              borderRadius: 18, padding: 15, alignItems: 'center',
            }}>
              {creatingProject ? <ActivityIndicator size="small" color="#fff" /> :
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>创建并进入</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ════════ 局部修改蒙版绘画弹窗 ════════ */}
      {localPaintNode && (
        <LocalPaintModal
          node={localPaintNode}
          onClose={() => setLocalPaintNode(null)}
          onConfirm={(maskBase64, inpaintPrompt) =>
            handleLocalEdit(localPaintNode, maskBase64, inpaintPrompt)
          }
        />
      )}
      {/* ════════ 图片全屏预览 ════════ */}
      <Modal visible={!!previewImg} transparent animationType="fade" onRequestClose={() => setPreviewImg(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setPreviewImg(null)}>
          {previewImg && (
            <Image source={{ uri: previewImg }} style={{ width: screenW - 32, height: screenW - 32, borderRadius: 16 }} contentFit="contain" />
          )}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>
            <Pressable onPress={() => setPreviewImg(null)} style={{
              backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
              paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
            }}>
              <X size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>关闭</Text>
            </Pressable>
            {previewImg && (
              <Pressable onPress={() => handleSaveImage(previewImg)} style={{
                backgroundColor: T.primary, borderRadius: 20,
                paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
              }}>
                {saveStatus === 'saving' ? <ActivityIndicator size="small" color="#fff" /> : <Download size={16} color="#fff" />}
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                  {saveStatus === 'saved' ? '✅ 已保存' : '保存相册'}
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── DraggableNodeCard：节点可独立拖动，坐标系与画布解耦 ──────────
// React.memo：只在 node 内容或稳定回调变化时重渲染，阻断轮询 setCanvasNodes 引起的全量刷新
const DraggableNodeCard = React.memo(function DraggableNodeCard({
  node, canvasScale, isDraggingNode,
  onDragEnd, onPreview, onRetry, onDelete, onContinueEdit, onLocalEdit, onExport,
}: {
  node: CanvasNodeData;
  canvasScale: SharedValue<number>;
  // 全局拖拽标志：节点拖拽开始时置 true，结束时置 false，通知画布 Pan 暂停
  isDraggingNode: SharedValue<boolean>;
  onDragEnd: (id: string, x: number, y: number) => void;
  onPreview: (url: string) => void;
  onRetry: (node: CanvasNodeData) => void;
  onDelete: (id: string) => void;
  onContinueEdit: (imgNode: CanvasNodeData) => void;
  onLocalEdit: (imgNode: CanvasNodeData) => void;
  onExport: (url: string) => void;
}) {
  const posX   = useSharedValue(node.pos_x);
  const posY   = useSharedValue(node.pos_y);
  const savedX = useSharedValue(node.pos_x);
  const savedY = useSharedValue(node.pos_y);
  const isDragging = useSharedValue(false);

  // 监听外部 pos 变化（轮询更新 status 时 pos 不变，不触发此处）
  const prevPosRef = useRef({ x: node.pos_x, y: node.pos_y });
  useEffect(() => {
    const prev = prevPosRef.current;
    if (prev.x !== node.pos_x || prev.y !== node.pos_y) {
      prevPosRef.current = { x: node.pos_x, y: node.pos_y };
      if (!isDragging.value) {
        posX.value   = node.pos_x;
        posY.value   = node.pos_y;
        savedX.value = node.pos_x;
        savedY.value = node.pos_y;
      }
    }
  }, [node.pos_x, node.pos_y, posX, posY, savedX, savedY, isDragging]);

  const dragGesture = useMemo(() => Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    // 需要移动 8px 以上才激活拖拽，防止轻触或缩放残留触发误拖
    .minDistance(8)
    .onStart(() => {
      isDragging.value      = true;
      // 通知画布层：有节点正在拖拽，画布 Pan 应暂停
      isDraggingNode.value  = true;
      // 严格快照当前位置，translationX/Y 从 0 开始计算，不受之前手势残留影响
      savedX.value = posX.value;
      savedY.value = posY.value;
    })
    .onUpdate(e => {
      // 画布容器已 scale，屏幕坐标增量 ÷ scale = 画布坐标增量
      const s = canvasScale.value > 0 ? canvasScale.value : 1;
      posX.value = savedX.value + e.translationX / s;
      posY.value = savedY.value + e.translationY / s;
    })
    .onEnd(() => {
      isDragging.value      = false;
      isDraggingNode.value  = false;
      runOnJS(onDragEnd)(node.id, posX.value, posY.value);
    })
    .onFinalize(() => {
      // 手势被系统打断（电话/通知）时也要释放标志，防止画布 Pan 永久冻结
      isDragging.value      = false;
      isDraggingNode.value  = false;
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const animStyle = useAnimatedStyle(() => ({
    left: posX.value,
    top: posY.value,
  }));

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={[
        { position: 'absolute', width: NODE_W },
        animStyle,
      ]}>
        <CanvasNodeCard
          node={node}
          onPreview={onPreview}
          onRetry={onRetry}
          onDelete={onDelete}
          onContinueEdit={onContinueEdit}
          onLocalEdit={onLocalEdit}
          onExport={onExport}
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ── 画布节点卡片（双类型：edit 编辑卡 / image 图片卡）──────────────
// React.memo：node 对象引用不变时跳过渲染（轮询只更新 status，memo 精准命中）
const CanvasNodeCard = React.memo(function CanvasNodeCard({
  node, onPreview, onRetry, onDelete, onContinueEdit, onLocalEdit, onExport,
}: {
  node: CanvasNodeData;
  onPreview: (url: string) => void;
  onRetry: (node: CanvasNodeData) => void;
  onDelete: (id: string) => void;
  onContinueEdit: (imgNode: CanvasNodeData) => void;
  onLocalEdit: (imgNode: CanvasNodeData) => void;
  onExport: (url: string) => void;
}) {
  const modeInfo   = useMemo(() => MODES.find(m => m.id === node.scene),  [node.scene]);
  const styleInfo  = useMemo(() => STYLES.find(s => s.id === node.style), [node.style]);
  const aspectInfo = useMemo(() => ASPECTS.find(a => a.id === node.aspect), [node.aspect]);
  const imgH = useMemo(
    () => aspectInfo ? Math.round(NODE_W * aspectInfo.h / aspectInfo.w) : NODE_W,
    [aspectInfo],
  );
  // 图片 URL 列表：status=done 时才计算，避免每次状态轮询都重建数组
  const imageUrls = useMemo(() => {
    if (node.status !== 'done') return [];
    return node.image_urls?.length ? node.image_urls : (node.image_url ? [node.image_url] : []);
  }, [node.status, node.image_urls, node.image_url]);
  // 多图布局尺寸：只在 aspect 变化时重算
  const multiCell = useMemo(() => {
    const cellW = (NODE_W - 20 - 4) / 2;
    const cellH = aspectInfo ? Math.round(cellW * aspectInfo.h / aspectInfo.w) : cellW;
    return { cellW, cellH };
  }, [aspectInfo]);

  // ── 图片卡片：专注展示生成结果 ─────────────────────────────────
  if (node.node_type === 'image') {
    return (
      <View style={{
        width: NODE_W, backgroundColor: T.card, borderRadius: 20,
        borderWidth: 2,
        borderColor: node.status === 'done' ? T.accent
          : node.status === 'error' ? '#FCA5A5' : T.lavender,
        shadowColor: 'rgba(123,191,181,1)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 9, elevation: 4,
        overflow: 'hidden',
      }}>
        {/* 图片卡顶栏 */}
        <View style={{
          paddingHorizontal: 12, paddingVertical: 8,
          borderBottomWidth: 1, borderBottomColor: T.border,
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: T.accent + '10',
        }}>
          <Text style={{ fontSize: 13 }}>🖼️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: T.accent }}>生成结果</Text>
            <Text style={{ fontSize: 9, color: T.sub }}>{styleInfo?.emoji} {styleInfo?.label} · {aspectInfo?.label}</Text>
          </View>
          <NodeStatusBadge status={node.status} />
          <Pressable onPress={() => onDelete(node.id)} style={{ padding: 4 }}>
            <X size={13} color="#FCA5A5" />
          </Pressable>
        </View>

        {/* 图片展示区：按 count 渲染 1张/2张横排/4张2×2网格 */}
        <View style={{ padding: 10 }}>
          {(node.status === 'generating' || node.status === 'pending') && (
            <View style={{
              height: imgH, borderRadius: 12, backgroundColor: T.lavender + '30',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <ActivityIndicator size="large" color={T.accent} />
              <Text style={{ fontSize: 11, color: T.accent }}>AI 正在绘制…</Text>
            </View>
          )}
          {node.status === 'done' && (() => {
            const urls = imageUrls;
            if (!urls.length) return null;
            if (urls.length === 1) {
              return (
                <Pressable onPress={() => onPreview(urls[0])} style={{ borderRadius: 12, overflow: 'hidden' }}>
                  <Image source={{ uri: urls[0] }} style={{ width: '100%', height: imgH }} contentFit="cover" />
                  <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, padding: 5 }}>
                    <Maximize2 size={12} color="#fff" />
                  </View>
                </Pressable>
              );
            }
            // 2张横排 或 4张2×2
            const { cellW, cellH } = multiCell;
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {urls.map((url, i) => (
                  <Pressable key={i} onPress={() => onPreview(url)}
                    style={{ width: cellW, height: cellH, borderRadius: 8, overflow: 'hidden' }}>
                    <Image source={{ uri: url }} style={{ width: cellW, height: cellH }} contentFit="cover" />
                  </Pressable>
                ))}
              </View>
            );
          })()}
          {node.status === 'error' && (
            <View style={{
              height: 80, borderRadius: 12, backgroundColor: '#FFF1F2',
              alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10,
            }}>
              <AlertCircle size={18} color="#DC2626" />
              <Text style={{ fontSize: 11, color: '#DC2626', textAlign: 'center' }} numberOfLines={2}>
                {node.error_msg ?? '生成失败'}
              </Text>
            </View>
          )}
        </View>

        {/* 操作行：纯图标三按钮（继续编辑 / 局部修改 / 导出），error 时显示重试 */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 12, gap: 6 }}>
          {node.status === 'done' ? (() => {
            const urls = imageUrls;
            const firstUrl = urls[0];
            return firstUrl ? (
              <>
                {/* 继续编辑 */}
                <Pressable onPress={() => onContinueEdit(node)} style={{
                  flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: T.primary + '12', borderWidth: 1.5, borderColor: T.primary + '50',
                }}>
                  <GitBranch size={15} color={T.primary} />
                </Pressable>
                {/* 局部修改 */}
                <Pressable onPress={() => onLocalEdit(node)} style={{
                  flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: T.warm + '20', borderWidth: 1.5, borderColor: T.warm + '80',
                }}>
                  <Scissors size={15} color={T.warm} />
                </Pressable>
                {/* 导出图片 */}
                <Pressable onPress={() => onExport(firstUrl)} style={{
                  flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: T.accent + '15', borderWidth: 1.5, borderColor: T.accent + '60',
                }}>
                  <Download size={15} color={T.accent} />
                </Pressable>
              </>
            ) : null;
          })() : node.status === 'error' ? (
            <Pressable onPress={() => onRetry(node)} style={{
              flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
              backgroundColor: '#FFF1F2', borderWidth: 1.5, borderColor: '#FCA5A5',
              flexDirection: 'row', justifyContent: 'center', gap: 4,
            }}>
              <RefreshCw size={13} color="#DC2626" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>重新生成</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  // ── 编辑卡片：展示提示词参数，显示生成中/完成状态 ───────────────
  return (
    <View style={{
      width: NODE_W, backgroundColor: T.card, borderRadius: 20,
      borderWidth: 1.5,
      borderColor: node.status === 'done' ? T.primary + '80'
        : node.status === 'error' ? '#FCA5A5'
        : node.status === 'generating' ? T.primary
        : T.lavender,
      shadowColor: 'rgba(155,142,196,1)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
      overflow: 'hidden',
    }}>
      {/* 编辑卡顶栏 */}
      <View style={{
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: T.border,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: T.primary + '08',
      }}>
        <Text style={{ fontSize: 15 }}>{modeInfo?.emoji ?? '✏️'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: T.text }} numberOfLines={1}>
            {node.prompt.slice(0, 20)}{node.prompt.length > 20 ? '…' : ''}
          </Text>
          <Text style={{ fontSize: 9, color: T.sub }}>
            {styleInfo?.emoji} {styleInfo?.label} · {aspectInfo?.label}
          </Text>
        </View>
        <NodeStatusBadge status={node.status} />
        <Pressable onPress={() => onDelete(node.id)} style={{ padding: 4 }}>
          <X size={13} color="#FCA5A5" />
        </Pressable>
      </View>

      {/* 提示词 + 参考图缩略（若有）*/}
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 8 }}>
        <Text style={{ fontSize: 12, color: T.text, lineHeight: 18 }} numberOfLines={4}>
          {node.prompt}
        </Text>
        {node.ref_image_url && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Image source={{ uri: node.ref_image_url }} style={{ width: 32, height: 32, borderRadius: 6 }} contentFit="cover" />
            <Text style={{ fontSize: 10, color: T.accent, fontWeight: '600' }}>已含参考图（图生图）</Text>
          </View>
        )}
      </View>

      {/* 生成中状态提示 */}
      {(node.status === 'generating' || node.status === 'pending') && (
        <View style={{
          marginHorizontal: 12, marginBottom: 10, borderRadius: 10,
          backgroundColor: T.lavender + '30', paddingVertical: 8,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <ActivityIndicator size="small" color={T.primary} />
          <Text style={{ fontSize: 11, color: T.primary }}>正在生成图片节点…</Text>
        </View>
      )}

      {/* 完成状态提示 */}
      {node.status === 'done' && (
        <View style={{
          marginHorizontal: 12, marginBottom: 10, borderRadius: 10,
          backgroundColor: T.teal + '20', paddingVertical: 7,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <CheckCircle2 size={13} color={T.teal} />
          <Text style={{ fontSize: 11, color: T.teal, fontWeight: '600' }}>已生成 → 查看下方图片节点</Text>
        </View>
      )}

      {/* 错误操作行 */}
      {node.status === 'error' && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <Text style={{ fontSize: 11, color: '#DC2626', marginBottom: 6 }} numberOfLines={1}>
            {node.error_msg ?? '生成失败'}
          </Text>
          <Pressable onPress={() => onRetry(node)} style={{
            paddingVertical: 7, borderRadius: 10, alignItems: 'center',
            backgroundColor: '#FFF1F2', borderWidth: 1.5, borderColor: '#FCA5A5',
            flexDirection: 'row', justifyContent: 'center', gap: 4,
          }}>
            <RefreshCw size={12} color="#DC2626" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>重新生成</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

// ── 节点状态徽章 ──────────────────────────────────────────────────
function NodeStatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { label: string; bg: string; color: string }> = {
    idle:       { label: '待生成', bg: '#F3F4F6', color: '#9CA3AF' },
    pending:    { label: '排队中', bg: '#F3F4F6', color: '#9CA3AF' },
    generating: { label: '生成中', bg: T.lavender + '30', color: T.primary },
    done:       { label: '已完成', bg: T.teal + '20', color: T.teal },
    error:      { label: '失败', bg: '#FFF1F2', color: '#DC2626' },
  };
  const s = MAP[status] ?? MAP.idle;
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, color: s.color, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
}

// ── 简易模式历史作品卡片 ──────────────────────────────────────────
function WorkCard({ work, onPreview, onDelete, onSave, imgW }: {
  work: PaintWork; onPreview: (url: string) => void;
  onDelete: (id: string) => void;
  onSave: (url: string) => void;
  imgW: number;
}) {
  const modeInfo = MODES.find(m => m.id === work.mode);
  return (
    <View style={{
      backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10,
      borderWidth: 1.5,
      borderColor: work.status === 'done' ? T.border : work.status === 'error' ? '#FCA5A5' : T.lavender,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Text style={{ fontSize: 18 }}>{modeInfo?.emoji ?? '🎨'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }} numberOfLines={1}>
            {work.title || modeInfo?.label}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Clock size={10} color={T.sub} />
            <Text style={{ fontSize: 10, color: T.sub }}>{timeAgo(work.created_at)}</Text>
          </View>
        </View>
        <StatusBadge status={work.status} />
        <Pressable onPress={() => onDelete(work.id)} style={{ padding: 4 }}>
          <Trash2 size={15} color="#FCA5A5" />
        </Pressable>
      </View>

      {work.status === 'done' && (work.image_urls?.length ?? 0) > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(work.image_urls ?? []).map((url, i) => (
            <View key={i} style={{ position: 'relative' }}>
              <Pressable onPress={() => onPreview(url)}>
                <Image source={{ uri: url }} style={{ width: imgW, height: imgW, borderRadius: 10 }} contentFit="cover" />
              </Pressable>
              {/* 下载按钮：悬浮在图片右下角 */}
              <Pressable
                onPress={() => onSave(url)}
                style={{
                  position: 'absolute', bottom: 5, right: 5,
                  backgroundColor: 'rgba(0,0,0,0.52)', borderRadius: 7,
                  padding: 5, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Download size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {work.status === 'generating' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
          <ActivityIndicator size="small" color={T.primary} />
          <Text style={{ fontSize: 12, color: T.primary }}>AI 正在创作中…</Text>
        </View>
      )}
      {work.status === 'error' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
          <AlertCircle size={14} color="#DC2626" />
          <Text style={{ fontSize: 12, color: '#DC2626' }}>{work.error_msg ?? '生成失败'}</Text>
        </View>
      )}
      <Text style={{ fontSize: 11, color: T.sub, marginTop: 8 }} numberOfLines={2}>{work.prompt}</Text>
    </View>
  );
}

// ── 简易模式状态徽章 ──────────────────────────────────────────────
function StatusBadge({ status }: { status: WorkStatus }) {
  const MAP: Record<WorkStatus, { label: string; bg: string; color: string }> = {
    pending:    { label: '等待中', bg: '#F3F4F6', color: '#9CA3AF' },
    generating: { label: '生成中', bg: T.lavender + '30', color: T.primary },
    done:       { label: '已完成', bg: T.teal + '20', color: T.teal },
    error:      { label: '生成失败', bg: '#FFF1F2', color: '#DC2626' },
  };
  const s = MAP[status];
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, color: s.color, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
}


// ══════════════════════════════════════════════════════════════════
// CanvasGridBackground — 无限网格背景（随画布 translate/scale 同步）
// 全程在 Reanimated UI 线程更新，零 React 重渲染，手机不卡顿
// ══════════════════════════════════════════════════════════════════
const BASE_GRID = 60; // 主格间距（逻辑像素）
const SUB_DIV   = 4;  // 每主格细分数
const SUB_SIZE  = BASE_GRID / SUB_DIV;

// 模块级静态路径：细格内 3 条水平 + 3 条垂直虚线
const SUB_PATHS = [
  `M 0 ${SUB_SIZE} H ${BASE_GRID}`,
  `M 0 ${SUB_SIZE * 2} H ${BASE_GRID}`,
  `M 0 ${SUB_SIZE * 3} H ${BASE_GRID}`,
  `M ${SUB_SIZE} 0 V ${BASE_GRID}`,
  `M ${SUB_SIZE * 2} 0 V ${BASE_GRID}`,
  `M ${SUB_SIZE * 3} 0 V ${BASE_GRID}`,
];

function CanvasGridBackground({
  translateX, translateY, scale, bgColor, width, height,
}: {
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  bgColor: string;
  width: number;
  height: number;
}) {
  // useAnimatedProps 直接在 UI 线程驱动 SVG Pattern 的 x/y/width/height
  // 不经过 JS 线程，不触发 React 重渲染，手势期间不卡顿
  // 细格和主格共享同一套偏移计算（两者步长相同），合并为一个 animatedProps
  const patternProps = useAnimatedProps(() => {
    const s = scale.value > 0 ? scale.value : 1;
    const gs = BASE_GRID * s;
    const ox = ((translateX.value % gs) + gs) % gs;
    const oy = ((translateY.value % gs) + gs) % gs;
    return { x: ox, y: oy, width: gs, height: gs };
  });

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, width, height }}
      pointerEvents="none"
    >
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          {/* 细格 pattern — 由 AnimatedSvgPattern 在 UI 线程驱动偏移 */}
          <AnimatedSvgPattern
            id="subgrid"
            patternUnits="userSpaceOnUse"
            animatedProps={patternProps}
          >
            {SUB_PATHS.map((d, i) => (
              <Path key={i} d={d} fill="none" stroke={T.primary + '28'} strokeWidth="0.6" />
            ))}
          </AnimatedSvgPattern>
          {/* 主格 pattern */}
          <AnimatedSvgPattern
            id="maingrid"
            patternUnits="userSpaceOnUse"
            animatedProps={patternProps}
          >
            <Path
              d={`M ${BASE_GRID} 0 L 0 0 0 ${BASE_GRID}`}
              fill="none"
              stroke={T.primary + '55'}
              strokeWidth="1.2"
            />
          </AnimatedSvgPattern>
        </Defs>
        {/* 背景填充色 */}
        <Rect x={0} y={0} width={width} height={height} fill={bgColor} />
        {/* 细格 */}
        <Rect x={0} y={0} width={width} height={height} fill="url(#subgrid)" />
        {/* 主格（叠在细格之上） */}
        <Rect x={0} y={0} width={width} height={height} fill="url(#maingrid)" />
      </Svg>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// CanvasMinimap — 右下角缩略图导航 + 快捷操作按钮
// 视口框用 useAnimatedProps 在 UI 线程直接驱动，零 React 重渲染
// ══════════════════════════════════════════════════════════════════
const MINIMAP_W = 150;
const MINIMAP_H = 106;

function CanvasMinimap({
  nodes, panX, panY, scale,
  screenW, screenH, visible, onToggle, onNavigate,
  onResetView, onFitAll,
}: {
  nodes: CanvasNodeData[];
  panX: SharedValue<number>;
  panY: SharedValue<number>;
  scale: SharedValue<number>;
  screenW: number;
  screenH: number;
  visible: boolean;
  onToggle: () => void;
  onNavigate: (newPanX: number, newPanY: number) => void;
  onResetView: () => void;
  onFitAll: () => void;
}) {
  // bounding box（画布坐标系）—— 静态，仅随 nodes 列表变化
  const bbox = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: -300, minY: -200, maxX: 1200, maxY: 900 };
    }
    const xs = nodes.map(n => n.pos_x);
    const ys = nodes.map(n => n.pos_y);
    return {
      minX: Math.min(...xs) - 100,
      minY: Math.min(...ys) - 100,
      maxX: Math.max(...xs) + NODE_W + 100,
      maxY: Math.max(...ys) + NODE_H_BASE + 100,
    };
  }, [nodes]);

  const bboxW = Math.max(1, bbox.maxX - bbox.minX);
  const bboxH = Math.max(1, bbox.maxY - bbox.minY);

  // 视口框：useAnimatedProps 全程在 UI 线程运算，不触发 React 重渲染
  const vpRectProps = useAnimatedProps(() => {
    const s  = scale.value > 0 ? scale.value : 1;
    const cx = screenW / 2;
    const cy = screenH / 2;
    const vpX = -(cx + panX.value) / s;
    const vpY = -(cy + panY.value) / s;
    const vpW = screenW / s;
    const vpH = screenH / s;
    const mx = Math.max(0, Math.min(MINIMAP_W - 4, ((vpX - bbox.minX) / bboxW) * MINIMAP_W));
    const my = Math.max(0, Math.min(MINIMAP_H - 4, ((vpY - bbox.minY) / bboxH) * MINIMAP_H));
    const mw = Math.max(10, Math.min(MINIMAP_W - mx, (vpW / bboxW) * MINIMAP_W));
    const mh = Math.max(8,  Math.min(MINIMAP_H - my, (vpH / bboxH) * MINIMAP_H));
    return { x: mx, y: my, width: mw, height: mh };
  });

  // 缩放百分比：只需低频更新（手势结束时），用轻量 state 即可
  const [scaleLabel, setScaleLabel] = useState('100%');
  useAnimatedReaction(
    () => Math.round(scale.value * 100),
    (cur, prev) => { if (cur !== prev) runOnJS(setScaleLabel)(`${cur}%`); },
  );

  // 点击 minimap 跳转：读取当前 bbox 快照计算目标坐标
  const bboxRef = useRef(bbox);
  useEffect(() => { bboxRef.current = bbox; }, [bbox]);

  return (
    <View
      style={{ position: 'absolute', right: 12, bottom: 20, alignItems: 'flex-end', gap: 6, zIndex: 50 }}
      pointerEvents="box-none"
    >
      {/* 缩略图面板 */}
      {visible && (
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          {/* 提示文字 */}
          <Text style={{ fontSize: 10, color: T.sub, backgroundColor: 'rgba(255,255,255,0.7)',
            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
            点击导航 · 拖拽到此处
          </Text>

          {/* minimap 主体 */}
          <Pressable
            onPress={(e) => {
              const tapX = e.nativeEvent.locationX;
              const tapY = e.nativeEvent.locationY;
              const b = bboxRef.current;
              const bw = Math.max(1, b.maxX - b.minX);
              const bh = Math.max(1, b.maxY - b.minY);
              const contentX = (tapX / MINIMAP_W) * bw + b.minX;
              const contentY = (tapY / MINIMAP_H) * bh + b.minY;
              // 让点击位置移到视口中心（用当前 scale SharedValue，不触发重渲染）
              onNavigate(-contentX * scale.value, -contentY * scale.value);
            }}
            style={{
              width: MINIMAP_W,
              height: MINIMAP_H,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: T.primary + '50',
              overflow: 'hidden',
              shadowColor: 'rgba(155,142,196,1)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
            }}
          >
            <Svg width={MINIMAP_W} height={MINIMAP_H} style={{ overflow: 'hidden' }}>
              {/* 背景 */}
              <Rect x={0} y={0} width={MINIMAP_W} height={MINIMAP_H} fill={T.canvasBg + 'EE'} />
              <Defs>
                <ClipPath id="minimapClip">
                  <Rect x={0} y={0} width={MINIMAP_W} height={MINIMAP_H} />
                </ClipPath>
              </Defs>
              <G clipPath="url(#minimapClip)">
                {/* 节点色块（静态，随 nodes 列表变化才重绘） */}
                {nodes.map(n => (
                  <Rect
                    key={n.id}
                    x={((n.pos_x - bbox.minX) / bboxW) * MINIMAP_W}
                    y={((n.pos_y - bbox.minY) / bboxH) * MINIMAP_H}
                    width={Math.max(5, (NODE_W / bboxW) * MINIMAP_W)}
                    height={Math.max(4, (NODE_H_EDIT / bboxH) * MINIMAP_H)}
                    rx={2}
                    fill={n.node_type === 'image' ? T.accent + 'DD' : T.primary + 'DD'}
                  />
                ))}
                {/* 视口框：AnimatedRect 在 UI 线程直接更新，不触发 React 重渲染 */}
                <AnimatedRect
                  rx={3}
                  fill="rgba(155,142,196,0.18)"
                  stroke={T.primary}
                  strokeWidth="2"
                  animatedProps={vpRectProps}
                />
              </G>
            </Svg>

            {/* 缩放比例标签（右下角）— 低频更新，用 state 即可 */}
            <View style={{
              position: 'absolute', right: 4, bottom: 4,
              backgroundColor: T.primary + 'CC', borderRadius: 5,
              paddingHorizontal: 5, paddingVertical: 1,
            }}>
              <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>{scaleLabel}</Text>
            </View>
          </Pressable>

          {/* 快捷操作行：回中心 + 适应全部 */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable
              onPress={onResetView}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: 'rgba(255,255,255,0.88)',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
                borderWidth: 1, borderColor: T.primary + '40',
                shadowColor: 'rgba(155,142,196,1)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2,
              }}
            >
              <Crosshair size={12} color={T.primary} />
              <Text style={{ fontSize: 11, color: T.primary, fontWeight: '600' }}>回中心</Text>
            </Pressable>
            <Pressable
              onPress={onFitAll}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: 'rgba(255,255,255,0.88)',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
                borderWidth: 1, borderColor: T.accent + '60',
                shadowColor: 'rgba(155,142,196,1)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2,
              }}
            >
              <Maximize2 size={12} color={T.accent} />
              <Text style={{ fontSize: 11, color: T.accent, fontWeight: '600' }}>全览</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 收纳/展开按钮 */}
      <Pressable
        onPress={onToggle}
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: visible ? T.primary : 'rgba(255,255,255,0.88)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: visible ? T.primary : T.primary + '50',
          shadowColor: 'rgba(155,142,196,1)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 4,
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Map size={16} color={visible ? '#fff' : T.primary} />
      </Pressable>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// AnimatedConnectionLayer — 节点间流光连线动画
// 用 Reanimated 驱动 strokeDashoffset 循环，SVG 虚线产生"光流"效果
// ══════════════════════════════════════════════════════════════════
type ConnectionData = {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  label: string;
};

// Animated SVG 组件必须在模块级别创建（不能在组件函数内部）
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect  = Animated.createAnimatedComponent(Rect);
const AnimatedSvgPattern = Animated.createAnimatedComponent(Pattern);

// 单条连线：节点坐标直接用 pos_x/pos_y（画布坐标系，无偏移）
function AnimatedConnection({ c, dashOffset }: { c: ConnectionData; dashOffset: SharedValue<number> }) {
  const x1 = c.x1, y1 = c.y1;
  const x2 = c.x2, y2 = c.y2;
  const cp1y = y1 + 80;
  const cp2y = y2 - 80;
  const d = `M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`;
  const mx = (x1 + x2) / 2;
  const my = (y1 + cp1y + y2 + cp2y) / 4;
  const labelW = Math.min(c.label.length * 8 + 16, 160);

  // 用 useAnimatedProps 将 dashOffset 传给 SVG Path（useAnimatedStyle 只适用于 View）
  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  return (
    <G key={c.id}>
      {/* 底层轨道线：静态浅色虚线 */}
      <Path
        d={d}
        stroke={T.primary + '28'}
        strokeWidth="2.5"
        strokeDasharray="8 6"
        fill="none"
      />
      {/* 流光线：动画 dashOffset 产生流动效果 */}
      <AnimatedPath
        d={d}
        stroke={T.primary + 'B0'}
        strokeWidth="2.5"
        strokeDasharray="16 40"
        fill="none"
        markerEnd="url(#arrow-flow)"
        animatedProps={animProps}
      />
      {/* 标签背景 */}
      <Rect
        x={mx - labelW / 2} y={my - 10}
        width={labelW} height={20}
        rx={10} ry={10}
        fill={T.card}
        stroke={T.primary + '50'}
        strokeWidth="1"
      />
      <SvgText
        x={mx} y={my + 4}
        textAnchor="middle"
        fontSize="9"
        fill={T.primary}
        fontWeight="600"
      >
        {c.label}
      </SvgText>
    </G>
  );
}

function AnimatedConnectionLayer({ connections }: { connections: ConnectionData[] }) {
  const dashOffset = useSharedValue(0);
  const hasConns = connections.length > 0;

  // 无连线时不跑动画，有连线才启动（避免空跑无限循环）
  useEffect(() => {
    if (!hasConns) {
      dashOffset.value = 0;
      return;
    }
    dashOffset.value = withRepeat(
      withTiming(-56, { duration: 1800, easing: Easing.linear }),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasConns]);

  if (!hasConns) return null;

  // SVG 覆盖负坐标区域（节点初始布局时 pos_x 可能为负值如 -110）
  // 节点坐标范围通常在 ±1500 以内，2000×2000（±1000）已足够，显著减少内存占用
  const SVG_OFFSET = 1000;
  const SVG_SIZE   = 2000;

  return (
    <View
      style={{ position: 'absolute', top: -SVG_OFFSET, left: -SVG_OFFSET, width: SVG_SIZE, height: SVG_SIZE }}
      pointerEvents="none"
    >
      <Svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`${-SVG_OFFSET} ${-SVG_OFFSET} ${SVG_SIZE} ${SVG_SIZE}`}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Defs>
          <Marker id="arrow-flow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <Path d="M0,0 L8,4 L0,8 Z" fill={T.primary + 'B0'} />
          </Marker>
        </Defs>
        {connections.map(c => (
          <AnimatedConnection key={c.id} c={c} dashOffset={dashOffset} />
        ))}
      </Svg>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// ── BrushSlider：可拖动宽滑条，替代原加减按钮 ───────────────────
// 纯 PanResponder 实现，无第三方 Slider 依赖
// min=8 max=60  轨道高 36px，拇指圆点直径 28px，触控舒适
function BrushSlider({
  value,
  onChange,
  onSlidingStart,
  onSlidingEnd,
}: {
  value: number;
  onChange: (v: number) => void;
  onSlidingStart?: () => void;
  onSlidingEnd?:   () => void;
}) {
  const MIN = 8, MAX = 60;
  const trackW = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      // 阻止事件冒泡到画布 Responder，防止误触绘画
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture:  () => true,
      onPanResponderGrant: (e) => {
        onSlidingStart?.();           // 通知父组件：滑条拖动开始，暂停绘画
        if (trackW.current <= 0) return;
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / trackW.current));
        onChange(Math.round(MIN + ratio * (MAX - MIN)));
      },
      onPanResponderMove: (e) => {
        if (trackW.current <= 0) return;
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / trackW.current));
        onChange(Math.round(MIN + ratio * (MAX - MIN)));
      },
      onPanResponderRelease: () => {
        onSlidingEnd?.();             // 通知父组件：滑条拖动结束，恢复绘画
      },
      onPanResponderTerminate: () => {
        onSlidingEnd?.();             // 手势被系统打断时同样恢复
      },
    })
  ).current;

  const fillPct = ((value - MIN) / (MAX - MIN)) * 100;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 6 }}>
      {/* 标签 + 预览圆点 */}
      <View style={{ alignItems: 'center', gap: 2, width: 42 }}>
        <View style={{
          width: Math.max(6, Math.min(28, value * 0.55)),
          height: Math.max(6, Math.min(28, value * 0.55)),
          borderRadius: 30, backgroundColor: T.primary,
        }} />
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{value}</Text>
      </View>

      {/* 可拖动轨道 */}
      <View
        style={{ flex: 1, height: 36, justifyContent: 'center' }}
        onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        {/* 轨道背景 */}
        <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3 }}>
          {/* 填充段 */}
          <View style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${fillPct}%`, backgroundColor: T.primary, borderRadius: 3,
          }} />
        </View>
        {/* 拇指圆点 */}
        <View style={{
          position: 'absolute',
          left: `${fillPct}%` as `${number}%`,
          top: '50%' as `${number}%`,
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: '#fff',
          marginLeft: -11, marginTop: -11,
          borderWidth: 2.5, borderColor: T.primary,
          // 浮起感阴影
          shadowColor: T.primary, shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.45, shadowRadius: 4, elevation: 4,
        }} />
      </View>

      {/* 笔触 label */}
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 28 }}>笔触</Text>
    </View>
  );
}

// ── LocalPaintModal — 局部修改蒙版绘画弹窗 ────────────────────────
// 性能优化：
//   笔触点用 pendingPoints Ref 缓冲，RAF 节流合并后再 flush 到 SVG state
//   每帧最多调用一次 setPaths，彻底解决手机高频 touch 卡顿
// 坐标正确性：
//   笔触始终记录在「图片像素坐标系」（逆变换去掉缩放/平移）
//   buildMaskBase64 直接在图片尺寸画布上绘制，mask 与原图像素 1:1 对齐
// 黑色=保留区域  白色/涂抹区域=要修改的区域
// ════════════════════════════════════════════════════════════════
function LocalPaintModal({
  node,
  onClose,
  onConfirm,
}: {
  node: CanvasNodeData;
  onClose: () => void;
  onConfirm: (maskBase64: string, prompt: string) => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [inpaintPrompt, setInpaintPrompt] = useState('');

  // 图片原生生成尺寸（与 EF size 参数对齐，mask 需与其像素一致才能正确 inpaint）
  const NATIVE_SZ: Record<string, { w: number; h: number }> = {
    '1:1':  { w: 1024, h: 1024 }, '4:3':  { w: 1024, h: 768  },
    '16:9': { w: 1024, h: 576  }, '3:4':  { w: 768,  h: 1024 },
    '9:16': { w: 576,  h: 1024 },
  };
  const nativeSz     = NATIVE_SZ[node.aspect] ?? { w: 1024, h: 1024 };
  const imageNativeW = nativeSz.w;
  const imageNativeH = nativeSz.h;

  // isBuilding：mask 构建期间禁止重复提交；maskError：验证/构建失败的提示
  const [isBuilding, setIsBuilding] = useState(false);
  const [maskError, setMaskError]   = useState('');

  // ── 路径状态 ──────────────────────────────────────────────────
  // paths：已提交的完整路径（每次笔画结束才 flush）
  // livePathRef：当前正在绘制的路径点缓冲（不 setState，直接操作 ref）
  // svgTickRef：RAF 节流标记，同一帧内只 flush 一次
  const [paths, setPaths] = useState<Array<{ d: string; color: string }>>([]);
  // 当前笔画中间状态（已 flush 过的 d 字符串，用于实时预览）
  const [livePath, setLivePath] = useState<{ d: string; color: string } | null>(null);
  const livePointsRef = useRef<string>('');   // 当前笔画累积的 SVG path d 字符串
  const isDrawing     = useRef(false);
  const svgTickRef    = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  // 笔刷模式：pen=涂抹  eraser=擦除  null=未选中（纯查看/缩放，不能画）
  const [brushMode, setBrushMode] = useState<'pen' | 'eraser' | null>(null);
  const brushModeRef = useRef<'pen' | 'eraser' | null>(null);
  useEffect(() => { brushModeRef.current = brushMode; }, [brushMode]);
  const [brushSize, setBrushSize] = useState(28);
  const brushSizeRef = useRef(28);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  // 滑条拖动期间不允许画布接管手势
  const isSliding = useRef(false);

  // 是否处于绘画模式（选中笔刷或橡皮时才可画）
  const drawingEnabled = brushMode !== null;

  // 图片变换 SharedValue（UI 线程直驱）
  const imgScale  = useSharedValue(1);
  const imgOffX   = useSharedValue(0);
  const imgOffY   = useSharedValue(0);
  const baseScale = useSharedValue(1);
  const baseOffX  = useSharedValue(0);
  const baseOffY  = useSharedValue(0);
  const baseFocX  = useSharedValue(0);
  const baseFocY  = useSharedValue(0);


  // 画布尺寸：宽=全屏，高用 flex:1 自适应
  // canvasHRef 供 worklet 闭包读取（useMemo 无法响应 state 变化）
  const canvasW = screenW;
  const canvasHRef = useRef(screenH * 0.5);
  const [canvasH, setCanvasHState] = useState(screenH * 0.5);
  // SharedValue 版本，供 worklet 中使用（pinchGst 在 UI 线程运行，不能读 JS ref）
  const canvasHSV = useSharedValue(screenH * 0.5);

  // ── 双指 Pinch 缩放（始终可用）──────────────────────────────
  const pinchGst = useMemo(() => Gesture.Pinch()
    .onStart(e => {
      baseScale.value = imgScale.value;
      baseOffX.value  = imgOffX.value;
      baseOffY.value  = imgOffY.value;
      baseFocX.value  = e.focalX;
      baseFocY.value  = e.focalY;
    })
    .onUpdate(e => {
      'worklet';
      const ns  = Math.max(1, Math.min(6, baseScale.value * e.scale));
      const fx  = baseFocX.value;
      const fy  = baseFocY.value;
      const fcx = (fx - baseOffX.value - canvasW / 2) / baseScale.value;
      const fcy = (fy - baseOffY.value - canvasHSV.value / 2) / baseScale.value;
      imgScale.value = ns;
      imgOffX.value  = ns <= 1.01 ? 0 : fx - canvasW / 2 - fcx * ns;
      imgOffY.value  = ns <= 1.01 ? 0 : fy - canvasHSV.value / 2 - fcy * ns;
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // ── 单指 Pan 平移（仅未选画笔时激活）────────────────────────
  const panGst = useMemo(() => Gesture.Pan()
    .minPointers(1).maxPointers(1)
    .onStart(() => {
      'worklet';
      baseOffX.value = imgOffX.value;
      baseOffY.value = imgOffY.value;
    })
    .onUpdate(e => {
      'worklet';
      imgOffX.value = baseOffX.value + e.translationX;
      imgOffY.value = baseOffY.value + e.translationY;
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);



  const imgAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: imgOffX.value },
      { translateY: imgOffY.value },
      { scale:      imgScale.value },
    ],
  }));

  const imageUrl = node.image_url ?? (node.image_urls?.[0] ?? null);



  // ── RAF 节流 flush：将 livePointsRef 当前 d 刷新到 livePath state ──
  // 笔画移动时只更新 ref，RAF 限速后才 setState，避免每帧重渲染
  const flushLive = useCallback(() => {
    if (svgTickRef.current !== null) return; // 本帧已调度，跳过
    svgTickRef.current = requestAnimationFrame(() => {
      svgTickRef.current = null;
      const d     = livePointsRef.current;
      const color = 'rgba(248,152,100,0.85)';
      if (d) setLivePath({ d, color });
    });
  }, []);

  // ── hitTestPath：橡皮擦点击路径碰撞检测 ─────────────────────
  const hitTestPath = useCallback((d: string, px: number, py: number, radius: number): boolean => {
    if (!d || !isFinite(px) || !isFinite(py)) return false;
    const cmds = d.trim().split(/(?=[MLml])/);
    let lx = 0, ly = 0;
    for (const cmd of cmds) {
      const type  = cmd[0];
      const parts = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      // 跳过包含 NaN 的指令，避免 SVG 崩溃
      if (parts.some(v => !isFinite(v))) continue;
      if (type === 'M') { lx = parts[0]; ly = parts[1]; }
      else if (type === 'L') {
        const nx = parts[0], ny = parts[1];
        const dx = nx - lx, dy = ny - ly;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((px - lx) * dx + (py - ly) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = lx + t * dx - px, ey = ly + t * dy - py;
        if (ex * ex + ey * ey <= radius * radius) return true;
        lx = nx; ly = ny;
      }
    }
    return false;
  }, []);

  // ── 笔画 commit 辅助（drawGst onEnd/onFinalize 共用）───────────
  const commitStroke = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (svgTickRef.current !== null) {
      cancelAnimationFrame(svgTickRef.current);
      svgTickRef.current = null;
    }
    const d = livePointsRef.current;
    // 过滤 NaN 点，防止 SVG 崩溃；路径至少要有 M + 一个 L 才有意义
    if (d && brushModeRef.current === 'pen' && d.includes('L')) {
      const safeD = d.split(/(?=[MLml])/)
        .filter(seg => !seg.slice(1).split(/[\s,]+/).some(v => !isFinite(Number(v))))
        .join('');
      if (safeD.includes('L')) {
        setPaths(prev => [...prev, { d: safeD, color: 'rgba(248,152,100,0.85)' }]);
      }
    }
    livePointsRef.current = '';
    setLivePath(null);
  }, []);


  // ── RNGH 绘画 Gesture（替代 Responder）───────────────────────
  // 在 UI 线程完成坐标换算（直接读 SharedValue），再 runOnJS 传 JS 回调。
  // handleDrawStartXY / handleDrawMoveXY：stable useCallback，仅依赖 stable refs。
  const handleDrawStartXY = useCallback((rx: number, ry: number) => {
    if (!brushModeRef.current) return;
    if (isSliding.current) return; // 滑条拖动期间不画
    if (brushModeRef.current === 'pen') {
      isDrawing.current     = true;
      livePointsRef.current = `M${rx.toFixed(1)},${ry.toFixed(1)}`;
      setLivePath({ d: livePointsRef.current, color: 'rgba(248,152,100,0.85)' });
    } else {
      isDrawing.current = true;
      const r = brushSizeRef.current / 2;
      setPaths(prev => prev.filter(p => !hitTestPath(p.d, rx, ry, r)));
    }
  }, [hitTestPath]);

  const handleDrawMoveXY = useCallback((rx: number, ry: number) => {
    if (!isDrawing.current || !brushModeRef.current) return;
    if (brushModeRef.current === 'pen') {
      livePointsRef.current += ` L${rx.toFixed(1)},${ry.toFixed(1)}`;
      flushLive();
    } else {
      if (svgTickRef.current !== null) return;
      svgTickRef.current = requestAnimationFrame(() => {
        svgTickRef.current = null;
        const r = brushSizeRef.current / 2;
        setPaths(prev => prev.filter(p => !hitTestPath(p.d, rx, ry, r)));
      });
    }
  }, [flushLive, hitTestPath]);

  // drawGst：Gesture.Pan（单指），始终加入 Simultaneous 组，按 brushMode 动态 enable
  const drawGst = useMemo(() => Gesture.Pan()
    .minPointers(1).maxPointers(1)
    .enabled(false) // 由下方 useEffect 按 drawingEnabled 切换
    .onStart(e => {
      'worklet';
      const cx = canvasW / 2;
      const cy = canvasHSV.value / 2;
      const s  = imgScale.value > 0 ? imgScale.value : 1;
      const rx = (e.x - cx - imgOffX.value) / s + cx;
      const ry = (e.y - cy - imgOffY.value) / s + cy;
      runOnJS(handleDrawStartXY)(rx, ry);
    })
    .onUpdate(e => {
      'worklet';
      const cx = canvasW / 2;
      const cy = canvasHSV.value / 2;
      const s  = imgScale.value > 0 ? imgScale.value : 1;
      const rx = (e.x - cx - imgOffX.value) / s + cx;
      const ry = (e.y - cy - imgOffY.value) / s + cy;
      runOnJS(handleDrawMoveXY)(rx, ry);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(commitStroke)();
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(commitStroke)();
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [canvasW, handleDrawStartXY, handleDrawMoveXY, commitStroke]);

  // 统一切换 pan / draw 手势的 enabled 状态（互斥）
  useEffect(() => {
    panGst.enabled(!drawingEnabled);
    drawGst.enabled(drawingEnabled);
  }, [drawingEnabled, panGst, drawGst]);

  const viewGesture = useMemo(
    () => Gesture.Simultaneous(pinchGst, panGst, drawGst),
    [pinchGst, panGst, drawGst],
  );

  // ── Mask PNG 生成 ─────────────────────────────────────────────
  // 关键修正：mask 坐标系 = 图片像素坐标系（与 paths 一致）
  // 需要先通过 contain 缩放算出图片在 canvasW×canvasH 内的实际渲染矩形，
  // 再在 mask canvas 上按相同比例绘制，保证 mask 与原图 1:1 对齐。
  const maskViewShotRef = useRef<any>(null);

  const buildMaskBase64 = useCallback(async (): Promise<string> => {
    const allPaths = paths; // 已 commit 的路径（livePath 不写入 mask）
    if (allPaths.length === 0) return '';
    const cw = canvasW;
    const ch = canvasHRef.current > 0 ? canvasHRef.current : screenH * 0.5;

    // 计算图片在 canvas 内的 contain 渲染矩形
    // fit = 等比缩放系数，renderLeft/Top = 居中偏移（letterbox 边距）
    const fit  = Math.min(cw / imageNativeW, ch / imageNativeH);
    const rl   = (cw - imageNativeW * fit) / 2;   // renderLeft
    const rt   = (ch - imageNativeH * fit) / 2;   // renderTop
    // mask 必须与 ref_image（原生尺寸）像素一一对齐
    const maskW = imageNativeW;
    const maskH = imageNativeH;

    if (process.env.EXPO_OS === 'web') {
      const canvas = document.createElement('canvas');
      canvas.width  = maskW;
      canvas.height = maskH;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, maskW, maskH);
      ctx.strokeStyle = 'white';
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      // 将画布显示坐标系下的笔触尺寸映射到图片原生坐标系（除以缩放系数）
      ctx.lineWidth   = brushSizeRef.current / fit;
      for (const p of allPaths) {
        if (!p.d.includes('L')) continue; // 跳过无效路径
        const cmds = p.d.trim().split(/(?=[MLml])/);
        ctx.beginPath();
        for (const cmd of cmds) {
          const type  = cmd[0];
          const parts = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
          // 坐标转换：canvas 显示坐标 → 图片原生像素坐标
          if (type === 'M') ctx.moveTo((parts[0] - rl) / fit, (parts[1] - rt) / fit);
          else if (type === 'L') ctx.lineTo((parts[0] - rl) / fit, (parts[1] - rt) / fit);
        }
        ctx.stroke();
      }
      return canvas.toDataURL('image/png');
    }

    // Native：用 ViewShot capture（SVG 已移出 Animated.View，不受 imgAnimStyle 变换影响）
    if (!maskViewShotRef.current || ch <= 0) {
      console.warn('buildMaskBase64: ViewShot 未就绪或画布高度为 0');
      return '';
    }
    try {
      const uri: string = await maskViewShotRef.current.capture();
      if (!uri) throw new Error('mask capture 返回空 URI');
      const result = await ImageManipulator.ImageManipulator.manipulate(uri).renderAsync();
      const saved  = await result.saveAsync({ format: ImageManipulator.SaveFormat.PNG, base64: true });
      return `data:image/png;base64,${saved.base64 ?? ''}`;
    } catch (err) {
      console.error('buildMaskBase64 native 失败:', err);
      return '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, canvasW, imageNativeW, imageNativeH, screenH]);

  // ── Web 端滚轮缩放（panGst/drawGst 已通过指针事件处理拖画，只保留 wheel）──
  const handleWheel = process.env.EXPO_OS === 'web'
    ? (e: React.WheelEvent) => {
        if (drawingEnabled) return;
        e.preventDefault();
        const delta  = e.deltaY > 0 ? 0.9 : 1.1;
        const ns     = Math.max(1, Math.min(6, imgScale.value * delta));
        const rect   = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const fx     = e.clientX - rect.left;
        const fy     = e.clientY - rect.top;
        const cx     = rect.width  / 2;
        const cy     = rect.height / 2;
        const fcx    = (fx - cx - imgOffX.value) / imgScale.value;
        const fcy    = (fy - cy - imgOffY.value) / imgScale.value;
        imgScale.value = ns;
        imgOffX.value  = ns <= 1.01 ? 0 : fx - cx - fcx * ns;
        imgOffY.value  = ns <= 1.01 ? 0 : fy - cy - fcy * ns;
      }
    : undefined;


  const handleUndo  = useCallback(() => setPaths(prev => prev.slice(0, -1)), []);
  const handleClear = useCallback(() => { setPaths([]); setLivePath(null); }, []);
  const handleReset = useCallback(() => {
    runOnUI(() => {
      'worklet';
      imgScale.value = 1;
      imgOffX.value  = 0;
      imgOffY.value  = 0;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConfirming = useRef(false);
  const handleConfirm = useCallback(async () => {
    if (isConfirming.current) return;
    // 验证：有笔迹（含 L 段的有效路径）+ 有描述
    const hasStrokes = paths.some(p => p.d?.includes('L'));
    if (!hasStrokes) { setMaskError('请先用画笔涂抹要修改的区域'); return; }
    if (!inpaintPrompt.trim()) { setMaskError('请输入修改描述后再提交'); return; }
    setMaskError('');
    isConfirming.current = true;
    setIsBuilding(true);
    try {
      const mask = await buildMaskBase64();
      if (!mask) {
        setMaskError('蒙版生成失败，请重试');
        return;
      }
      onConfirm(mask, inpaintPrompt.trim());
    } finally {
      isConfirming.current = false;
      setIsBuilding(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inpaintPrompt, paths, buildMaskBase64, onConfirm]);

  const IBW = 36;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,16,40,0.97)' }}>

        {/* ── 顶部工具栏 ─────────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8, gap: 8,
          height: 106,
        }}>
          <Pressable onPress={onClose}
            style={{ width: IBW, height: IBW, borderRadius: IBW / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}>
            <X size={18} color="#fff" />
          </Pressable>

          <View style={{ flex: 1 }} />

          {/* 涂抹笔 toggle */}
          <Pressable
            onPress={() => setBrushMode(m => m === 'pen' ? null : 'pen')}
            style={{
              width: IBW, height: IBW, borderRadius: IBW / 2,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: brushMode === 'pen' ? T.primary + '35' : 'rgba(255,255,255,0.10)',
              borderWidth: 1.5,
              borderColor: brushMode === 'pen' ? T.primary : 'rgba(255,255,255,0.20)',
            }}>
            <Pen size={16} color={brushMode === 'pen' ? T.primary : 'rgba(255,255,255,0.45)'} />
          </Pressable>

          {/* 橡皮擦 toggle */}
          <Pressable
            onPress={() => setBrushMode(m => m === 'eraser' ? null : 'eraser')}
            style={{
              width: IBW, height: IBW, borderRadius: IBW / 2,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: brushMode === 'eraser' ? T.warm + '35' : 'rgba(255,255,255,0.10)',
              borderWidth: 1.5,
              borderColor: brushMode === 'eraser' ? T.warm : 'rgba(255,255,255,0.20)',
            }}>
            <Eraser size={16} color={brushMode === 'eraser' ? T.warm : 'rgba(255,255,255,0.45)'} />
          </Pressable>

          {/* 撤销 */}
          <Pressable onPress={handleUndo} disabled={paths.length === 0}
            style={{ width: IBW, height: IBW, borderRadius: IBW / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}>
            <RefreshCw size={16} color={paths.length === 0 ? 'rgba(255,255,255,0.25)' : '#fff'} />
          </Pressable>

          {/* 复位缩放/平移 */}
          <Pressable onPress={handleReset}
            style={{ width: IBW, height: IBW, borderRadius: IBW / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}>
            <Maximize2 size={16} color="#fff" />
          </Pressable>

          {/* 清空涂抹 */}
          <Pressable onPress={handleClear} disabled={paths.length === 0}
            style={{ width: IBW, height: IBW, borderRadius: IBW / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}>
            <Trash2 size={16} color={paths.length === 0 ? 'rgba(255,255,255,0.25)' : '#FCA5A5'} />
          </Pressable>
        </View>

        {/* ── 笔触滑条 ──────────────────────────────────────────── */}
        <View style={{ height: 44, justifyContent: 'center', opacity: drawingEnabled ? 1 : 0 }}
          pointerEvents={drawingEnabled ? 'auto' : 'none'}>
          <BrushSlider
            value={brushSize}
            onChange={v => { setBrushSize(v); brushSizeRef.current = v; }}
            onSlidingStart={() => { isSliding.current = true;  isDrawing.current = false; }}
            onSlidingEnd={  () => { isSliding.current = false; }}
          />
        </View>

        {/* ── 画布区 ────────────────────────────────────────────── */}
        <GestureDetector gesture={viewGesture}>
          <View
            style={[
              { flex: 1, width: canvasW, alignSelf: 'center', overflow: 'hidden' },
              process.env.EXPO_OS === 'web'
                ? { cursor: (drawingEnabled ? 'crosshair' : 'grab') as 'auto' }
                : undefined,
            ]}
            onLayout={e => {
              const h = e.nativeEvent.layout.height;
              canvasHRef.current = h;
              canvasHSV.value    = h;
              setCanvasHState(h);
            }}
            {...(process.env.EXPO_OS === 'web' ? {
              onWheel: handleWheel as any,
            } : {})}
          >
            {/* 底层原图（跟随 pinch/pan 变换） */}
            <Animated.View style={[
              { position: 'absolute', width: canvasW, height: canvasH },
              imgAnimStyle,
            ]} pointerEvents="none">
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: canvasW, height: canvasH }}
                  contentFit="contain"
                />
              ) : (
                <View style={{ width: canvasW, height: canvasH, backgroundColor: '#1a1430' }} />
              )}

              {/* SVG 笔触显示层：committed paths + livePath 预览 */}
              <Svg
                width={canvasW} height={canvasH}
                style={{ position: 'absolute', top: 0, left: 0 }}
                pointerEvents="none"
              >
                {paths.filter(p => p.d && p.d.includes('L')).map((p, i) => (
                  <Path key={i} d={p.d}
                    stroke={p.color}
                    strokeWidth={brushSize} strokeLinecap="round"
                    strokeLinejoin="round" fill="none"
                  />
                ))}
                {/* 实时预览当前笔画（不存 state，RAF 刷新） */}
                {livePath && livePath.d.includes('L') && (
                  <Path
                    d={livePath.d}
                    stroke={livePath.color}
                    strokeWidth={brushSize} strokeLinecap="round"
                    strokeLinejoin="round" fill="none"
                  />
                )}
              </Svg>

            </Animated.View>

            {/* 隐藏 mask ViewShot — Native 专用（必须在 Animated.View 外，避免 transform 干扰坐标） */}
            {process.env.EXPO_OS !== 'web' && (
              <ViewShot
                ref={maskViewShotRef}
                options={{ format: 'png', quality: 1, pixelRatio: 1 } as any}
                style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none' }}
              >
                {/* 使用图片原生尺寸绘制，确保 mask 与 ref_image 像素 1:1 对齐 */}
                <Svg width={imageNativeW} height={imageNativeH}>
                  <Rect width={imageNativeW} height={imageNativeH} fill="black" />
                  {(() => {
                    // 将 canvas 显示坐标映射回图片原生坐标
                    const ch  = canvasHRef.current > 0 ? canvasHRef.current : screenH * 0.5;
                    const fit = Math.min(canvasW / imageNativeW, ch / imageNativeH);
                    const rl  = (canvasW - imageNativeW * fit) / 2;
                    const rt  = (ch     - imageNativeH * fit) / 2;
                    return paths.filter(p => p.d && p.d.includes('L')).map((p, i) => {
                      // 重新解析路径，将坐标从 canvas 空间映射到原生图片空间
                      const cmds = p.d.trim().split(/(?=[ML])/).map(cmd => {
                        const type  = cmd[0];
                        const parts = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
                        const nx    = (parts[0] - rl) / fit;
                        const ny    = (parts[1] - rt) / fit;
                        return `${type}${nx.toFixed(1)},${ny.toFixed(1)}`;
                      });
                      return (
                        <Path key={i} d={cmds.join(' ')}
                          stroke="white" strokeWidth={brushSize / fit}
                          strokeLinecap="round" strokeLinejoin="round" fill="none"
                        />
                      );
                    });
                  })()}
                </Svg>
              </ViewShot>
            )}

            {/* 半透明遮罩层（固定，不随图片变换） */}
            <View style={{
              position: 'absolute', width: canvasW, height: canvasH,
              backgroundColor: 'rgba(0,0,0,0.15)',
            }} pointerEvents="none" />

            {/* 空状态提示 */}
            {paths.length === 0 && !livePath && (
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }} pointerEvents="none">
                {drawingEnabled
                  ? <>
                      <Pen size={28} color="rgba(255,255,255,0.45)" />
                      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
                        用手指涂抹要修改的区域
                      </Text>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                        单指涂抹 · 双指缩放平移
                      </Text>
                    </>
                  : <>
                      <Pen size={28} color="rgba(255,255,255,0.25)" />
                      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: '600' }}>
                        点击上方画笔开始涂抹
                      </Text>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                        单指平移 · 双指缩放
                      </Text>
                    </>
                }
              </View>
            )}
          </View>
        </GestureDetector>

        {/* ── 底部操作区 ─────────────────────────────────────────── */}
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={{
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 10,
            borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
            backgroundColor: 'rgba(20,16,40,0.98)',
          }}>
            <TextInput
              value={inpaintPrompt}
              onChangeText={t => { setInpaintPrompt(t); setMaskError(''); }}
              placeholder="描述局部修改效果，例如：将表情改为微笑，增加阳光照射效果…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 14, padding: 12,
                color: '#fff', fontSize: 13, lineHeight: 20,
                borderWidth: 1.5,
                borderColor: inpaintPrompt.trim()
                  ? T.primary + '80'
                  : 'rgba(255,255,255,0.15)',
                minHeight: 72, maxHeight: 110, textAlignVertical: 'top',
              }}
              scrollEnabled
            />
            {/* 错误提示 */}
            {maskError ? (
              <Text style={{ fontSize: 12, color: '#ff7875', textAlign: 'center', marginTop: -4 }}>
                {maskError}
              </Text>
            ) : null}
            <Pressable
              onPress={handleConfirm}
              disabled={isBuilding}
              style={{
                backgroundColor: isBuilding
                  ? 'rgba(155,142,196,0.45)'
                  : T.primary,
                borderRadius: 14, paddingVertical: 13, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
            >
              {isBuilding
                ? <ActivityIndicator size="small" color="#fff" />
                : <Sparkles size={16} color="#fff" />
              }
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                {isBuilding
                  ? '正在生成蒙版…'
                  : !paths.some(p => p.d?.includes('L'))
                    ? '请先涂抹要修改的区域'
                    : !inpaintPrompt.trim()
                      ? '请输入修改描述'
                      : '✨ 生成局部修改'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
