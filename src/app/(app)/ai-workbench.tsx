/**
 * ai-workbench.tsx — 心理健康AI编程工作台 v209
 *
 * 功能列表：
 * 1. 停止生成按钮：流式输出时显示「停止」按钮，点击立即终止SSE
 * 2. 分享面板：HTML代码块新增分享按钮（导出HTML文件/复制网页链接/微信分享）
 * 3. 上下文长度提升至100万 token（slice(-200) 历史消息）
 * 4. 版本记录：每次生成HTML代码自动保存版本快照，可在版本历史中预览/恢复
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView,
  ActivityIndicator, Modal, FlatList, LayoutAnimation, Platform, UIManager,
} from 'react-native';import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import {
  ArrowLeft, Bot, Code2, Play, SquarePen,
  ChevronDown, Send, Copy, History, Trash2, X,
  Square, Share2, Download, Link, MessageCircle, GitBranch, RotateCcw, Clock, Plus,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createParser } from 'eventsource-parser';
import { fetch } from 'expo/fetch';
import {
  File as FSFile,
  Paths,
} from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// ── 常量 ──────────────────────────────────────────────────────────
const SESSIONS_KEY = 'ai_workbench_sessions_v2'; // v2: 加入 versions 字段
const MAX_SESSIONS = 20;
const MAX_VERSIONS = 30; // 每个会话最多保留版本数
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ── 全局 HTML 存储（跨路由传递）──────────────────────────────────
export let previewHtmlStore = '';

// ── 类型 ──────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  hasCode?: boolean;
  isThinking?: boolean;       // 推理模型正在思考中（content 尚未到达）
  thinkingText?: string;      // 推理过程全文（无长度限制）
  thinkingSeconds?: number;   // 推理用时（秒），思考结束后写入
  images?: string[];          // 用户消息附带的本地上传图片（data URI）
}

// 每次生成 HTML 的版本快照
interface HtmlVersion {
  id: string;          // 版本唯一 ID
  label: string;       // 版本号标签，如 "v1"
  prompt: string;      // 触发本次生成的用户输入（截断 30 字）
  html: string;        // 完整 HTML 代码
  createdAt: string;   // 生成时间
}

interface Session {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  versions?: HtmlVersion[]; // HTML 版本历史
}

// ── 模型配置 ──────────────────────────────────────────────────────
const MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', emoji: '⚡', desc: '快速响应，代码生成首选' },
  { id: 'deepseek-v4-pro',   label: 'DeepSeek V4 Pro',   emoji: '🧠', desc: '深度推理，复杂任务' },
  { id: 'glm-4-flash',       label: 'GLM-5.3',           emoji: '🌟', desc: '智谱AI，均衡性能' },
  { id: 'hunyuan-t1',        label: '混元 Hy3',          emoji: '🎯', desc: '腾讯混元，中文理解强' },
  { id: 'kimi-k3',           label: 'Kimi K3',           emoji: '🌙', desc: '月之暗面，长文本推理' },
];

// ── System Prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是一位专精心理健康应用开发的AI编程智能体。

## 【核心铁律】输出完整性要求

你生成的每一个HTML文件，必须是可直接在浏览器运行的完整单文件。

### 完整性检查清单（缺少任何一项均视为失败）：
1. ✅ 第一行必须是 <!DOCTYPE html>
2. ✅ 必须有 <html lang="zh-CN"> 标签
3. ✅ 必须有完整的 <head>...</head>（含charset、viewport、title、所有style）
4. ✅ 必须有完整的 <body>...</body>（含所有HTML结构和script）
5. ✅ 最后一行必须是 </html>
6. ✅ 所有CSS写在<style>标签内（禁止外部CDN，禁止外链）
7. ✅ 所有JS写在<script>标签内（禁止外部CDN，禁止外链）
8. ✅ 代码不得有任何省略（严禁"// ...其他代码""/* 省略 */"等写法）

### 绝对禁止：
- 引用任何外部资源（Tailwind CDN、Bootstrap CDN、Google Fonts、外部JS等）
- 未关闭的标签或不完整的代码块
- 中途截断（不论代码多长，必须写到</html>为止）

## 输出格式规范
先用1-2句话说明设计思路，然后用\`\`\`html包裹完整HTML输出。

## 设计规范
- 中文界面，移动端响应式（max-width:480px居中）
- 配色：柔和紫/蓝/绿色系，背景浅色或渐变
- 字体大小≥14px，行高≥1.6，触控目标≥44px

## 专长领域
情绪日记、正念冥想计时器、CBT认知记录、压力测评、呼吸练习、心情追踪等`;

// ── 工具函数 ─────────────────────────────────────────────────────
function extractHtmlCode(content: string): string | null {
  const m = content.match(/```html\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  const raw = content.trim();
  if (raw.toLowerCase().startsWith('<!doctype') || raw.toLowerCase().startsWith('<html')) return raw;
  return null;
}

function makeSessionTitle(msgs: Message[]): string {
  const first = msgs.find(m => m.role === 'user' && m.id !== 'welcome');
  if (!first) return '新对话';
  return first.content.slice(0, 22) + (first.content.length > 22 ? '…' : '');
}

function formatDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function makeWelcomeMsg(): Message {
  return {
    id: 'welcome',
    role: 'assistant',
    content: '你好！我是AI编程智能体 🤖\n\n我专门帮你开发心理健康相关的应用和工具。你可以：\n\n• 用自然语言描述你想要的功能\n• 我会生成完整可运行的HTML应用\n• 点击「运行预览」跳转全屏预览\n• 点击「分享」可导出HTML文件或分享给他人\n• 生成时点击「停止」可随时中断\n• 点击右上角📋查看切换历史对话\n\n点击下方快捷提示快速开始 ✨',
    timestamp: new Date().toISOString(),
  };
}

// ── 快速提示词 ────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: '情绪追踪', prompt: '帮我生成一个情绪日记追踪应用，用户可以记录每天的情绪状态（1-10分）和当天发生的事件，展示情绪变化折线图。界面温馨美观，使用纯CSS样式，不依赖任何外部CDN。' },
  { label: '正念计时器', prompt: '生成一个正念冥想计时器应用，支持选择3/5/10/20分钟，有呼吸引导动画（吸气4秒，屏气4秒，呼气4秒），计时结束有柔和提示。纯CSS+JS实现，不依赖外部资源。' },
  { label: 'CBT记录表', prompt: '生成一个CBT认知行为治疗记录表应用，包含：触发事件、自动思维、情绪评分、认知扭曲识别、理性回应、结果情绪评分。风格专业温和，纯内联CSS样式。' },
  { label: '压力评测', prompt: '生成一个简版PSS压力感知量表测评应用（10题），每题有5个选项，完成后展示压力级别分析和建议，界面平静舒适。所有样式内联，不依赖外部CDN。' },
];

// ── 分享面板 ──────────────────────────────────────────────────────
function ShareSheet({ visible, htmlCode, onClose, onToast }: {
  visible: boolean;
  htmlCode: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  // 导出 HTML 文件（Native: expo-sharing；Web: a标签下载）
  const handleExportHtml = async () => {
    onClose();
    try {
      if (process.env.EXPO_OS === 'web') {
        const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `心理健康应用_${Date.now()}.html`;
        a.click();
        URL.revokeObjectURL(url);
        onToast('✓ HTML 文件已下载');
      } else {
        const file = new FSFile(Paths.cache, `app_${Date.now()}.html`);
        file.write(htmlCode);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, { mimeType: 'text/html', dialogTitle: '导出 HTML 应用' });
        } else {
          onToast('⚠️ 当前设备不支持文件分享');
        }
      }
    } catch {
      onToast('⚠️ 导出失败，请重试');
    }
  };

  // 复制 data URI 链接（可粘贴到浏览器直接打开）
  const handleCopyLink = async () => {
    onClose();
    try {
      const encoded = encodeURIComponent(htmlCode);
      const dataUri = `data:text/html;charset=utf-8,${encoded}`;
      await Clipboard.setStringAsync(dataUri);
      onToast('✓ 网页链接已复制（可粘贴到浏览器打开）');
    } catch {
      onToast('⚠️ 复制失败');
    }
  };

  // 微信分享：先保存文件，再调用系统分享（用户可选微信）
  const handleWechat = async () => {
    onClose();
    try {
      if (process.env.EXPO_OS === 'web') {
        if (navigator.share) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const webFile = new (window as any).File([htmlCode], '心理健康应用.html', { type: 'text/html' });
          await navigator.share({ title: '心理健康应用', files: [webFile] });
        } else {
          await Clipboard.setStringAsync(htmlCode);
          onToast('✓ 代码已复制，请手动粘贴分享');
        }
      } else {
        const file = new FSFile(Paths.cache, `share_${Date.now()}.html`);
        file.write(htmlCode);
        await Sharing.shareAsync(file.uri, { mimeType: 'text/html', dialogTitle: '分享到微信或其他应用' });
      }
    } catch {
      onToast('⚠️ 分享失败，请重试');
    }
  };

  const actions = [
    { icon: Download, label: '导出 HTML 文件', desc: '保存到本地，可用浏览器打开', color: '#7C6FB0', onPress: handleExportHtml },
    { icon: Link,     label: '复制网页链接',   desc: '生成 data URI，粘贴到浏览器直接访问', color: '#4A90C4', onPress: handleCopyLink },
    { icon: MessageCircle, label: '分享到微信', desc: '调起系统分享面板，选择微信发送', color: '#07C160', onPress: handleWechat },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose}>
        <View style={{ flex: 1 }} />
        <View
          style={{ backgroundColor: '#12121F', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36 }}
          onStartShouldSetResponder={() => true}
        >
          {/* 把手 */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(155,142,196,0.3)' }} />
          </View>
          {/* 头部 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(155,142,196,0.1)' }}>
            <Share2 size={16} color="#9B8EC4" />
            <Text style={{ color: '#E0D9FF', fontSize: 16, fontWeight: '700', marginLeft: 8, flex: 1 }}>分享 HTML 应用</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}><X size={18} color="#6B7280" /></Pressable>
          </View>
          {/* 操作项 */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${a.color}22`, alignItems: 'center', justifyContent: 'center' }}>
                  <a.icon size={20} color={a.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#E0D9FF', fontSize: 14, fontWeight: '600' }}>{a.label}</Text>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{a.desc}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── 可折叠思考过程块 ─────────────────────────────────────────────
// 开启 Android LayoutAnimation 支持
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function ThinkingBlock({ text, isThinking, seconds }: { text: string; isThinking: boolean; seconds?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text && !isThinking) return null;

  const toggle = () => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.75 },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded(e => !e);
  };

  // 标题文案
  const titleLabel = isThinking
    ? '深度思考中…'
    : seconds != null
      ? `思考过程（用时 ${seconds} 秒 · ${text.length} 字）`
      : `思考过程（${text.length} 字）`;

  return (
    <View style={{ marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(155,142,196,0.25)', overflow: 'hidden', backgroundColor: 'rgba(30,30,48,0.6)' }}>
      {/* 标题行：点击展开/收起 */}
      <Pressable
        onPress={toggle}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}
      >
        {isThinking
          ? <ActivityIndicator size="small" color="#9B8EC4" style={{ width: 16, height: 16 }} />
          : <Text style={{ fontSize: 14 }}>🧠</Text>
        }
        <Text style={{ flex: 1, color: '#9B8EC4', fontSize: 13, fontWeight: '600' }}>
          {titleLabel}
        </Text>
        {text ? (
          <ChevronDown
            size={14}
            color="#9B8EC4"
            style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
          />
        ) : null}
      </Pressable>
      {/* 展开内容（LayoutAnimation 已处理动画） */}
      {expanded && text ? (
        <ScrollView
          style={{ maxHeight: 240, borderTopWidth: 1, borderTopColor: 'rgba(155,142,196,0.15)' }}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          <Text style={{ color: '#6B7280', fontSize: 12, lineHeight: 19, padding: 12, fontStyle: 'italic' }}>
            {text}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

// ── 消息气泡 ──────────────────────────────────────────────────────
function MessageBubble({ msg, onPreview, onCopy, onShare, onShowVersions, onCopyText }: {
  msg: Message;
  onPreview: (html: string) => void;
  onCopy: (code: string) => void;
  onShare: (code: string) => void;
  onShowVersions: () => void;
  onCopyText: (text: string) => void;
}) {
  const isUser = msg.role === 'user';

  const renderContent = () => {
    // ── 推理模型：先展示可折叠思考块，再展示正式回答 ──
    const thinkingBlock = (msg.thinkingText || msg.isThinking)
      ? <ThinkingBlock key="thinking" text={msg.thinkingText ?? ''} isThinking={!!msg.isThinking} seconds={msg.thinkingSeconds} />
      : null;

    // 推理阶段且回答尚未到达：只显示思考块
    if (msg.isThinking && !msg.content) {
      return thinkingBlock;
    }
    if (!msg.hasCode) {
      return (
        <View style={{ gap: 8 }}>
          {thinkingBlock}
          {msg.images && msg.images.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {msg.images.map((uri, i) => (
                <View key={`${i}-${uri.slice(0, 20)}`} style={{ width: 120, height: 120, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
              ))}
            </View>
          )}
          {msg.content ? (
            <Text style={{ color: isUser ? '#fff' : '#E0D9FF', fontSize: 14, lineHeight: 22 }}>{msg.content}</Text>
          ) : null}
        </View>
      );
    }
    const parts = msg.content.split(/(```html[\s\S]*?```)/g);
    return (
      <View style={{ gap: 8 }}>
        {parts.map((part, i) => {
          if (part.startsWith('```html')) {
            const code = part.replace(/^```html\s*/, '').replace(/\s*```$/, '').trim();
            const lineCount = code.split('\n').length;
            return (
              <View key={i} style={{ backgroundColor: '#0D1117', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(155,142,196,0.35)' }}>
                {/* 代码头部 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#161B22', gap: 8 }}>
                  <Code2 size={14} color="#9B8EC4" />
                  <Text style={{ color: '#9B8EC4', fontSize: 12, fontWeight: '600', flex: 1 }}>HTML 应用 — {lineCount} 行</Text>
                  <Pressable onPress={() => onCopy(code)} style={{ padding: 4 }}><Copy size={13} color="#6B7280" /></Pressable>
                </View>
                {/* 代码预览 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 72 }}>
                  <Text style={{ color: '#7DD3FC', fontFamily: 'monospace', fontSize: 11, padding: 10, lineHeight: 17 }}>
                    {code.split('\n').slice(0, 5).join('\n')}{lineCount > 5 ? '\n…' : ''}
                  </Text>
                </ScrollView>
                {/* 操作按钮行：运行预览（主按钮flex）+ 版本 + 分享（等宽辅助按钮） */}
                <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: 'rgba(155,142,196,0.18)' }}>
                  {/* 运行预览 — 主按钮，flex:1 撑满剩余空间 */}
                  <Pressable onPress={() => onPreview(code)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#9B8EC4', borderRadius: 8, paddingVertical: 10 }}>
                    <Play size={14} color="#fff" fill="#fff" />
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>运行预览</Text>
                  </Pressable>
                  {/* 版本 — 等宽辅助按钮 */}
                  <Pressable onPress={onShowVersions} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(232,163,101,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <GitBranch size={13} color="#E8A365" />
                    <Text style={{ color: '#E8A365', fontSize: 13 }}>版本</Text>
                  </Pressable>
                  {/* 分享 — 等宽辅助按钮 */}
                  <Pressable onPress={() => onShare(code)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(74,144,196,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Share2 size={13} color="#4A90C4" />
                    <Text style={{ color: '#4A90C4', fontSize: 13 }}>分享</Text>
                  </Pressable>
                </View>
              </View>
            );
          }
          const trimmed = part.trim();
          if (!trimmed) return null;
          return <Text key={i} style={{ color: '#E0D9FF', fontSize: 14, lineHeight: 22 }}>{trimmed}</Text>;
        })}
      </View>
    );
  };

  return (
    <View style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '90%', marginBottom: 14 }}>
      {!isUser && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#9B8EC4', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={13} color="#fff" />
          </View>
          <Text style={{ color: '#6B7280', fontSize: 11 }}>AI编程智能体</Text>
        </View>
      )}
      <View style={{ backgroundColor: isUser ? '#7C6FB0' : '#1E1E30', borderRadius: 16, borderBottomRightRadius: isUser ? 4 : 16, borderBottomLeftRadius: isUser ? 16 : 4, padding: 12, borderWidth: isUser ? 0 : 1, borderColor: 'rgba(155,142,196,0.2)' }}>
        {renderContent()}
        {/* 用户消息：底部复制按钮 */}
        {isUser && (
          <Pressable
            onPress={() => onCopyText(msg.content)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' }}
            hitSlop={6}
          >
            <Copy size={11} color="rgba(255,255,255,0.7)" />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>复制</Text>
          </Pressable>
        )}
      </View>
      <Text style={{ color: '#374151', fontSize: 10, marginTop: 3, alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
        {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

// ── 模型选择器 ────────────────────────────────────────────────────
function ModelPicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const model = MODELS.find(m => m.id === selected) ?? MODELS[0];
  return (
    <View style={{ zIndex: 200 }}>
      <Pressable onPress={() => setOpen(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(155,142,196,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(155,142,196,0.3)' }}>
        <Text style={{ fontSize: 13 }}>{model.emoji}</Text>
        <Text style={{ color: '#E0D9FF', fontSize: 12, fontWeight: '600' }}>{model.label}</Text>
        <ChevronDown size={11} color="#9B8EC4" />
      </Pressable>
      {open && (
        <View style={{ position: 'absolute', top: 40, left: 0, zIndex: 300, backgroundColor: '#1A1A2E', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(155,142,196,0.3)', minWidth: 220 }}>
          {MODELS.map((m, idx) => (
            <Pressable key={m.id} onPress={() => { onSelect(m.id); setOpen(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: selected === m.id ? 'rgba(155,142,196,0.18)' : 'transparent', borderBottomWidth: idx < MODELS.length - 1 ? 1 : 0, borderBottomColor: 'rgba(155,142,196,0.08)' }}>
              <Text style={{ fontSize: 17 }}>{m.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: selected === m.id ? '#C4B5FD' : '#E0D9FF', fontSize: 13, fontWeight: '600' }}>{m.label}</Text>
                <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 1 }}>{m.desc}</Text>
              </View>
              {selected === m.id && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#9B8EC4' }} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── 版本记录抽屉 ──────────────────────────────────────────────────
function VersionDrawer({ visible, versions, onPreview, onRestore, onClose }: {
  visible: boolean;
  versions: HtmlVersion[];
  onPreview: (html: string) => void;
  onRestore: (v: HtmlVersion) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose}>
        <View style={{ flex: 1 }} />
        <View
          style={{ backgroundColor: '#12121F', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '72%', paddingBottom: 32 }}
          onStartShouldSetResponder={() => true}
        >
          {/* 拖拽条 */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(155,142,196,0.3)' }} />
          </View>
          {/* 标题行 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(155,142,196,0.1)' }}>
            <GitBranch size={16} color="#9B8EC4" />
            <Text style={{ color: '#E0D9FF', fontSize: 16, fontWeight: '700', marginLeft: 8, flex: 1 }}>版本记录</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginRight: 12 }}>{versions.length} 个版本</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}><X size={18} color="#6B7280" /></Pressable>
          </View>
          {versions.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 32 }}>📭</Text>
              <Text style={{ color: '#4B5563', fontSize: 14, marginTop: 12 }}>还没有版本记录</Text>
              <Text style={{ color: '#374151', fontSize: 12, marginTop: 4 }}>每次生成 HTML 代码后会自动保存版本</Text>
            </View>
          ) : (
            <FlatList
              data={[...versions].reverse()} // 最新版本排在最前
              keyExtractor={v => v.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}
              renderItem={({ item: v, index }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(155,142,196,0.12)', gap: 12 }}>
                  {/* 版本标签 */}
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: index === 0 ? '#9B8EC4' : 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Text style={{ color: index === 0 ? '#fff' : '#9B8EC4', fontSize: 12, fontWeight: '700' }}>{v.label}</Text>
                  </View>
                  {/* 版本信息 */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#E0D9FF', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{v.prompt}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Clock size={10} color="#6B7280" />
                      <Text style={{ color: '#6B7280', fontSize: 11 }}>{formatDate(v.createdAt)}</Text>
                      {index === 0 && (
                        <View style={{ backgroundColor: 'rgba(155,142,196,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4 }}>
                          <Text style={{ color: '#C4B5FD', fontSize: 10, fontWeight: '700' }}>最新</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {/* 操作按钮 */}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable onPress={() => { onClose(); onPreview(v.html); }} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(74,144,196,0.15)', alignItems: 'center', justifyContent: 'center' }} hitSlop={6}>
                      <Play size={13} color="#4A90C4" />
                    </Pressable>
                    <Pressable onPress={() => { onRestore(v); onClose(); }} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(155,142,196,0.15)', alignItems: 'center', justifyContent: 'center' }} hitSlop={6}>
                      <RotateCcw size={13} color="#9B8EC4" />
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

// ── 历史会话抽屉 ──────────────────────────────────────────────────
function HistoryDrawer({ visible, sessions, currentId, onSelect, onDelete, onClose }: {
  visible: boolean;
  sessions: Session[];
  currentId: string;
  onSelect: (s: Session) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose}>
        <View style={{ flex: 1 }} />
        <View
          style={{ backgroundColor: '#12121F', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '78%', paddingBottom: 32 }}
          onStartShouldSetResponder={() => true}
        >
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(155,142,196,0.3)' }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(155,142,196,0.1)' }}>
            <History size={16} color="#9B8EC4" />
            <Text style={{ color: '#E0D9FF', fontSize: 16, fontWeight: '700', marginLeft: 8, flex: 1 }}>历史对话</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginRight: 12 }}>{sessions.length} 条记录</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}><X size={18} color="#6B7280" /></Pressable>
          </View>
          {sessions.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 32 }}>💬</Text>
              <Text style={{ color: '#4B5563', fontSize: 14, marginTop: 12 }}>还没有历史对话</Text>
            </View>
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={s => s.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
              renderItem={({ item: s }) => {
                const isCurrent = s.id === currentId;
                const hasHtml = s.messages.some(m => m.hasCode);
                const userCount = s.messages.filter(m => m.role === 'user').length;
                return (
                  <Pressable
                    onPress={() => { onSelect(s); onClose(); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, marginBottom: 6, borderRadius: 14, backgroundColor: isCurrent ? 'rgba(155,142,196,0.18)' : 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: isCurrent ? 'rgba(155,142,196,0.4)' : 'rgba(255,255,255,0.06)', gap: 12 }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isCurrent ? '#9B8EC4' : 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{hasHtml ? '🖥️' : '💬'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: isCurrent ? '#C4B5FD' : '#E0D9FF', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{s.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={{ color: '#6B7280', fontSize: 11 }}>{formatDate(s.createdAt)}</Text>
                        <Text style={{ color: '#374151', fontSize: 11 }}>·</Text>
                        <Text style={{ color: '#6B7280', fontSize: 11 }}>{userCount} 条消息</Text>
                        {isCurrent && <Text style={{ color: '#9B8EC4', fontSize: 11, fontWeight: '600' }}>当前</Text>}
                      </View>
                    </View>
                    {!isCurrent && (
                      <Pressable onPress={() => onDelete(s.id)} style={{ padding: 6 }} hitSlop={8}>
                        <Trash2 size={14} color="#4B5563" />
                      </Pressable>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function AiWorkbench() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [messages, setMessages] = useState<Message[]>([makeWelcomeMsg()]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('deepseek-v4-flash');
  const [toast, setToast] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  // 支持多模态（图片识别）的模型
  const VISION_MODELS = ['kimi-k3'];

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // ── 本地上传图片（相册 / 相机）──
  const pickImage = useCallback(async (useCamera: boolean) => {
    try {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast('⚠️ 需要相册/相机权限才能上传图片');
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const uri = `data:${result.assets[0].mimeType ?? 'image/jpeg'};base64,${result.assets[0].base64}`;
      setPendingImages(prev => [...prev, uri]);
      // 当前模型不支持图片识别时，自动切换到 Kimi-K3
      if (!VISION_MODELS.includes(selectedModel)) {
        setSelectedModel('kimi-k3');
        showToast('🌙 已切换到 Kimi-K3 以支持图片识别');
      }
    } catch {
      showToast('⚠️ 图片选择失败，请重试');
    }
  }, [showToast, selectedModel]);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── 持久化 ──
  const persistSessions = useCallback((list: Session[]) => {
    AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(list)).catch(() => {});
  }, []);

  // ── 当前会话版本列表 ──
  const currentVersions = sessions.find(s => s.id === currentSessionId)?.versions ?? [];

  // ── 保存 HTML 版本快照 ──
  const saveVersion = useCallback((html: string, prompt: string) => {
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id !== currentSessionId) return s;
        const existing = s.versions ?? [];
        const nextNum = existing.length + 1;
        const newVer: HtmlVersion = {
          id: `${s.id}_v${nextNum}_${Date.now()}`,
          label: `v${nextNum}`,
          prompt: prompt.slice(0, 30) + (prompt.length > 30 ? '…' : ''),
          html,
          createdAt: new Date().toISOString(),
        };
        return { ...s, versions: [...existing, newVer].slice(-MAX_VERSIONS) };
      });
      persistSessions(updated);
      return updated;
    });
  }, [currentSessionId, persistSessions]);

  // ── 从版本恢复：将版本 HTML 注入到一条新消息中 ──
  const handleRestoreVersion = useCallback((v: HtmlVersion) => {
    const restoreMsg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `已恢复 ${v.label}（${v.prompt}）\n\`\`\`html\n${v.html}\n\`\`\``,
      timestamp: new Date().toISOString(),
      hasCode: true,
    };
    setMessages(prev => {
      const updated = [...prev, restoreMsg];
      setSessions(sList => {
        const upd = sList.map(s => s.id === currentSessionId ? { ...s, messages: updated } : s);
        persistSessions(upd);
        return upd;
      });
      return updated;
    });
    showToast(`✓ 已恢复 ${v.label}`);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }, [currentSessionId, persistSessions, showToast]);

  // ── 初始化新会话 ──
  const initNewSession = useCallback((existing: Session[]) => {
    const id = Date.now().toString();
    const welcome = makeWelcomeMsg();
    const newSession: Session = { id, title: '新对话', createdAt: new Date().toISOString(), messages: [welcome] };
    const list = [newSession, ...existing].slice(0, MAX_SESSIONS);
    setSessions(list);
    setCurrentSessionId(id);
    setMessages([welcome]);
    persistSessions(list);
    return id;
  }, [persistSessions]);

  // ── 启动时加载 ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSIONS_KEY);
        if (raw) {
          const saved: Session[] = JSON.parse(raw);
          if (saved.length > 0) {
            setSessions(saved);
            setCurrentSessionId(saved[0].id);
            setMessages(saved[0].messages);
            setHistoryLoaded(true);
            return;
          }
        }
      } catch { /* 忽略 */ }
      initNewSession([]);
      setHistoryLoaded(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setInput('');
    setLoading(false);
    initNewSession(sessions);
  }, [sessions, initNewSession]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  const switchSession = useCallback((s: Session) => {
    abortRef.current?.abort();
    setLoading(false);
    setCurrentSessionId(s.id);
    setMessages(s.messages);
    setInput('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      persistSessions(updated);
      return updated;
    });
  }, [persistSessions]);

  const goPreview = useCallback((html: string) => {
    previewHtmlStore = html;
    router.push('/(app)/ai-preview' as RelativePathString);
  }, [router]);

  const handleCopyCode = useCallback(async (code: string) => {
    await Clipboard.setStringAsync(code);
    showToast('✓ 已复制到剪贴板');
  }, [showToast]);

  const handleCopyText = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    showToast('✓ 提示词已复制');
  }, [showToast]);

  const handleShare = useCallback((code: string) => {
    setShareCode(code);
  }, []);

  // ── SSE 流式发送 ──
  const sendMessage = useCallback(async (text?: string, images?: string[]) => {
    const content = (text ?? input).trim();
    const imgs = images ?? pendingImages;
    // 无文字且无图片时不发送
    if ((!content && imgs.length === 0) || loading) return;
    setInput('');
    setPendingImages([]);
    setLoading(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content || (imgs.length > 0 ? '（上传了图片）' : ''),
      timestamp: new Date().toISOString(),
      ...(imgs.length > 0 ? { images: imgs } : {}),
    };
    const updatedWithUser = [...messages, userMsg];
    setMessages(updatedWithUser);

    setSessions(prev => {
      const updated = prev.map(s =>
        s.id === currentSessionId
          ? { ...s, title: (content || '图片对话').slice(0, 22) + ((content || '图片对话').length > 22 ? '…' : ''), messages: updatedWithUser }
          : s
      );
      persistSessions(updated);
      return updated;
    });

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    // 上下文保留最近200条（对应100万token量级）
    // 支持多模态：含图片的用户消息转为 OpenAI content 数组格式
    const toApiContent = (m: Message): string | Array<{ type: string; text?: string; image_url?: { url: string } }> => {
      if (m.images && m.images.length > 0) {
        return [
          { type: 'text', text: m.content },
          ...m.images.map(uri => ({ type: 'image_url', image_url: { url: uri } })),
        ];
      }
      return m.content;
    };
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...updatedWithUser.filter(m => m.id !== 'welcome').slice(-200).map(m => ({
        role: m.role,
        content: toApiContent(m),
      })),
    ] as Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-workbench-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      if (!response.body) throw new Error('无响应体');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      // ── 性能优化：节流批量更新，避免每个 token 触发重渲染 ──
      let thinkingAccumulated = '';
      let thinkingStartMs = 0;          // 推理开始时间戳
      let thinkingDoneSeconds: number | undefined; // 思考用时（流结束后写入）
      let thinkingTimerId: ReturnType<typeof setTimeout> | null = null;
      let contentTimerId: ReturnType<typeof setTimeout> | null = null;
      let scrollTimerId: ReturnType<typeof setTimeout> | null = null;
      let contentPhaseStarted = false; // 追踪是否已进入正式回答阶段

      const flushThinking = () => {
        const snap = thinkingAccumulated;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, isThinking: true, thinkingText: snap } : m
        ));
        thinkingTimerId = null;
      };

      const flushContent = () => {
        const snap = accumulated;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: snap, isThinking: false } : m
        ));
        contentTimerId = null;
      };

      const scheduleScroll = () => {
        if (scrollTimerId) return;
        scrollTimerId = setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: false });
          scrollTimerId = null;
        }, 120);
      };

      const parser = createParser({
        onEvent: (event) => {
          if (!event.data || event.data === '[DONE]') return;
          try {
            const parsed = JSON.parse(event.data);
            const delta = parsed.choices?.[0]?.delta ?? {};
            const reasoningChunk: string = delta.reasoning_content ?? '';
            const contentChunk: string = delta.content ?? '';

            if (contentChunk) {
              // 正式内容阶段：每 50ms 批量刷新，减少重渲染频率
              if (!contentPhaseStarted && thinkingStartMs > 0) {
                // 推理结束：记录用时（四舍五入到整秒）
                thinkingDoneSeconds = Math.round((Date.now() - thinkingStartMs) / 1000);
              }
              accumulated += contentChunk;
              contentPhaseStarted = true;
              if (!contentTimerId) {
                contentTimerId = setTimeout(flushContent, 50);
              }
              scheduleScroll();
            } else if (reasoningChunk && !contentPhaseStarted) {
              // 推理阶段：每 300ms 批量刷新（推理 token 非常密集）
              // 不限制长度 — Pro 模型深度推理可能产生大量思考内容，全部保留
              thinkingAccumulated += reasoningChunk;
              if (thinkingStartMs === 0) thinkingStartMs = Date.now();
              if (!thinkingTimerId) {
                thinkingTimerId = setTimeout(flushThinking, 300);
              }
            }
          } catch { /* 跳过无法解析的帧 */ }
        },
      });

      const read = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) return;
        parser.feed(decoder.decode(value, { stream: true }));
        return read();
      };
      await read();

      // 流结束：清除残余定时器，做最终刷新
      if (thinkingTimerId) { clearTimeout(thinkingTimerId); flushThinking(); }
      if (contentTimerId) { clearTimeout(contentTimerId); }
      if (scrollTimerId) { clearTimeout(scrollTimerId); }

      // extractHtmlCode 移出热路径，仅在流结束时执行一次
      const hasCode = !!(extractHtmlCode(accumulated));
      const finalThinking = thinkingAccumulated;
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: accumulated, isThinking: false, thinkingText: finalThinking || m.thinkingText, hasCode, thinkingSeconds: thinkingDoneSeconds }
          : m
      ));

    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const errContent = `⚠️ 请求失败：${e instanceof Error ? e.message : '网络异常，请重试'}`;
      accumulated = errContent;
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: errContent } : m));
    } finally {
      setLoading(false);
      setMessages(prev => {
        setSessions(sList => {
          const updated = sList.map(s => s.id === currentSessionId ? { ...s, messages: prev } : s);
          persistSessions(updated);
          return updated;
        });
        // 生成完成后，若内容包含 HTML 代码则自动保存版本快照
        const finalContent = prev.find(m => m.id === assistantId)?.content ?? '';
        const htmlCode = extractHtmlCode(finalContent);
        if (htmlCode) {
          saveVersion(htmlCode, content);
        }
        return prev;
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [input, loading, messages, selectedModel, currentSessionId, persistSessions, saveVersion]);

  if (!historyLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F0F1A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#9B8EC4" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0F0F1A' }}>
      <StatusBar style="light" />

      <HistoryDrawer
        visible={historyOpen}
        sessions={sessions}
        currentId={currentSessionId}
        onSelect={switchSession}
        onDelete={deleteSession}
        onClose={() => setHistoryOpen(false)}
      />

      <VersionDrawer
        visible={versionOpen}
        versions={currentVersions}
        onPreview={goPreview}
        onRestore={handleRestoreVersion}
        onClose={() => setVersionOpen(false)}
      />

      <ShareSheet
        visible={shareCode !== null}
        htmlCode={shareCode ?? ''}
        onClose={() => setShareCode(null)}
        onToast={showToast}
      />

      {/* 顶部导航 */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#0F0F1A' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(155,142,196,0.15)', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={18} color="#9B8EC4" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#E0D9FF', fontWeight: '700', fontSize: 15 }}>AI编程工作台</Text>
            <Text style={{ color: '#4B5563', fontSize: 11, marginTop: 1 }}>心理健康应用开发助手</Text>
          </View>
          <Pressable onPress={() => setVersionOpen(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(232,163,101,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <GitBranch size={17} color="#E8A365" />
          </Pressable>
          <Pressable onPress={() => setHistoryOpen(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <History size={17} color="#9B8EC4" />
          </Pressable>
          <Pressable onPress={newChat} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <SquarePen size={17} color="#9B8EC4" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* 模型选择栏 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(155,142,196,0.08)', gap: 8, zIndex: 200 }}>
        <Bot size={13} color="#4B5563" />
        <Text style={{ color: '#4B5563', fontSize: 12 }}>模型：</Text>
        <ModelPicker selected={selectedModel} onSelect={setSelectedModel} />
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(29,185,84,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#1DB954' }} />
          <Text style={{ color: '#1DB954', fontSize: 11 }}>在线</Text>
        </View>
      </View>

      {/* 消息列表 */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 12 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} onPreview={goPreview} onCopy={handleCopyCode} onShare={handleShare} onShowVersions={() => setVersionOpen(true)} onCopyText={handleCopyText} />
        ))}
        {loading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#9B8EC4', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={13} color="#fff" />
            </View>
            <View style={{ backgroundColor: '#1E1E30', borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color="#9B8EC4" />
              <Text style={{ color: '#9B8EC4', fontSize: 13 }}>正在生成…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 快速提示词 */}
      {messages.length <= 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }} style={{ borderTopWidth: 1, borderTopColor: 'rgba(155,142,196,0.08)', maxHeight: 48 }}>
          {QUICK_PROMPTS.map(q => (
            <Pressable key={q.label} onPress={() => sendMessage(q.prompt)} style={{ backgroundColor: 'rgba(155,142,196,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(155,142,196,0.2)' }}>
              <Text style={{ color: '#C4B5FD', fontSize: 13 }}>✦ {q.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* 输入框 */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#0F0F1A', borderTopWidth: 1, borderTopColor: 'rgba(155,142,196,0.12)' }}>
        {/* Toast 提示 */}
        {toast !== '' && (
          <View style={{ position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: 'rgba(155,142,196,0.92)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 }}>
            <Text style={{ color: '#fff', fontSize: 13 }}>{toast}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {/* 待发送图片缩略图 */}
          {pendingImages.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              {pendingImages.map((uri, i) => (
                <View key={`${i}-${uri.slice(0, 20)}`} style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(155,142,196,0.3)' }}>
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <Pressable
                    onPress={() => removePendingImage(i)}
                    style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={11} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {/* + 上传图片按钮 */}
          <Pressable
            onPress={() => pickImage(false)}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: 'rgba(155,142,196,0.3)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={20} color="#C4B5FD" />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="描述你想要的功能，或提问…"
            placeholderTextColor="#374151"
            multiline
            style={{ flex: 1, color: '#E0D9FF', fontSize: 14, lineHeight: 20, backgroundColor: '#1A1A2E', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120, borderWidth: 1, borderColor: 'rgba(155,142,196,0.2)' }}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          {/* 停止按钮（生成中显示） */}
          {loading ? (
            <Pressable
              onPress={stopGeneration}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E53E3E', alignItems: 'center', justifyContent: 'center' }}
            >
              <Square size={16} color="#fff" fill="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => sendMessage()}
              disabled={!input.trim() && pendingImages.length === 0}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: (input.trim() || pendingImages.length > 0) ? '#9B8EC4' : 'rgba(155,142,196,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={18} color={(input.trim() || pendingImages.length > 0) ? '#fff' : '#374151'} />
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
