import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Send, Info, X, Clock, Plus, FlaskConical, Mic, MicOff, Volume2, VolumeX } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { supabase } from '@/client/supabase';
import { createChatSession, updateChatSession, getMyChatSessions } from '@/db/api';
import { EXPERTS, TEST_CONFIGS } from '@/lib/constants';
import { detectCrisis } from '@/lib/utils';
import { useCrisis } from '@/components/CrisisProvider';
import VoiceMessagePlayer from '@/components/VoiceMessagePlayer';
import {
  useAudioRecorder,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  IOSOutputFormat,
  AudioQuality,
} from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import type { ChatSession } from '@/types/types';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'divider' | 'test_result' | 'tool_result' | 'sandbox_result';
  content: string;
  techNote?: string;
  thinkContent?: string;
  recommendedTestId?: string;
  recommendedTestName?: string;
  // 工具推荐（呼吸冥想 / 梦境解析 / 沙盘游戏室 / 冰山解析 / NVC翻译 / 研究室工具）
  recommendedToolType?: 'breath' | 'dream' | 'sandbox' | 'iceberg' | 'nvc' | 'network' | 'theory' | 'calendar' | 'lovemap';
  recommendedToolLabel?: string;  // 引导文案
  // 语音字段
  audioUrl?: string;        // TTS 生成的音频 URL（assistant 消息）
  audioLength?: number;     // 音频时长 ms
  audioLoading?: boolean;   // TTS 生成中
  // 测评回流卡片
  testResult?: { testTitle: string; summary: string };
  // 工具回流卡片（呼吸/梦境）
  toolResult?: { toolType: 'breath' | 'dream'; title: string; summary: string };
  // 沙盘回流卡片
  sandboxResult?: { sandboxTitle: string; aiAnalysis: string };
}

/** 从 AI 回复中提取 [RECOMMEND_TEST:id:name] 标签 */
function extractTestRecommend(text: string): { testId: string; testName: string; cleanText: string } | null {
  const match = text.match(/\[RECOMMEND_TEST:([^:]+):([^\]]+)\]/);
  if (!match) return null;
  return {
    testId: match[1].trim(),
    testName: match[2].trim(),
    cleanText: text.replace(match[0], '').trim(),
  };
}

/** 从 AI 回复中提取 [RECOMMEND_TOOL:type:label] 标签（含所有工具类型）*/
function extractToolRecommend(text: string): { toolType: 'breath' | 'dream' | 'sandbox' | 'iceberg' | 'nvc' | 'network' | 'theory' | 'calendar' | 'lovemap'; toolLabel: string; cleanText: string } | null {
  const match = text.match(/\[RECOMMEND_TOOL:(breath|dream|sandbox|iceberg|nvc|network|theory|calendar|lovemap):([^\]]+)\]/);
  if (!match) return null;
  return {
    toolType: match[1] as 'breath' | 'dream' | 'sandbox' | 'iceberg' | 'nvc' | 'network' | 'theory' | 'calendar' | 'lovemap',
    toolLabel: match[2].trim(),
    cleanText: text.replace(match[0], '').trim(),
  };
}

/** 解析 AI 回复中的 <think> 标签，返回 { think, reply } */
function parseThinkReply(raw: string): { think: string; reply: string } {
  const match = raw.match(/^[\s\S]*?<think>([\s\S]*?)<\/think>([\s\S]*)$/);
  if (match) {
    return { think: match[1].trim(), reply: match[2].trim() };
  }
  return { think: '', reply: raw.trim() };
}

/** 录音参数 — 16kHz 单声道 m4a，适配百度短语音识别 */
const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

/** arrayBuffer → base64（App 端无 btoa，用 Uint8Array 手动编码） */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? chars[((b1 & 0xf) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b2 & 0x3f] : '=';
  }
  return result;
}
const RESISTANCE_THRESHOLD = 3;
const RESISTANCE_RESPONSES = [
  '感觉有点困难也没关系，有时候思考这些确实需要一些时间。我们可以先停下来，换个话题，或者就静静待一会儿。',
  '你不需要回答每一个问题。我在这里陪你，无论你想说什么都好。',
];

// 将 DB ChatMessage 转换为本地 Message（补充临时 id，恢复音频 URL）
function dbMsgsToLocal(dbMsgs: ChatSession['messages']): Message[] {
  return dbMsgs.map((m, i) => ({
    id: String(i),
    role: m.role,
    content: m.content,
    techNote: m.technique,
    audioUrl: m.audio_url,
    audioLength: m.audio_length ?? 0,
  }));
}

// ── 每位咨询师的专属视觉主题 ─────────────────────────────
interface ExpertTheme {
  screenBg: string;          // 屏幕背景
  headerBg: string;          // 导航栏背景
  headerBorder: string;      // 导航栏底部线
  headerTextColor: string;   // 标题文字颜色
  headerSubColor: string;    // 副标题颜色
  headerBtnBg: string;       // 导航按钮背景
  headerBtnColor: string;    // 导航按钮图标色
  userBubbleBg: string;      // 用户消息气泡背景
  userBubbleText: string;    // 用户消息文字色
  aiBubbleBg: string;        // AI 消息气泡背景
  aiBubbleText: string;      // AI 消息文字色
  aiBubbleShadow: string;    // AI 气泡阴影色
  aiBubbleBorder?: string;   // AI 气泡描边（可选）
  inputAreaBg: string;       // 输入区域背景
  inputBg: string;           // 输入框背景
  inputText: string;         // 输入文字颜色
  inputPlaceholder: string;  // placeholder 颜色
  inputBorder: string;       // 输入框描边
  dividerColor: string;      // 时间戳分隔线色
  dividerText: string;       // 时间戳文字色
  statusBar: 'dark' | 'light'; // 状态栏样式
  avatarBg: string;          // AI 头像背景色
  disclaimerColor: string;   // 免责声明文字色
  loadingColor: string;      // loading indicator 色
}

const EXPERT_THEMES: Record<string, ExpertTheme> = {
  // 罗杰斯 — 人本主义：温暖阳光，向日葵色调
  rogers: {
    screenBg: '#FBF7F0',
    headerBg: '#FFF8EE',
    headerBorder: '#F5E6CC',
    headerTextColor: '#3D2B10',
    headerSubColor: '#9C7A45',
    headerBtnBg: 'rgba(232,163,101,0.15)',
    headerBtnColor: '#C48A3F',
    userBubbleBg: '#E8A365',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#2C1F0A',
    aiBubbleShadow: 'rgba(232,163,101,0.12)',
    aiBubbleBorder: '#F5E6CC',
    inputAreaBg: '#FFF8EE',
    inputBg: '#FDF1E0',
    inputText: '#2C1F0A',
    inputPlaceholder: '#C4A87A',
    inputBorder: '#F0DEC0',
    dividerColor: '#F5E6CC',
    dividerText: '#C4A87A',
    statusBar: 'dark',
    avatarBg: '#FFF0D0',
    disclaimerColor: '#C4A87A',
    loadingColor: '#E8A365',
  },
  // 贝克 — CBT认知行为：清晰结构，薄荷绿临床感
  beck: {
    screenBg: '#F4FAF7',
    headerBg: '#FFFFFF',
    headerBorder: '#C8E8DC',
    headerTextColor: '#1A3328',
    headerSubColor: '#5E9A80',
    headerBtnBg: 'rgba(122,157,140,0.12)',
    headerBtnColor: '#5E9A80',
    userBubbleBg: '#7A9D8C',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#1A3328',
    aiBubbleShadow: 'rgba(122,157,140,0.10)',
    aiBubbleBorder: '#C8E8DC',
    inputAreaBg: '#FFFFFF',
    inputBg: '#EBF5F0',
    inputText: '#1A3328',
    inputPlaceholder: '#8DB8A6',
    inputBorder: '#C8E8DC',
    dividerColor: '#C8E8DC',
    dividerText: '#8DB8A6',
    statusBar: 'dark',
    avatarBg: '#E0F2EA',
    disclaimerColor: '#8DB8A6',
    loadingColor: '#7A9D8C',
  },
  // 皮尔斯 — 格式塔：鲜明紫调，感官当下
  perls: {
    screenBg: '#F5F0FF',
    headerBg: '#EDE6FF',
    headerBorder: '#D4C8F5',
    headerTextColor: '#2A1A5E',
    headerSubColor: '#8070B8',
    headerBtnBg: 'rgba(155,142,196,0.18)',
    headerBtnColor: '#7860A8',
    userBubbleBg: '#9B8EC4',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FDFBFF',
    aiBubbleText: '#2A1A5E',
    aiBubbleShadow: 'rgba(155,142,196,0.15)',
    aiBubbleBorder: '#D4C8F5',
    inputAreaBg: '#EDE6FF',
    inputBg: '#F5F0FF',
    inputText: '#2A1A5E',
    inputPlaceholder: '#A898D8',
    inputBorder: '#D4C8F5',
    dividerColor: '#D4C8F5',
    dividerText: '#A898D8',
    statusBar: 'dark',
    avatarBg: '#E8E0FF',
    disclaimerColor: '#A898D8',
    loadingColor: '#9B8EC4',
  },
  // 沃尔普 — 行为主义：冷静蓝，系统精准
  wolpe: {
    screenBg: '#F0F6FF',
    headerBg: '#FFFFFF',
    headerBorder: '#C2D8F5',
    headerTextColor: '#0D2640',
    headerSubColor: '#4A7CB8',
    headerBtnBg: 'rgba(91,155,213,0.12)',
    headerBtnColor: '#4A7CB8',
    userBubbleBg: '#5B9BD5',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#0D2640',
    aiBubbleShadow: 'rgba(91,155,213,0.10)',
    aiBubbleBorder: '#C2D8F5',
    inputAreaBg: '#FFFFFF',
    inputBg: '#E8F2FC',
    inputText: '#0D2640',
    inputPlaceholder: '#7AAAD8',
    inputBorder: '#C2D8F5',
    dividerColor: '#C2D8F5',
    dividerText: '#7AAAD8',
    statusBar: 'dark',
    avatarBg: '#D8EEFF',
    disclaimerColor: '#7AAAD8',
    loadingColor: '#5B9BD5',
  },
  // 弗洛伊德 — 心理动力学：深夜酒红，神秘潜意识
  freud: {
    screenBg: '#1A1210',
    headerBg: '#231510',
    headerBorder: '#4A2A20',
    headerTextColor: '#F0D8C8',
    headerSubColor: '#C4856A',
    headerBtnBg: 'rgba(196,133,106,0.18)',
    headerBtnColor: '#C4856A',
    userBubbleBg: '#C4856A',
    userBubbleText: '#1A0E08',
    aiBubbleBg: '#2C1C14',
    aiBubbleText: '#F0D8C8',
    aiBubbleShadow: 'rgba(196,133,106,0.20)',
    aiBubbleBorder: '#4A2A20',
    inputAreaBg: '#231510',
    inputBg: '#2C1C14',
    inputText: '#F0D8C8',
    inputPlaceholder: '#8A5A48',
    inputBorder: '#4A2A20',
    dividerColor: '#4A2A20',
    dividerText: '#8A5A48',
    statusBar: 'light',
    avatarBg: '#3A2018',
    disclaimerColor: '#8A5A48',
    loadingColor: '#C4856A',
  },
  // 怀特 — 叙事疗法：羊皮纸暖橙，故事书质感
  white: {
    screenBg: '#FFF9F0',
    headerBg: '#FFF4E4',
    headerBorder: '#F0D8B4',
    headerTextColor: '#3D1F08',
    headerSubColor: '#C47A40',
    headerBtnBg: 'rgba(217,123,90,0.12)',
    headerBtnColor: '#B86838',
    userBubbleBg: '#D97B5A',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#3D1F08',
    aiBubbleShadow: 'rgba(217,123,90,0.12)',
    aiBubbleBorder: '#F0D8B4',
    inputAreaBg: '#FFF4E4',
    inputBg: '#FFF0D8',
    inputText: '#3D1F08',
    inputPlaceholder: '#C4A07A',
    inputBorder: '#F0D8B4',
    dividerColor: '#F0D8B4',
    dividerText: '#C4A07A',
    statusBar: 'dark',
    avatarBg: '#FFE8CC',
    disclaimerColor: '#C4A07A',
    loadingColor: '#D97B5A',
  },
  // 德沙泽 — 焦点解决：清新青绿，前进方向感
  deshazer: {
    screenBg: '#F0FAF8',
    headerBg: '#FFFFFF',
    headerBorder: '#B8E8E0',
    headerTextColor: '#0A2820',
    headerSubColor: '#3A8A7C',
    headerBtnBg: 'rgba(74,155,142,0.12)',
    headerBtnColor: '#3A8A7C',
    userBubbleBg: '#4A9B8E',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#0A2820',
    aiBubbleShadow: 'rgba(74,155,142,0.10)',
    aiBubbleBorder: '#B8E8E0',
    inputAreaBg: '#FFFFFF',
    inputBg: '#E0F5F0',
    inputText: '#0A2820',
    inputPlaceholder: '#6AB8A8',
    inputBorder: '#B8E8E0',
    dividerColor: '#B8E8E0',
    dividerText: '#6AB8A8',
    statusBar: 'dark',
    avatarBg: '#CCF0E8',
    disclaimerColor: '#6AB8A8',
    loadingColor: '#4A9B8E',
  },
  // 海耶斯 — ACT接纳承诺：靛蓝薰衣草，正念空间感
  hayes: {
    screenBg: '#F2F0FF',
    headerBg: '#EAE6FF',
    headerBorder: '#CCC4F8',
    headerTextColor: '#1A1250',
    headerSubColor: '#6A5EC0',
    headerBtnBg: 'rgba(123,104,200,0.15)',
    headerBtnColor: '#6A5EC0',
    userBubbleBg: '#7B68C8',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#1A1250',
    aiBubbleShadow: 'rgba(123,104,200,0.12)',
    aiBubbleBorder: '#CCC4F8',
    inputAreaBg: '#EAE6FF',
    inputBg: '#F2F0FF',
    inputText: '#1A1250',
    inputPlaceholder: '#9888D8',
    inputBorder: '#CCC4F8',
    dividerColor: '#CCC4F8',
    dividerText: '#9888D8',
    statusBar: 'dark',
    avatarBg: '#DDD8FF',
    disclaimerColor: '#9888D8',
    loadingColor: '#7B68C8',
  },
  // 弗兰克尔 — 意义疗法：烛光金棕，深沉存在感
  frankl: {
    screenBg: '#1C1810',
    headerBg: '#251E0E',
    headerBorder: '#4A3C1A',
    headerTextColor: '#F5E8C0',
    headerSubColor: '#C4A55A',
    headerBtnBg: 'rgba(196,165,90,0.18)',
    headerBtnColor: '#C4A55A',
    userBubbleBg: '#C4A55A',
    userBubbleText: '#1C1000',
    aiBubbleBg: '#2C2416',
    aiBubbleText: '#F5E8C0',
    aiBubbleShadow: 'rgba(196,165,90,0.18)',
    aiBubbleBorder: '#4A3C1A',
    inputAreaBg: '#251E0E',
    inputBg: '#2C2416',
    inputText: '#F5E8C0',
    inputPlaceholder: '#8A7240',
    inputBorder: '#4A3C1A',
    dividerColor: '#4A3C1A',
    dividerText: '#8A7240',
    statusBar: 'light',
    avatarBg: '#3A2E18',
    disclaimerColor: '#8A7240',
    loadingColor: '#C4A55A',
  },
  // 萨提亚 — 关系治疗：樱花粉玫瑰，温柔整合感
  satir: {
    screenBg: '#FFF5F8',
    headerBg: '#FFEEF3',
    headerBorder: '#F5C8D8',
    headerTextColor: '#3D1020',
    headerSubColor: '#C4507A',
    headerBtnBg: 'rgba(224,106,140,0.15)',
    headerBtnColor: '#C4507A',
    userBubbleBg: '#E06A8C',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#3D1020',
    aiBubbleShadow: 'rgba(224,106,140,0.12)',
    aiBubbleBorder: '#F5C8D8',
    inputAreaBg: '#FFEEF3',
    inputBg: '#FFF5F8',
    inputText: '#3D1020',
    inputPlaceholder: '#D498AE',
    inputBorder: '#F5C8D8',
    dividerColor: '#F5C8D8',
    dividerText: '#D498AE',
    statusBar: 'dark',
    avatarBg: '#FFE0EC',
    disclaimerColor: '#D498AE',
    loadingColor: '#E06A8C',
  },
  // 卢森堡 — 非暴力沟通：天鸽蓝银，平和共情感
  rosenberg: {
    screenBg: '#F0F7FF',
    headerBg: '#FFFFFF',
    headerBorder: '#B8D8F5',
    headerTextColor: '#0A2040',
    headerSubColor: '#3A72B8',
    headerBtnBg: 'rgba(91,155,213,0.12)',
    headerBtnColor: '#3A72B8',
    userBubbleBg: '#5B9BD5',
    userBubbleText: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#0A2040',
    aiBubbleShadow: 'rgba(91,155,213,0.10)',
    aiBubbleBorder: '#B8D8F5',
    inputAreaBg: '#FFFFFF',
    inputBg: '#E8F2FC',
    inputText: '#0A2040',
    inputPlaceholder: '#6AAAD8',
    inputBorder: '#B8D8F5',
    dividerColor: '#B8D8F5',
    dividerText: '#6AAAD8',
    statusBar: 'dark',
    avatarBg: '#CCE8FF',
    disclaimerColor: '#6AAAD8',
    loadingColor: '#5B9BD5',
  },
};

function getTheme(expertId: string): ExpertTheme {
  return EXPERT_THEMES[expertId] ?? EXPERT_THEMES.rogers;
}

export default function ChatScreen() {
  const { expert: expertId, testContext, dreamContext, breathContext, sandboxContext } = useLocalSearchParams<{
    expert: string;
    testContext?: string;
    dreamContext?: string;
    breathContext?: string;
    sandboxContext?: string;
  }>();
  const router = useRouter();
  const { session } = useSession();
  const { showCrisisPanel } = useCrisis();

  const expert = EXPERTS.find(e => e.id === expertId) ?? EXPERTS[0];

  // 解析测评上下文
  const parsedTestContext = (() => {
    if (!testContext) return null;
    try { return JSON.parse(decodeURIComponent(testContext)) as { testTitle: string; summary: string; answersSnippet: string }; }
    catch { return null; }
  })();

  // 解析梦境上下文（来自梦境解析页跳转）
  const parsedDreamContext = (() => {
    if (!dreamContext) return null;
    try { return JSON.parse(decodeURIComponent(dreamContext)) as { dreamTitle: string; dreamContent: string; aiAnalysis: string }; }
    catch { return null; }
  })();

  // 解析呼吸冥想回流上下文
  const parsedBreathContext = (() => {
    if (!breathContext) return null;
    try { return JSON.parse(decodeURIComponent(breathContext)) as { modeName: string; duration: number; breathCount: number }; }
    catch { return null; }
  })();

  // 解析沙盘游戏室回流上下文
  const parsedSandboxContext = (() => {
    if (!sandboxContext) return null;
    try { return JSON.parse(decodeURIComponent(sandboxContext)) as { sandboxTitle: string; aiAnalysis: string }; }
    catch { return null; }
  })();

  const contextGreeting = parsedDreamContext
    ? `${expert.greeting}\n\n我注意到你带来了一个梦境——「${parsedDreamContext.dreamTitle}」。我已经读过了梦境内容和AI的解析。你现在的感受是什么？有什么想和我说的吗？`
    : parsedSandboxContext
      ? `${expert.greeting}\n\n我看到你完成了一次沙盘创作——「${parsedSandboxContext.sandboxTitle}」。我已经读过了AI的沙盘解读。你在摆放沙盘时，有什么感受或想法想和我分享吗？`
      : parsedTestContext
        ? `${expert.greeting}\n\n我注意到你刚完成了「${parsedTestContext.testTitle}」测评。结果显示：${parsedTestContext.summary.slice(0, 60)}……你愿意跟我聊聊这次测评让你有什么感受吗？`
        : parsedBreathContext
          ? `${expert.greeting}\n\n我看到你刚完成了一次呼吸冥想练习（${parsedBreathContext.modeName}，${Math.round(parsedBreathContext.duration / 60)} 分钟）。感觉怎么样？身体和心情有什么变化吗？`
          : expert.greeting;

  const initMsg: Message = { id: '0', role: 'assistant', content: contextGreeting };

  const [messages, setMessages] = useState<Message[]>([initMsg]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showTech, setShowTech] = useState<string | null>(null);
  const [showThinkMap, setShowThinkMap] = useState<Record<string, boolean>>({});
  const [skipCount, setSkipCount] = useState(0);
  const [showReport, setShowReport] = useState(false);
  // 持久化会话
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  // 防止上下文重复注入（每次从工具/测评页返回只注入一次）
  const testContextInjected = useRef(false);
  const toolContextInjected = useRef(false);
  const sandboxContextInjected = useRef(false);

  // ── 语音功能状态 ──────────────────────────────────────────────
  const [ttsEnabled, setTtsEnabled]     = useState(true);    // AI 回复是否自动语音播放
  const [recording, setRecording]       = useState(false);   // 正在录音
  const [recognizing, setRecognizing]   = useState(false);   // 语音识别中
  const [recError, setRecError]         = useState<string | null>(null);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  /** 调用 TTS Edge Function，返回 { audioUrl, audioLength } */
  const generateTTS = async (text: string): Promise<{ audioUrl: string; audioLength: number } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('tts-minimax', {
        body: {
          text,
          voice_id: expert.voiceId,
          model: 'speech-02-turbo',
          speed: expert.voiceSpeed,
          pitch: expert.voicePitch,
        },
      });
      if (error || !data?.audioUrl) return null;
      return { audioUrl: data.audioUrl, audioLength: data.audioLength ?? 0 };
    } catch {
      return null;
    }
  };

  /** 手动为某条 AI 消息生成语音并播放 */
  const handleManualTts = async (msgId: string, text: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioLoading: true } : m));
    try {
      const result = await generateTTS(text);
      setMessages(prev => {
        const next = prev.map(m =>
          m.id === msgId
            ? { ...m, audioLoading: false, audioUrl: result?.audioUrl, audioLength: result?.audioLength ?? 0 }
            : m,
        );
        persistMessages(next);
        return next;
      });
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioLoading: false } : m));
    }
  };

  /** 将录音文件 URI 转为文字 */
  const transcribeAudio = async (fileUri: string): Promise<string> => {
    const resp = await fetch(fileUri);
    const buf  = await resp.arrayBuffer();
    const speech = arrayBufferToBase64(buf);
    const len    = buf.byteLength;
    const { data, error } = await supabase.functions.invoke('short-speech-recognition', {
      body: { speech, len, format: 'm4a', rate: 16000, cuid: 'glimmer-app' },
    });
    if (error || data?.err_no !== 0) throw new Error(data?.err_msg ?? '识别失败');
    return (data.result?.[0] ?? '').trim();
  };

  /** 按住开始录音 */
  const startRecording = async () => {
    setRecError(null);
    if (process.env.EXPO_OS === 'web') { setRecError('Web 端暂不支持语音输入'); return; }
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) { setRecError('未获得麦克风权限'); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  /** 松手停止录音并识别 */
  const stopRecording = async () => {
    if (!recording) return;
    setRecording(false);
    setRecognizing(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) { setRecError('录音文件丢失'); setRecognizing(false); return; }
      const text = await transcribeAudio(uri);
      if (text) {
        setInput(text);
        // 自动发送
        await handleSendText(text);
      } else {
        setRecError('未能识别语音，请重试');
      }
    } catch {
      setRecError('语音识别失败，请重试');
    } finally {
      setRecognizing(false);
    }
  };

  // ── 加载历史会话 / 自动续接最近未完成会话 ────────────────
  useFocusEffect(useCallback(() => {
    if (!session) return;
    (async () => {
      setLoadingSession(true);
      const all = await getMyChatSessions(session.user.id);
      const mine = all.filter(s => s.expert === expert.id);
      setPastSessions(mine);
      // 自动续接最近一次未完成的会话
      const latest = mine.find(s => !s.is_completed);
      if (latest && latest.messages.length > 0) {
        setSessionId(latest.id);
        const restored = dbMsgsToLocal(latest.messages);
        setMessages(restored);
        // 从测评页返回：注入测评结果卡片 + 触发咨询师回复
        if (parsedTestContext && !testContextInjected.current) {
          testContextInjected.current = true;
          await injectTestContext(latest.id, restored, parsedTestContext);
        }
        // 从呼吸冥想返回：注入工具结果卡片 + 触发咨询师回复
        if (parsedBreathContext && !toolContextInjected.current) {
          toolContextInjected.current = true;
          await injectToolContext(latest.id, restored, {
            toolType: 'breath',
            title: '呼吸冥想',
            summary: `完成「${parsedBreathContext.modeName}」${Math.round(parsedBreathContext.duration / 60)} 分钟，共 ${parsedBreathContext.breathCount} 次完整呼吸。`,
          });
        }
        // 从梦境解析返回：注入工具结果卡片 + 触发咨询师回复（dreamContext 已在 contextGreeting 中处理，同样需要注入卡片）
        if (parsedDreamContext && !toolContextInjected.current) {
          toolContextInjected.current = true;
          await injectToolContext(latest.id, restored, {
            toolType: 'dream',
            title: `梦境「${parsedDreamContext.dreamTitle}」`,
            summary: parsedDreamContext.aiAnalysis.slice(0, 120) + '……',
          });
        }
        // 从沙盘游戏室返回：注入沙盘结果卡片 + 触发咨询师回复
        if (parsedSandboxContext && !sandboxContextInjected.current) {
          sandboxContextInjected.current = true;
          await injectSandboxContext(latest.id, restored, parsedSandboxContext);
        }
      } else {
        // 无未完成会话则新建：自动为问候语生成 TTS
        const newSess = await createChatSession(session.user.id, expert.id);
        if (newSess) {
          setSessionId(newSess.id);
          const greetWithLoading: Message = { ...initMsg, audioLoading: true };
          setMessages([greetWithLoading]);
          await updateChatSession(newSess.id, {
            messages: [{ role: 'assistant', content: expert.greeting, timestamp: new Date().toISOString() }],
          });
          // 异步生成问候语 TTS
          (async () => {
            const result = await generateTTS(contextGreeting);
            setMessages(prev => prev.map(m =>
              m.id === '0'
                ? { ...m, audioLoading: false, audioUrl: result?.audioUrl, audioLength: result?.audioLength ?? 0 }
                : m,
            ));
          })();
        }
      }
      setLoadingSession(false);
    })();
  }, [expert.id])); // eslint-disable-line react-hooks/exhaustive-deps

  const buildMessages = (msgs: Message[]) => {
    // 梦境上下文优先，其次测评上下文，其次呼吸上下文
    const contextBlock = parsedDreamContext
      ? `\n\n【来访者梦境材料】\n梦境标题：${parsedDreamContext.dreamTitle}\n\n梦境原文：\n${parsedDreamContext.dreamContent}\n\nAI精神分析解读：\n${parsedDreamContext.aiAnalysis}\n\n请你作为心理咨询师，充分利用以上梦境材料，以你的流派视角与来访者深入探讨。你可以就梦中的具体意象、情绪或AI解读中提到的内容向来访者提问，帮助其深化自我理解。你也可以在适当时候推荐来访者做心理测评，格式为：[RECOMMEND_TEST:测评ID:测评名称]，可用的测评ID有：phq9(PHQ-9抑郁筛查)、gad7(GAD-7焦虑筛查)、scl90(SCL-90心理健康)、stress(压力自测)、burnout(职业倦怠)、social_anxiety(社交焦虑)、sds(SDS抑郁自评)、sas(SAS焦虑自评)、confidence(自信心评估)、via(性格优势)、mht(MHT心理健康诊断)`
      : parsedSandboxContext
        ? `\n\n【来访者沙盘材料】\n沙盘标题：${parsedSandboxContext.sandboxTitle}\n\nAI沙盘解读：\n${parsedSandboxContext.aiAnalysis}\n\n请你作为心理咨询师，充分利用以上沙盘材料，以你的流派视角与来访者深入探讨沙盘中的意象、空间布局与情感氛围。你可以就具体物件或AI解读中的内容向来访者提问，帮助其深化自我理解。你也可以在适当时候推荐来访者做心理测评，格式为：[RECOMMEND_TEST:测评ID:测评名称]，可用的测评ID有：phq9(PHQ-9抑郁筛查)、gad7(GAD-7焦虑筛查)、scl90(SCL-90心理健康)、stress(压力自测)、burnout(职业倦怠)、social_anxiety(社交焦虑)、sds(SDS抑郁自评)、sas(SAS焦虑自评)、confidence(自信心评估)、via(性格优势)、mht(MHT心理健康诊断)`
      : parsedBreathContext
        ? `\n\n【来访者工具使用情况】\n来访者刚完成了一次呼吸冥想练习：${parsedBreathContext.modeName}，时长 ${Math.round(parsedBreathContext.duration / 60)} 分钟，共完成 ${parsedBreathContext.breathCount} 次完整呼吸。请以你的流派视角，自然地与来访者探讨冥想体验、身心感受以及背后的情绪状态。你也可以在适当时候推荐来访者做心理测评，格式为：[RECOMMEND_TEST:测评ID:测评名称]，推荐工具格式：[RECOMMEND_TOOL:dream:引导文案]`
        : parsedTestContext
          ? `\n\n【来访者测评背景】\n测评名称：${parsedTestContext.testTitle}\n测评结果摘要：${parsedTestContext.summary}\n部分答题数据：${parsedTestContext.answersSnippet}\n\n请你作为心理咨询师，在对话中自然地利用这些测评信息，可以就具体题目或结果向来访者提问，例如："你在测评中关于X方面的回答让我很好奇……"。你也可以在适当时候推荐来访者做其他测评，格式为：[RECOMMEND_TEST:测评ID:测评名称]，可用的测评ID有：phq9(PHQ-9抑郁筛查)、gad7(GAD-7焦虑筛查)、scl90(SCL-90心理健康)、stress(压力自测)、burnout(职业倦怠)、social_anxiety(社交焦虑)、sds(SDS抑郁自评)、sas(SAS焦虑自评)、confidence(自信心评估)、via(性格优势)、mht(MHT心理健康诊断)`
          : `\n\n你也可以在适当时候推荐来访者做心理测评，格式为：[RECOMMEND_TEST:测评ID:测评名称]，可用的测评ID有：phq9(PHQ-9抑郁筛查)、gad7(GAD-7焦虑筛查)、scl90(SCL-90心理健康)、stress(压力自测)、burnout(职业倦怠)、social_anxiety(社交焦虑)、sds(SDS抑郁自评)、sas(SAS焦虑自评)、confidence(自信心评估)、via(性格优势)、mht(MHT心理健康诊断)\n推荐工具（适当时候推荐）：发送 [RECOMMEND_TOOL:breath:引导文案] 推荐呼吸冥想（适合焦虑/压力场景），发送 [RECOMMEND_TOOL:dream:引导文案] 推荐梦境解析（适合探索潜意识场景），发送 [RECOMMEND_TOOL:sandbox:引导文案] 推荐沙盘游戏室（适合需要具象化内心世界、语言表达困难的场景）。引导文案需简洁有温度，如"让我们用呼吸找回平静"或"用沙盘把内心的世界摆出来"。`;

    return [
      { role: 'system', content: expert.systemPrompt + contextBlock },
      ...msgs
        .filter(m => m.role !== 'divider' && m.role !== 'test_result' && m.role !== 'tool_result' && m.role !== 'sandbox_result')
        .map(m => ({ role: m.role, content: m.content })),
    ];
  };

  /**
   * 从测评页返回时调用：
   * 1. 显示测评结果卡片（纯 UI，不存 DB）
   * 2. 自动发一条用户消息，触发咨询师针对结果进行回复
   */
  const injectTestContext = async (
    sid: string,
    baseMessages: Message[],
    ctx: { testTitle: string; summary: string; answersSnippet: string },
  ) => {
    // 测评结果卡片（仅前端展示，不写入 DB）
    const card: Message = {
      id: `tr_${Date.now()}`,
      role: 'test_result',
      content: '',
      testResult: { testTitle: ctx.testTitle, summary: ctx.summary },
    };
    // 用户消息：告知咨询师已完成测评
    const userText = `我刚完成了「${ctx.testTitle}」，测评结果是：${ctx.summary}`;
    const userMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'user',
      content: userText,
    };
    const withCard = [...baseMessages, card, userMsg];
    setMessages(withCard);
    setSending(true);

    // 持久化用户消息（不含卡片）
    const persistable = [...baseMessages, userMsg];
    await updateChatSession(sid, {
      messages: persistable
        .filter(m => m.role !== 'divider' && m.role !== 'test_result')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          technique: m.techNote,
          audio_url: m.audioUrl,
          audio_length: m.audioLength,
          timestamp: new Date().toISOString(),
        })),
    });

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: buildMessages(persistable),
          expert_id: expert.id,
        },
      });
      if (error) throw error;

      const raw = data?.choices?.[0]?.message?.content ?? '谢谢你分享这次测评。能跟我多说说完成测评时有什么感受吗？';
      const techNote = data?.tech_note ?? '';
      const { think, reply: replyWithTag } = parseThinkReply(raw);
      const testRec = extractTestRecommend(replyWithTag);
      const reply = testRec ? testRec.cleanText : replyWithTag;

      const aiMsgId = (Date.now() + 2).toString();
      const aiMsg: Message = {
        id: aiMsgId,
        role: 'assistant',
        content: reply,
        techNote,
        thinkContent: think || undefined,
        recommendedTestId: testRec?.testId,
        recommendedTestName: testRec?.testName,
        audioLoading: ttsEnabled,
      };
      const final = [...withCard, aiMsg];
      setMessages(final);

      // 持久化（卡片不写 DB）
      await updateChatSession(sid, {
        messages: [...persistable, userMsg, aiMsg]
          .filter(m => m.role !== 'divider' && m.role !== 'test_result' && m.role !== 'tool_result')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            technique: m.techNote,
            audio_url: m.audioUrl,
            audio_length: m.audioLength,
            timestamp: new Date().toISOString(),
          })),
      });

      if (ttsEnabled) await enrichWithTTS(aiMsgId, reply, final, setMessages);
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: '网络似乎出了点问题，但我已经看到你的测评结果了。可以跟我聊聊你的感受吗？',
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  /**
   * 从工具页（呼吸冥想 / 梦境解析）返回时调用：
   * 1. 显示工具结果卡片（纯 UI）
   * 2. 自动发一条用户消息，触发咨询师针对结果进行回复
   */
  const injectToolContext = async (
    sid: string,
    baseMessages: Message[],
    ctx: { toolType: 'breath' | 'dream'; title: string; summary: string },
  ) => {
    const card: Message = {
      id: `tool_${Date.now()}`,
      role: 'tool_result',
      content: '',
      toolResult: ctx,
    };
    const toolName = ctx.toolType === 'breath' ? '呼吸冥想' : '梦境解析';
    const userText = ctx.toolType === 'breath'
      ? `我刚完成了一次呼吸冥想练习，${ctx.summary}，感觉放松了一些。`
      : `我记录并分析了一个梦境，${ctx.summary}`;
    const userMsg: Message = { id: (Date.now() + 1).toString(), role: 'user', content: userText };
    const withCard = [...baseMessages, card, userMsg];
    setMessages(withCard);
    setSending(true);

    const persistable = [...baseMessages, userMsg];
    await updateChatSession(sid, {
      messages: persistable
        .filter(m => m.role !== 'divider' && m.role !== 'test_result' && m.role !== 'tool_result')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          technique: m.techNote,
          audio_url: m.audioUrl,
          audio_length: m.audioLength,
          timestamp: new Date().toISOString(),
        })),
    });

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: buildMessages(persistable), expert_id: expert.id },
      });
      if (error) throw error;

      const raw = data?.choices?.[0]?.message?.content ?? `谢谢你分享这次${toolName}体验，能跟我多说说感受吗？`;
      const techNote = data?.tech_note ?? '';
      const { think, reply: replyWithTag } = parseThinkReply(raw);
      const testRec = extractTestRecommend(replyWithTag);
      const toolRec = extractToolRecommend(testRec ? testRec.cleanText : replyWithTag);
      const reply = toolRec ? toolRec.cleanText : (testRec ? testRec.cleanText : replyWithTag);

      const aiMsgId = (Date.now() + 2).toString();
      const aiMsg: Message = {
        id: aiMsgId, role: 'assistant', content: reply, techNote,
        thinkContent: think || undefined,
        recommendedTestId: testRec?.testId,
        recommendedTestName: testRec?.testName,
        recommendedToolType: toolRec?.toolType,
        recommendedToolLabel: toolRec?.toolLabel,
        audioLoading: ttsEnabled,
      };
      const final = [...withCard, aiMsg];
      setMessages(final);

      await updateChatSession(sid, {
        messages: [...persistable, aiMsg]
          .filter(m => m.role !== 'divider' && m.role !== 'test_result' && m.role !== 'tool_result')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            technique: m.techNote,
            audio_url: m.audioUrl,
            audio_length: m.audioLength,
            timestamp: new Date().toISOString(),
          })),
      });

      if (ttsEnabled) await enrichWithTTS(aiMsgId, reply, final, setMessages);
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `谢谢你愿意分享这次${toolName}的体验，网络似乎有点问题，但我很想听你说说感受。`,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  /**
   * 从沙盘游戏室返回时调用：
   * 1. 显示沙盘结果卡片（纯 UI）
   * 2. 自动发一条用户消息，触发咨询师针对沙盘解读进行回复
   */
  const injectSandboxContext = async (
    sid: string,
    baseMessages: Message[],
    ctx: { sandboxTitle: string; aiAnalysis: string },
  ) => {
    const card: Message = {
      id: `sandbox_${Date.now()}`,
      role: 'sandbox_result',
      content: '',
      sandboxResult: ctx,
    };
    const userText = `我刚完成了一次沙盘游戏——${ctx.sandboxTitle}。AI解读摘要：${ctx.aiAnalysis.slice(0, 100)}……`;
    const userMsg: Message = { id: (Date.now() + 1).toString(), role: 'user', content: userText };
    const withCard = [...baseMessages, card, userMsg];
    setMessages(withCard);
    setSending(true);

    const persistable = [...baseMessages, userMsg];
    await updateChatSession(sid, {
      messages: persistable
        .filter(m => m.role !== 'divider' && m.role !== 'test_result' && m.role !== 'tool_result' && m.role !== 'sandbox_result')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          technique: m.techNote,
          audio_url: m.audioUrl,
          audio_length: m.audioLength,
          timestamp: new Date().toISOString(),
        })),
    });

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: buildMessages(persistable), expert_id: expert.id },
      });
      if (error) throw error;

      const raw = data?.choices?.[0]?.message?.content ?? '感谢你分享了这次沙盘创作，我很想听你说说在摆放时的感受和想法。';
      const techNote = data?.tech_note ?? '';
      const { think, reply: replyWithTag } = parseThinkReply(raw);
      const testRec = extractTestRecommend(replyWithTag);
      const toolRec = extractToolRecommend(testRec ? testRec.cleanText : replyWithTag);
      const reply = toolRec ? toolRec.cleanText : (testRec ? testRec.cleanText : replyWithTag);

      const aiMsgId = (Date.now() + 2).toString();
      const aiMsg: Message = {
        id: aiMsgId, role: 'assistant', content: reply, techNote,
        thinkContent: think || undefined,
        recommendedTestId: testRec?.testId,
        recommendedTestName: testRec?.testName,
        recommendedToolType: toolRec?.toolType,
        recommendedToolLabel: toolRec?.toolLabel,
        audioLoading: ttsEnabled,
      };
      const final = [...withCard, aiMsg];
      setMessages(final);

      await updateChatSession(sid, {
        messages: [...persistable, aiMsg]
          .filter(m => m.role !== 'divider' && m.role !== 'test_result' && m.role !== 'tool_result' && m.role !== 'sandbox_result')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            technique: m.techNote,
            audio_url: m.audioUrl,
            audio_length: m.audioLength,
            timestamp: new Date().toISOString(),
          })),
      });

      if (ttsEnabled) await enrichWithTTS(aiMsgId, reply, final, setMessages);
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: '感谢你带来了这次沙盘创作，网络有点问题，但我已经看到了解读。可以先跟我说说摆放时的感受吗？',
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  // 保存到 DB（含音频 URL，实现持久化；卡片类消息不写入）
  const persistMessages = useCallback(async (msgs: Message[]) => {
    if (!sessionId) return;
    await updateChatSession(sessionId, {
      messages: msgs
        .filter(m => m.role !== 'divider' && m.role !== 'test_result' && m.role !== 'tool_result' && m.role !== 'sandbox_result')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          technique: m.techNote,
          audio_url: m.audioUrl,
          audio_length: m.audioLength,
          timestamp: new Date().toISOString(),
        })),
    });
  }, [sessionId]);

  // 切换到某个历史会话
  const loadSession = (s: ChatSession) => {
    setSessionId(s.id);
    setMessages(dbMsgsToLocal(s.messages));
    setShowHistory(false);
  };

  // 新建会话
  const startNew = async () => {
    if (!session) return;
    const newSess = await createChatSession(session.user.id, expert.id);
    if (newSess) {
      setSessionId(newSess.id);
      const greeting: Message = { id: '0', role: 'assistant', content: expert.greeting };
      setMessages([greeting]);
      await updateChatSession(newSess.id, {
        messages: [{ role: 'assistant', content: expert.greeting, timestamp: new Date().toISOString() }],
      });
      const all = await getMyChatSessions(session.user.id);
      setPastSessions(all.filter(s => s.expert === expert.id));
    }
    setShowHistory(false);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    await handleSendText(text);
  };

  /** 核心发送逻辑，可由文字输入或语音识别触发 */
  const handleSendText = async (text: string) => {
    if (!text.trim() || sending) return;

    // 危机检测
    if (detectCrisis(text)) {
      showCrisisPanel();
      return;
    }

    const isResistance = ['不知道', '随便', '没什么', '不想说', '不清楚'].some(w => text.includes(w));
    const newSkipCount = isResistance ? skipCount + 1 : 0;
    setSkipCount(newSkipCount);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setSending(true);

    // 每日 AI 积分额度扣减与阻断校验（每次对话消耗 5 点积分）
    const quotaCheck = await checkAndConsumeCredits(5);
    if (!quotaCheck.allowed) {
      const quotaMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: quotaCheck.message || '今日 AI 对话额度积分不足（单次对话消耗5点），每日 24:00 自动重置。升级心愈版享每日50点，工作台版享每日100点额度。',
        techNote: '额度已用尽',
      };
      const final = [...updated, quotaMsg];
      setMessages(final);
      setSending(false);
      await persistMessages(final);
      return;
    }

    // 顺应阻抗
    if (newSkipCount >= RESISTANCE_THRESHOLD) {
      setTimeout(async () => {
        const retreatMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: RESISTANCE_RESPONSES[Math.floor(Math.random() * RESISTANCE_RESPONSES.length)],
          techNote: '顺应阻抗',
        };
        const final = [...updated, retreatMsg];
        setMessages(final);
        setSending(false);
        setSkipCount(0);
        await persistMessages(final);
        // TTS
        if (ttsEnabled) await enrichWithTTS(retreatMsg.id, retreatMsg.content, final, setMessages);
      }, 800);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: buildMessages(updated), expert_id: expert.id },
      });

      if (error) throw error;

      const reply_raw = data?.choices?.[0]?.message?.content ?? '对不起，我暂时无法回应，请稍后再试。';
      const techNote = data?.tech_note ?? '';
      const { think, reply: replyWithTag } = parseThinkReply(reply_raw);

      // 提取测评推荐标签 + 工具推荐标签
      const testRec = extractTestRecommend(replyWithTag);
      const toolRec = extractToolRecommend(testRec ? testRec.cleanText : replyWithTag);
      const reply = toolRec ? toolRec.cleanText : (testRec ? testRec.cleanText : replyWithTag);

      // 时间戳分隔线
      const divider: Message = {
        id: `div_${Date.now()}`,
        role: 'divider',
        content: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      const aiMsgId = (Date.now() + 1).toString();
      const aiMsg: Message = {
        id: aiMsgId,
        role: 'assistant',
        content: reply,
        techNote,
        thinkContent: think || undefined,
        recommendedTestId: testRec?.testId,
        recommendedTestName: testRec?.testName,
        recommendedToolType: toolRec?.toolType,
        recommendedToolLabel: toolRec?.toolLabel,
        audioLoading: ttsEnabled,
      };
      const final = [...updated, aiMsg, divider];
      setMessages(final);
      await persistMessages(final);

      // 异步生成 TTS
      if (ttsEnabled) await enrichWithTTS(aiMsgId, reply, final, setMessages);
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '网络似乎出现了一点问题，请稍后重试。我还在这里陪着你。',
      };
      const final = [...updated, errMsg];
      setMessages(final);
      await persistMessages(final);
    } finally {
      setSending(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  /** 生成 TTS 并将 audioUrl/audioLength 注入消息列表，同时持久化到 DB */
  const enrichWithTTS = async (
    msgId: string,
    text: string,
    currentMsgs: Message[],
    updateFn: React.Dispatch<React.SetStateAction<Message[]>>,
  ) => {
    const result = await generateTTS(text);
    const updated = currentMsgs.map(m =>
      m.id === msgId
        ? { ...m, audioLoading: false, audioUrl: result?.audioUrl, audioLength: result?.audioLength ?? 0 }
        : m,
    );
    updateFn(updated);
    // 持久化音频 URL，确保退出重进后仍可播放
    await persistMessages(updated);
  };

  const theme = getTheme(expert.id);

  const renderMessage = ({ item }: { item: Message }) => {
    if (item.role === 'divider') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginVertical: 8 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.dividerColor }} />
          <Text style={{ fontSize: 11, color: theme.dividerText, marginHorizontal: 12 }}>{item.content}</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.dividerColor }} />
        </View>
      );
    }

    // 测评结果回流卡片
    if (item.role === 'test_result' && item.testResult) {
      return (
        <View style={{ marginHorizontal: 16, marginVertical: 10 }}>
          <View style={{
            borderRadius: 16, overflow: 'hidden',
            backgroundColor: theme.aiBubbleBg,
            borderWidth: 1, borderColor: expert.color + '40',
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: expert.color + '20' }],
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, paddingVertical: 10,
              backgroundColor: expert.color + '18',
              borderBottomWidth: 1, borderBottomColor: expert.color + '30',
            }}>
              <Text style={{ fontSize: 15 }}>📊</Text>
              <Text style={{ marginLeft: 7, fontSize: 13, fontWeight: '600', color: expert.color, flex: 1 }}>
                测评结果已回传
              </Text>
              <View style={{ backgroundColor: expert.color + '22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: expert.color, fontWeight: '500' }}>
                  {item.testResult.testTitle}
                </Text>
              </View>
            </View>
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 13, color: theme.aiBubbleText, lineHeight: 20, opacity: 0.85 }}>
                {item.testResult.summary}
              </Text>
              <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: expert.color + '10', borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 12 }}>💬</Text>
                <Text style={{ marginLeft: 6, fontSize: 12, color: expert.color, fontWeight: '500' }}>
                  咨询师正在根据你的测评结果进行分析…
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    // 沙盘游戏室结果回流卡片
    if (item.role === 'sandbox_result' && item.sandboxResult) {
      const sbColor = '#9B8EC4';
      return (
        <View style={{ marginHorizontal: 16, marginVertical: 10 }}>
          <View style={{
            borderRadius: 16, overflow: 'hidden',
            backgroundColor: theme.aiBubbleBg,
            borderWidth: 1, borderColor: sbColor + '50',
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: sbColor + '25' }],
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, paddingVertical: 10,
              backgroundColor: sbColor + '15',
              borderBottomWidth: 1, borderBottomColor: sbColor + '30',
            }}>
              <Text style={{ fontSize: 15 }}>🏖</Text>
              <Text style={{ marginLeft: 7, fontSize: 13, fontWeight: '600', color: sbColor, flex: 1 }}>
                沙盘解读已回传
              </Text>
              <View style={{ backgroundColor: sbColor + '20', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: sbColor, fontWeight: '500' }}>{item.sandboxResult.sandboxTitle}</Text>
              </View>
            </View>
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 13, color: theme.aiBubbleText, lineHeight: 20, opacity: 0.85 }} numberOfLines={4}>
                {item.sandboxResult.aiAnalysis}
              </Text>
              <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: sbColor + '10', borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 12 }}>💬</Text>
                <Text style={{ marginLeft: 6, fontSize: 12, color: sbColor, fontWeight: '500' }}>
                  咨询师正在结合沙盘意象进行深度解读…
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    // 工具结果回流卡片（呼吸冥想 / 梦境解析）
    if (item.role === 'tool_result' && item.toolResult) {      const toolEmoji = item.toolResult.toolType === 'breath' ? '🍃' : '🌙';
      const toolColor = item.toolResult.toolType === 'breath' ? '#7A9D8C' : '#6B7EC8';
      return (
        <View style={{ marginHorizontal: 16, marginVertical: 10 }}>
          <View style={{
            borderRadius: 16, overflow: 'hidden',
            backgroundColor: theme.aiBubbleBg,
            borderWidth: 1, borderColor: toolColor + '50',
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: toolColor + '25' }],
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, paddingVertical: 10,
              backgroundColor: toolColor + '15',
              borderBottomWidth: 1, borderBottomColor: toolColor + '30',
            }}>
              <Text style={{ fontSize: 15 }}>{toolEmoji}</Text>
              <Text style={{ marginLeft: 7, fontSize: 13, fontWeight: '600', color: toolColor, flex: 1 }}>
                {item.toolResult.toolType === 'breath' ? '冥想记录已回传' : '梦境解析已回传'}
              </Text>
              <View style={{ backgroundColor: toolColor + '20', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: toolColor, fontWeight: '500' }}>{item.toolResult.title}</Text>
              </View>
            </View>
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 13, color: theme.aiBubbleText, lineHeight: 20, opacity: 0.85 }}>
                {item.toolResult.summary}
              </Text>
              <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: toolColor + '10', borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 12 }}>💬</Text>
                <Text style={{ marginLeft: 6, fontSize: 12, color: toolColor, fontWeight: '500' }}>
                  咨询师正在结合你的体验进行深度解读…
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    const isUser = item.role === 'user';
    const thinkVisible = showThinkMap[item.id] ?? false;

    return (
      <View style={{ flexDirection: 'row', marginBottom: 14, justifyContent: isUser ? 'flex-end' : 'flex-start', paddingHorizontal: 16 }}>
        {!isUser && (
          <View style={{
            width: 38, height: 38, borderRadius: 19,
            alignItems: 'center', justifyContent: 'center',
            marginRight: 10, marginTop: 2, flexShrink: 0,
            backgroundColor: theme.avatarBg,
          }}>
            <Text style={{ fontSize: 18 }}>{expert.emoji}</Text>
          </View>
        )}
        <View style={{ maxWidth: '76%' }}>
          <View style={{
            borderRadius: 18,
            borderTopRightRadius: isUser ? 4 : 18,
            borderTopLeftRadius: isUser ? 18 : 4,
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: isUser ? theme.userBubbleBg : theme.aiBubbleBg,
            borderWidth: !isUser && theme.aiBubbleBorder ? 1 : 0,
            borderColor: theme.aiBubbleBorder ?? 'transparent',
            boxShadow: !isUser ? [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: theme.aiBubbleShadow }] : undefined,
          }}>
            {/* 思考过程折叠区 */}
            {!isUser && item.thinkContent && thinkVisible && (
              <View style={{
                marginBottom: 10, padding: 10, borderRadius: 10,
                backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.04)',
              }}>
                <Text style={{ fontSize: 11, color: theme.aiBubbleText, opacity: 0.6, lineHeight: 17 }}>
                  {item.thinkContent}
                </Text>
              </View>
            )}
            <Text style={{
              fontSize: 14,
              lineHeight: 22,
              color: isUser ? theme.userBubbleText : theme.aiBubbleText,
              fontWeight: isUser ? '500' : '400',
            }}>
              {item.content}
            </Text>
          </View>

          {/* 语音播放器 — 仅 assistant 消息 */}
          {!isUser && (item.audioUrl || item.audioLoading) && (
            <VoiceMessagePlayer
              audioUrl={item.audioUrl ?? null}
              audioLength={item.audioLength ?? 0}
              accentColor={expert.color}
              loading={item.audioLoading}
            />
          )}

          {/* 测评推荐卡片 — 跳转时携带 returnExpertId，测评完成后可回流 */}
          {!isUser && item.recommendedTestId && (
            <Link href={`/(app)/test/${item.recommendedTestId}?returnExpertId=${expert.id}` as import('expo-router').RelativePathString} asChild>
              <Pressable onPress={() => {}} style={{
                marginTop: 8,
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: theme.aiBubbleBg,
                borderWidth: 1.5, borderColor: expert.color + '50',
                borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
              }}>
                <FlaskConical size={15} color={expert.color} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: expert.color }}>
                    推荐测评：{item.recommendedTestName}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.aiBubbleText, opacity: 0.5, marginTop: 1 }}>
                    点击立即前往
                  </Text>
                </View>
              </Pressable>
            </Link>
          )}

          {/* 工具推荐卡片 — 携带 returnExpertId，完成后回流（含沙盘/冰山/NVC）*/}
          {!isUser && item.recommendedToolType && (() => {
            const toolMap: Record<string, { path: string; emoji: string; color: string; bg: string; defaultLabel: string; sub: string }> = {
              sandbox:  { path: `/(app)/sandbox-intro?returnExpertId=${expert.id}`,   emoji: '🏖',  color: '#9B8EC4', bg: 'rgba(155,142,196,0.12)', defaultLabel: '前往沙盘游戏室',      sub: '完成后AI解读将自动回传'         },
              breath:   { path: `/(app)/breath?returnExpertId=${expert.id}`,          emoji: '🍃',  color: '#7A9D8C', bg: 'rgba(122,157,140,0.12)', defaultLabel: '前往呼吸冥想',        sub: '完成后结果将自动回传'           },
              dream:    { path: `/(app)/dream-analysis?returnExpertId=${expert.id}`,  emoji: '🌙',  color: '#6B7EC8', bg: 'rgba(107,126,200,0.12)', defaultLabel: '前往梦境记录',        sub: '记录后AI解读将自动回传'         },
              iceberg:  { path: '/(app)/iceberg-analyzer',                            emoji: '🧊',  color: '#E06A8C', bg: 'rgba(224,106,140,0.12)', defaultLabel: '前往冰山隐喻解析器',  sub: '拆解内心冰山，看见真实自我'     },
              nvc:      { path: '/(app)/nvc-translator',                              emoji: '🕊️', color: '#5B9BD5', bg: 'rgba(91,155,213,0.12)',  defaultLabel: '前往非暴力沟通翻译机', sub: '将评判语言转化为四要素表达'     },
              network:  { path: '/(app)/love-network',                                emoji: '🕸️', color: '#E06A8C', bg: 'rgba(224,106,140,0.10)', defaultLabel: '绘制关系网络图',      sub: '可视化你的亲密关系支持系统'     },
              theory:   { path: '/(app)/love-theory',                                 emoji: '📚',  color: '#9B8EC4', bg: 'rgba(155,142,196,0.10)', defaultLabel: '探索关系心理学理论',  sub: '爱情三角/依恋/NVC/萨提亚理论卡片'},
              calendar: { path: '/(app)/love-calendar',                               emoji: '📅',  color: '#E8A365', bg: 'rgba(232,163,101,0.10)', defaultLabel: '打开关系日历',        sub: '记录你们共同的重要时刻'         },
              lovemap:  { path: '/(app)/love-map',                                    emoji: '🗺️', color: '#5B9BD5', bg: 'rgba(91,155,213,0.10)',  defaultLabel: '查看关系定位地图',    sub: '物理距离×心理距离可视化分析'    },
            };
            const cfg = toolMap[item.recommendedToolType];
            if (!cfg) return null;
            return (
              <Link href={cfg.path as import('expo-router').RelativePathString} asChild>
                <Pressable onPress={() => {}} style={{
                  marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: cfg.bg, borderWidth: 1.5,
                  borderColor: cfg.color + '80', borderRadius: 14,
                  paddingHorizontal: 14, paddingVertical: 10,
                }}>
                  <Text style={{ fontSize: 22 }}>{cfg.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: cfg.color }}>
                      {item.recommendedToolLabel ?? cfg.defaultLabel}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.aiBubbleText, opacity: 0.5, marginTop: 1 }}>{cfg.sub}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: cfg.color, fontWeight: '600' }}>前往 →</Text>
                </Pressable>
              </Link>
            );
          })()}

          {/* 思考折叠 + 语音生成/重播 + 技术标记 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginLeft: 2, flexWrap: 'wrap' }}>
            {/* 语音生成/播放快捷按钮：当未生成语音或需要朗读时显示 */}
            {!isUser && !item.audioUrl && (
              <Pressable
                onPress={() => handleManualTts(item.id, item.content)}
                disabled={item.audioLoading}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 8, paddingVertical: 2.5,
                  borderRadius: 12, backgroundColor: expert.color + '15',
                  borderWidth: 1, borderColor: expert.color + '35',
                  opacity: item.audioLoading ? 0.7 : 1,
                }}
              >
                {item.audioLoading ? (
                  <>
                    <ActivityIndicator size="small" color={expert.color} style={{ transform: [{ scale: 0.6 }] }} />
                    <Text style={{ fontSize: 11, color: expert.color, fontWeight: '500' }}>正在合成语音…</Text>
                  </>
                ) : (
                  <>
                    <Volume2 size={12} color={expert.color} />
                    <Text style={{ fontSize: 11, color: expert.color, fontWeight: '500' }}>朗读语音</Text>
                  </>
                )}
              </Pressable>
            )}

            {!isUser && item.thinkContent && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                onPress={() => setShowThinkMap(prev => ({ ...prev, [item.id]: !thinkVisible }))}
              >
                <Text style={{ fontSize: 11, color: theme.dividerText }}>
                  {thinkVisible ? '▲ 收起思考' : '▼ 查看思考'}
                </Text>
              </Pressable>
            )}
            {!isUser && item.techNote && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                onPress={() => setShowTech(showTech === item.id ? null : item.id)}
              >
                <Info size={11} color={theme.dividerText} />
                <Text style={{ fontSize: 11, color: theme.dividerText }}>技术</Text>
                {showTech === item.id && (
                  <View style={{ backgroundColor: expert.color + '20', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, color: expert.color, fontWeight: '600' }}>{item.techNote}</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  const reportContent = messages
    .filter(m => m.role === 'assistant' && m.techNote)
    .map(m => `• ${m.techNote}`)
    .join('\n') || '（本次对话未检测到明显技术标记）';

  return (
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <StatusBar style={theme.statusBar} />

      {/* ── 顶部导航（专属主题配色）── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
        backgroundColor: theme.headerBg,
        borderBottomWidth: 1, borderBottomColor: theme.headerBorder,
      }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            marginRight: 12, width: 36, height: 36, borderRadius: 18,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: theme.headerBtnBg,
          }}
        >
          <ArrowLeft size={18} color={theme.headerBtnColor} />
        </Pressable>

        {/* 头像 */}
        <View style={{
          width: 42, height: 42, borderRadius: 21,
          alignItems: 'center', justifyContent: 'center',
          marginRight: 12, backgroundColor: theme.avatarBg,
          borderWidth: 2, borderColor: expert.color + '40',
        }}>
          <Text style={{ fontSize: 22 }}>{expert.emoji}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.headerTextColor }}>{expert.name}</Text>
          <Text style={{ fontSize: 12, color: theme.headerSubColor, marginTop: 1 }}>
            {expert.school} · 心理咨询对话
          </Text>
        </View>

        <Pressable
          onPress={() => setShowHistory(true)}
          style={{
            width: 36, height: 36, borderRadius: 18,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: theme.headerBtnBg, marginRight: 8,
          }}
        >
          <Clock size={16} color={theme.headerBtnColor} />
        </Pressable>
        <Pressable
          onPress={() => setShowReport(true)}
          style={{
            borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7,
            backgroundColor: theme.headerBtnBg,
          }}
        >
          <Text style={{ fontSize: 13, color: theme.headerBtnColor, fontWeight: '600' }}>结束</Text>
        </Pressable>
      </View>

      {loadingSession ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.loadingColor} />
          <Text style={{ color: theme.dividerText, fontSize: 14, marginTop: 12 }}>加载对话记录…</Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={i => i.id}
            contentContainerStyle={{ paddingTop: 20, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            style={{ backgroundColor: theme.screenBg }}
            ListFooterComponent={
              sending ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: 19,
                    alignItems: 'center', justifyContent: 'center', marginRight: 10,
                    backgroundColor: theme.avatarBg,
                  }}>
                    <Text style={{ fontSize: 18 }}>{expert.emoji}</Text>
                  </View>
                  <View style={{
                    backgroundColor: theme.aiBubbleBg, borderRadius: 18, borderTopLeftRadius: 4,
                    paddingHorizontal: 18, paddingVertical: 14,
                    borderWidth: theme.aiBubbleBorder ? 1 : 0,
                    borderColor: theme.aiBubbleBorder ?? 'transparent',
                  }}>
                    <ActivityIndicator size="small" color={theme.loadingColor} />
                  </View>
                </View>
              ) : null
            }
          />

          {/* ── 输入区域 ── */}
          <KeyboardAvoidingView behavior="padding">
            <View style={{
              paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16,
              backgroundColor: theme.inputAreaBg,
              borderTopWidth: 1, borderTopColor: theme.headerBorder,
            }}>
              {/* 工具栏：仅 TTS 语音播报开关 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Pressable
                  onPress={() => setTtsEnabled(v => !v)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: ttsEnabled ? expert.color + '25' : theme.headerBtnBg,
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                    borderWidth: 1, borderColor: ttsEnabled ? expert.color + '60' : 'transparent',
                  }}
                >
                  {ttsEnabled
                    ? <Volume2 size={14} color={expert.color} />
                    : <VolumeX size={14} color={theme.headerBtnColor} />
                  }
                  <Text style={{ fontSize: 12, fontWeight: '600', color: ttsEnabled ? expert.color : theme.headerBtnColor }}>
                    {ttsEnabled ? '语音播报' : '静默'}
                  </Text>
                </Pressable>
              </View>

              {/* 录音识别错误提示 */}
              {recError && (
                <Text style={{ fontSize: 11, color: '#E07070', textAlign: 'center', marginBottom: 6 }}>
                  {recError}
                </Text>
              )}

              {/* 文字输入区（含内联语音按钮） */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <TextInput
                  placeholder={`跟${expert.name}说说...`}
                  placeholderTextColor={theme.inputPlaceholder}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  style={{
                    flex: 1, backgroundColor: theme.inputBg,
                    borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12,
                    fontSize: 14, color: theme.inputText,
                    maxHeight: 100, lineHeight: 20,
                    borderWidth: 1.5, borderColor: theme.inputBorder,
                  }}
                  returnKeyType="default"
                />
                {/* 麦克风按钮：按住录音，松开识别发送 */}
                <Pressable
                  onPress={() => {}}
                  onPressIn={startRecording}
                  onPressOut={stopRecording}
                  disabled={recognizing}
                  style={{
                    width: 44, height: 44, borderRadius: 22,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: recording ? expert.color : theme.headerBtnBg,
                    borderWidth: 1.5,
                    borderColor: recording ? expert.color : 'transparent',
                  }}
                >
                  {recognizing
                    ? <ActivityIndicator size="small" color={expert.color} />
                    : <Mic size={18} color={recording ? '#fff' : theme.headerBtnColor} />
                  }
                </Pressable>
                {/* 发送按钮 */}
                <Pressable
                  onPress={handleSend}
                  disabled={!input.trim() || sending}
                  style={{
                    width: 44, height: 44, borderRadius: 22,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: input.trim() ? expert.color : theme.headerBtnBg,
                  }}
                >
                  <Send size={18} color={input.trim() ? '#FFFFFF' : theme.headerBtnColor} />
                </Pressable>
              </View>

              <Text style={{ fontSize: 11, color: theme.disclaimerColor, textAlign: 'center', marginTop: 8 }}>
                AI对话仅供参考，不替代专业咨询 · 如有危机请拨打心理援助热线
              </Text>
            </View>
          </KeyboardAvoidingView>
        </>
      )}

      {/* ── 历史会话面板 ── */}
      {showHistory && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: theme.headerBg, borderRadius: 24, padding: 20, width: '100%', maxHeight: 400 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.headerTextColor }}>📋 历史对话记录</Text>
              <Pressable onPress={() => setShowHistory(false)}><X size={20} color={theme.dividerText} /></Pressable>
            </View>
            <Pressable
              onPress={startNew}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: expert.color + '18', borderRadius: 16,
                paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
              }}
            >
              <Plus size={16} color={expert.color} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: expert.color }}>开始新的咨询</Text>
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>
              {pastSessions.length === 0 ? (
                <Text style={{ color: theme.dividerText, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>暂无历史记录</Text>
              ) : pastSessions.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => loadSession(s)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: theme.inputBg, borderRadius: 14,
                    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.headerTextColor }} numberOfLines={1}>
                      {s.title ?? `${new Date(s.created_at).toLocaleDateString('zh-CN')} 的对话`}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.dividerText, marginTop: 2 }}>
                      {s.messages.length} 条消息 · {s.is_completed ? '已结束' : '进行中'}
                    </Text>
                  </View>
                  {!s.is_completed && (
                    <View style={{ backgroundColor: expert.color + '20', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12, color: expert.color, fontWeight: '600' }}>继续</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── 复盘报告 Modal ── */}
      {showReport && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: theme.headerBg, borderRadius: 24, padding: 24, width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.headerTextColor }}>📋 对话复盘报告</Text>
              <Pressable onPress={() => setShowReport(false)}><X size={20} color={theme.dividerText} /></Pressable>
            </View>
            <View style={{ backgroundColor: theme.inputBg, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.headerTextColor, marginBottom: 8 }}>
                本次{expert.name}使用的咨询技术：
              </Text>
              <Text style={{ fontSize: 13, color: theme.headerSubColor, lineHeight: 22 }}>{reportContent}</Text>
            </View>
            <View style={{ backgroundColor: expert.color + '15', borderRadius: 16, padding: 16, marginBottom: 18 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.headerTextColor, marginBottom: 6 }}>🎯 家庭作业</Text>
              <Text style={{ fontSize: 13, color: theme.headerSubColor, lineHeight: 20 }}>{expert.homework}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setShowReport(false)}
                style={{ flex: 1, backgroundColor: theme.inputBg, borderRadius: 16, paddingVertical: 13, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.headerTextColor }}>继续对话</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (sessionId) await updateChatSession(sessionId, { is_completed: true });
                  router.back();
                }}
                style={{ flex: 1, backgroundColor: expert.color, borderRadius: 16, paddingVertical: 13, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>结束本次</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
