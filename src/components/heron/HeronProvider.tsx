import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { HeronMessage, HeronSession, HeronAttachment, PetState, HeronStep } from '@/types/types';
import { useSession } from '@/ctx';
import { useCrisis } from '@/components/CrisisProvider';
import { HeronAgent, type AgentEvent } from '@/lib/heron/agent';
import { MODELS, evaluateDifficulty, routeModel, MODEL_ROUTES } from '@/lib/heron/models';
import {
  getHeronSessions, createHeronSession, updateHeronSession,
  getHeronScheduledTasks, updateHeronScheduledTask, addHeronAuditLog,
} from '@/db/api';
import { saveMemory } from '@/lib/heron/memory';
import { streamAiChat } from '@/lib/aiStream';
import { DraggableFloat } from './DraggableFloat';
import { HeronPanel } from './HeronPanel';
import { useSubscription } from '@/hooks/useSubscription';
import UpgradeModal from '@/components/UpgradeModal';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

interface HeronContextType {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const HeronContext = createContext<HeronContextType>({ open: () => {}, close: () => {}, isOpen: false });
export const useHeron = () => useContext(HeronContext);

function nowIso(): string {
  return new Date().toISOString();
}

export function HeronProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { showCrisisPanel } = useCrisis();
  const { level: subLevel } = useSubscription();
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<HeronMessage[]>([]);
  const [petState, setPetState] = useState<PetState>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<HeronAttachment[]>([]);
  const [modelIndex, setModelIndex] = useState(0); // 默认自动路由
  const [skill, setSkill] = useState<string | null>(null);

  // 悬浮球显示控制：默认关闭，避免首次进入时遮挡主界面
  const [floatVisible, setFloatVisible] = useState(false);
  // 历史对话
  const [sessions, setSessions] = useState<HeronSession[]>([]);

  // ReAct 推理链：流式过程中实时累积，随消息落地后清空
  const [streamingSteps, setStreamingSteps] = useState<HeronStep[]>([]);

  const sessionIdRef = useRef<string | null>(null);
  const agentRef = useRef<HeronAgent | null>(null);
  const messagesRef = useRef<HeronMessage[]>([]);
  messagesRef.current = messages;
  // 用 ref 追踪正在流出的文本，方便 stopAgent 把它提交为中断消息
  const streamingTextRef = useRef('');

  const persistSession = useCallback(async (userId: string, msgs: HeronMessage[]) => {
    if (!userId || msgs.length === 0) return;
    const title = msgs.find((m) => m.role === 'user')?.content.slice(0, 20) || '新对话';
    try {
      if (sessionIdRef.current) {
        await updateHeronSession(sessionIdRef.current, title, msgs);
      } else {
        const row = await createHeronSession(userId, title, msgs);
        if (row) sessionIdRef.current = row.id;
      }
    } catch { /* ignore persistence errors */ }
  }, []);

  const handleEvent = useCallback((e: AgentEvent) => {
    if (e.type === 'state' && e.state) setPetState(e.state);
    else if (e.type === 'step-log' && e.steps) {
      // 实时更新推理链（完整列表）
      setStreamingSteps([...e.steps]);
    } else if (e.type === 'assistant-token' && e.token) {
      streamingTextRef.current += e.token;
      setStreamingText((prev) => prev + e.token);
    } else if (e.type === 'assistant-message' && e.message) {
      streamingTextRef.current = '';
      setStreamingText('');
      setStreamingSteps([]); // 消息落地，清空流式步骤
      setMessages((prev) => [...prev, e.message as HeronMessage]);
      setBusy(false);
      setPetState('idle');
    } else if (e.type === 'error' && e.error) {
      streamingTextRef.current = '';
      setStreamingText('');
      setStreamingSteps([]);
      setBusy(false);
      setPetState('idle');
    }
  }, []);

  // 初始化 Agent
  useEffect(() => {
    if (!session?.user?.id) return;
    agentRef.current = new HeronAgent({
      userId: session.user.id,
      onEvent: handleEvent,
      onCrisis: () => showCrisisPanel(),
    });
  }, [session?.user?.id, handleEvent, showCrisisPanel]);

  // 恢复最近会话
  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const list = await getHeronSessions(session.user.id);
      if (list.length && list[0].messages?.length) {
        sessionIdRef.current = list[0].id;
        setMessages(list[0].messages);
      }
    })();
  }, [session?.user?.id]);

  // 定时任务轻量对账（挂载时检查到期任务）
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const tasks = await getHeronScheduledTasks(session.user.id);
      const now = Date.now();
      for (const t of tasks) {
        if (!t.enabled) continue;
        if (new Date(t.next_run_at).getTime() > now) continue;
        if (cancelled) return;
        setHasUnread(true);
        await updateHeronScheduledTask(t.id, { last_run_at: nowIso(), next_run_at: nextRunIso(t.cron) });
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const send = useCallback(async () => {
    if (!session?.user?.id || busy) return;
    const text = value.trim();
    if (!text && attachments.length === 0) return;

    // 在新消息加入前捕获历史，供规划阶段理解上下文意图（最近 6 轮）
    const recentHistory = messagesRef.current
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const userMsg: HeronMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: nowIso(),
      attachments: attachments.length ? attachments : undefined,
    };
    const next = [...messagesRef.current, userMsg];
    setMessages(next);
    setValue('');
    setAttachments([]);
    setSkill(null); // fix3: 发送后立即清除技能标签，不残留也不重复发送
    setBusy(true);
    setStreamingText('');
    setPetState('thinking');
    setHasUnread(false);
    setStreamingSteps([]); // 每次新发送清空上次的推理链

    // 校验每日 AI 额度（每次对话消耗 5 点积分）
    const quotaCheck = await checkAndConsumeCredits(5);
    if (!quotaCheck.allowed) {
      setMessages((prev) => [
        ...prev,
        {
          id: `quota_${Date.now()}`,
          role: 'assistant',
          content: quotaCheck.message || '今日 AI 积分额度不足（单次对话消耗5点），每日 24:00 自动重置。升级心愈版（50点/日）或工作台版（100点/日）享更多额度。',
          timestamp: nowIso(),
        },
      ]);
      return;
    }

    // auto 模式：根据消息内容 + 技能 + 附件智能路由到最合适的模型
    const selectedEntry = MODELS[modelIndex % MODELS.length];
    const resolvedModelId = selectedEntry.id === 'auto'
      ? routeModel(evaluateDifficulty(text, skill, attachments))
      : selectedEntry.id;

    await addHeronAuditLog(session.user.id, 'user_message', { text: text.slice(0, 100), skill, model: resolvedModelId });

    try {
      await agentRef.current?.run({
        text,
        attachments,
        model: resolvedModelId,
        skill: skill ?? undefined,
        history: recentHistory,
      });
    } catch (err) {
      setBusy(false);
      setPetState('idle');
      setMessages((prev) => [...prev, {
        id: `e_${Date.now()}`,
        role: 'assistant',
        content: '哎呀，刚才出了点小状况，能再说一遍吗？',
        timestamp: nowIso(),
      }]);
      void err;
    }

    // 持久化（在最终消息落定后）
    setTimeout(() => persistSession(session.user.id, messagesRef.current), 200);
  }, [session?.user?.id, busy, value, attachments, skill, modelIndex, persistSession]);

  const open = useCallback(() => {
    if (subLevel < 2) {
      setUpgradeVisible(true);
      return;
    }
    setIsOpen(true);
    setHasUnread(false);
  }, [subLevel]);
  const close = useCallback(() => setIsOpen(false), []);

  /** 切换悬浮球显示/隐藏 */
  const toggleFloat = useCallback(() => setFloatVisible((v) => !v), []);

  /** 新建对话：生成历史摘要 → 存入记忆 → 清空消息 */
  const newChat = useCallback(() => {
    if (busy) return;
    const userId = session?.user?.id;
    const snap = messagesRef.current;

    // 有效对话：至少 2 条消息（用户 + AI 各至少 1 条）才生成摘要
    const hasContent =
      snap.filter((m) => m.role === 'user').length >= 1 &&
      snap.filter((m) => m.role === 'assistant' && m.content).length >= 1;

    if (userId && hasContent) {
      // 拼出对话文本（截取前 2000 字防超限）
      const dialog = snap
        .filter((m) => m.content)
        .map((m) => `${m.role === 'user' ? '用户' : '苍鹭'}：${m.content}`)
        .join('\n')
        .slice(0, 2000);

      // 异步生成摘要并存入 summary 分类，不阻塞 UI
      (async () => {
        try {
          const summary = await streamAiChat({
            model: MODEL_ROUTES.lightweight.primary,
            messages: [
              {
                role: 'system',
                content:
                  '你是一个对话摘要助手。请用1-2句话（不超过80字）简洁概括以下对话的核心内容，重点提炼用户的关键诉求或重要信息，输出纯文本不加标题。',
              },
              { role: 'user', content: dialog },
            ],
          });
          if (summary.trim()) {
            await saveMemory(userId, summary.trim(), 'summary');
          }
        } catch {
          // 摘要生成失败静默处理，不影响新建对话
        }
      })();
    }

    // 立即清空 UI 状态
    sessionIdRef.current = null;
    setMessages([]);
    setStreamingText('');
    setStreamingSteps([]);
    setPetState('idle');
    setValue('');
    setAttachments([]);
    setSkill(null);
  }, [busy, session?.user?.id]);

  /** 加载历史会话列表 */
  const loadSessions = useCallback(async () => {
    if (!session?.user?.id) return;
    const list = await getHeronSessions(session.user.id);
    setSessions(list);
  }, [session?.user?.id]);

  /** 切换到某条历史对话 */
  const loadSession = useCallback((s: HeronSession) => {
    if (busy) return;
    sessionIdRef.current = s.id;
    setMessages(s.messages ?? []);
    setStreamingText('');
    setPetState('idle');
  }, [busy]);

  /** 中断 agent 正在进行的流式回答，把已流出的片段提交为消息 */
  const stopAgent = useCallback(() => {
    agentRef.current?.stop();
    const partial = streamingTextRef.current.trim();
    streamingTextRef.current = '';
    setStreamingText('');
    setBusy(false);
    setPetState('idle');
    if (partial) {
      setMessages((prev) => [...prev, {
        id: `m_stop_${Date.now()}`,
        role: 'assistant',
        content: partial + '…（已中断）',
        timestamp: nowIso(),
      }]);
    }
  }, []);

  return (
    <HeronContext.Provider value={{ open, close, isOpen }}>
      {children}
      <View pointerEvents="box-none" className="absolute inset-0">
        {floatVisible && <DraggableFloat active={isOpen} hasUnread={hasUnread} onOpen={open} />}
      </View>
      <HeronPanel
        visible={isOpen}
        onClose={close}
        messages={messages}
        streamingText={streamingText}
        streaming={busy}
        petState={petState}
        streamingSteps={streamingSteps}
        value={value}
        onChangeText={setValue}
        onSend={send}
        onStop={stopAgent}
        attachments={attachments}
        onAddAttachments={(items) => setAttachments((prev) => [...prev, ...items])}
        onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
        modelIndex={modelIndex}
        onCycleModel={() => setModelIndex((i) => (i + 1) % MODELS.length)}
        skill={skill}
        onPickSkill={setSkill}
        busy={busy}
        floatVisible={floatVisible}
        onToggleFloat={toggleFloat}
        onNewChat={newChat}
        sessions={sessions}
        onLoadSessions={loadSessions}
        onLoadSession={loadSession}
      />
      <UpgradeModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        requiredLevel={2}
        featureName="🦢 苍鹭医生 AI 智能体"
        featureDesc="苍鹭医生是全能备课与心愈陪伴智能体，需要 AI工作台版权限或通过兑换码激活。"
      />
    </HeronContext.Provider>
  );
}

function nextRunIso(cron: string): string {
  const d = new Date();
  const m = cron.match(/(\d+)\s*([hH])/);
  if (m) d.setHours(d.getHours() + Number(m[1]));
  else if (/daily|每天|每日/i.test(cron)) d.setDate(d.getDate() + 1);
  else d.setHours(d.getHours() + 24);
  return d.toISOString();
}