import { useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { User, ChevronDown } from 'lucide-react-native';
import type { HeronMessage, HeronTask, PetState, HeronStep } from '@/types/types';
import { ResultCard } from './ResultCard';

interface Props {
  messages: HeronMessage[];
  streamingText: string;
  streaming: boolean;
  petState: PetState;
  streamingSteps: HeronStep[]; // 实时推理链节点
  stageTopOffset?: number; // FlatList 顶部留白，避免被舞台卡片遮挡
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatMessageList({ messages, streamingText, streaming, petState, streamingSteps, stageTopOffset = 0 }: Props) {
  const data = messages.map((m, i) => ({ ...m, key: `${m.id}-${i}` }));

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.key}
      contentContainerStyle={{ paddingTop: stageTopOffset + 8, paddingHorizontal: 16, paddingBottom: 180 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View className="mt-10 items-center px-6">
          <Text className="text-center text-sm leading-6 text-muted-foreground">
            你好呀，我是苍鹭医生 🩺{'\n'}有什么心事、想法，或者想让我帮你记录、画画、查资料，都可以告诉我～
          </Text>
        </View>
      }
      renderItem={({ item }) => <MessageBubble message={item} />}
      ListFooterComponent={streaming ? <StreamingBubble text={streamingText} petState={petState} steps={streamingSteps} /> : null}
    />
  );
}

/** 用户气泡 — 显式橙色卡片，不依赖 CSS 变量 */
const USER_BUBBLE_STYLE = {
  backgroundColor: '#E88D67',
  borderRadius: 18,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderCurve: 'continuous' as const,
  shadowColor: '#E88D67',
  shadowOpacity: 0.28,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
} as const;

/** 苍鹭气泡 — 奶白卡片，绿色边框 */
const BOT_BUBBLE_STYLE = {
  backgroundColor: '#F5F0E8',
  borderRadius: 18,
  borderWidth: 1.5,
  borderColor: 'rgba(122,157,140,0.2)',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderCurve: 'continuous' as const,
} as const;

function MessageBubble({ message }: { message: HeronMessage }) {
  const isUser = message.role === 'user';
  const hasSteps = !isUser && message.steps && message.steps.length > 0;

  return (
    <Animated.View entering={FadeInDown.duration(250)} style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <View style={{ marginBottom: 10, maxWidth: '85%' }}>
        <View style={isUser ? USER_BUBBLE_STYLE : BOT_BUBBLE_STYLE}>
          {/* 发言人标签 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            {isUser ? (
              <>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={10} color="#fff" />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>我</Text>
              </>
            ) : (
              <>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7A9D8C' }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#7A9D8C' }}>苍鹭医生</Text>
              </>
            )}
          </View>
          {/* 分割线 */}
          <View style={{ height: 1, backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : 'rgba(122,157,140,0.15)', marginBottom: 6 }} />

          {/* 历史思考过程（每步可独立展开/收起） */}
          {hasSteps ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#7A9D8C', marginBottom: 4 }}>
                🧠 推理过程（{message.steps!.length} 步，点击查看详情）
              </Text>
              <StepTimeline steps={message.steps!} />
            </View>
          ) : null}

          {/* ② 多步任务进度看板 */}
          {message.tasks && message.tasks.length >= 2 ? (
            <TaskBoard tasks={message.tasks} />
          ) : null}

          {/* 正文 */}
          {message.content ? (
            <Text style={{ fontSize: 14, lineHeight: 21, color: isUser ? '#fff' : '#2d3748' }}>
              {message.content}
            </Text>
          ) : null}
          {/* 附件 */}
          {message.attachments && message.attachments.length > 0 ? (
            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {message.attachments.map((a) => (
                <View key={a.id} style={{ borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)', padding: 6 }}>
                  {a.kind === 'image' && a.uri ? (
                    <Image source={{ uri: a.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} contentFit="cover" />
                  ) : (
                    <Text style={{ fontSize: 11, color: '#6b7280', maxWidth: 100 }} numberOfLines={1}>{a.name}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {message.card ? <ResultCard card={message.card} /> : null}
        <Text style={{ marginTop: 4, paddingHorizontal: 4, fontSize: 10, color: '#9ca3af', textAlign: isUser ? 'right' : 'left' }}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── ② 多步任务进度看板 ──────────────────────────────────
function TaskBoard({ tasks }: { tasks: HeronTask[] }) {
  const statusMeta: Record<HeronTask['status'], { icon: string; color: string; bg: string }> = {
    done:    { icon: '✅', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
    failed:  { icon: '❌', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
    running: { icon: '⏳', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
    pending: { icon: '○',  color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' },
  };
  const total = tasks.length;
  const done  = tasks.filter(t => t.status === 'done').length;

  return (
    <View style={{
      marginBottom: 8, borderRadius: 10, borderWidth: 1,
      borderColor: 'rgba(122,157,140,0.2)', overflow: 'hidden',
      backgroundColor: 'rgba(245,240,232,0.6)',
    }}>
      {/* 标题行 */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 10, paddingVertical: 6,
        backgroundColor: 'rgba(122,157,140,0.1)',
        borderBottomWidth: 1, borderBottomColor: 'rgba(122,157,140,0.15)',
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#7A9D8C' }}>📋 任务清单</Text>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>{done}/{total} 已完成</Text>
      </View>
      {/* 任务列表 */}
      {tasks.map((t, i) => {
        const m = statusMeta[t.status];
        return (
          <View key={`tb-${i}`} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 10, paddingVertical: 7,
            backgroundColor: m.bg,
            borderBottomWidth: i < tasks.length - 1 ? 1 : 0,
            borderBottomColor: 'rgba(122,157,140,0.1)',
          }}>
            <Text style={{ fontSize: 13 }}>{m.icon}</Text>
            <Text style={{ fontSize: 12, flex: 1, color: m.color, lineHeight: 17 }}>{t.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── 推理过程：每步可独立展开/收起 ──────────────────────────
function StepTimeline({ steps, live }: { steps: HeronStep[]; live?: boolean }) {
  return (
    <View style={{ gap: 0 }}>
      {steps.map((step, i) => (
        <StepCard key={step.id ?? i} step={step} isLast={i === steps.length - 1} live={live} />
      ))}
    </View>
  );
}

function StepDetailRow({ label, value }: { label: string; value: string }) {
  const lines = value.split('\n').filter(l => l.trim().length > 0);
  const isMultiLine = lines.length > 1;

  if (isMultiLine) {
    // 多行值（如调用参数）：label 作标题，每行参数独占一行
    return (
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 10, color: '#7A9D8C', fontWeight: '700' }}>{label}</Text>
        <View style={{ paddingLeft: 8, gap: 2 }}>
          {lines.map((line, i) => (
            <Text key={i} style={{ fontSize: 11, color: '#6b7280', lineHeight: 16 }}>{line}</Text>
          ))}
        </View>
      </View>
    );
  }

  // 单行值：row 布局，label 在左，值在右
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Text style={{ fontSize: 10, color: '#7A9D8C', fontWeight: '700', marginTop: 1 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 11, color: '#6b7280', lineHeight: 16 }}>{value}</Text>
    </View>
  );
}

function StepCard({ step, isLast, live }: { step: HeronStep; isLast: boolean; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const statusIcon = step.status === 'failed' ? '⚠️' : step.status === 'done' ? '✅' : '⏳';
  const isRunning = live && isLast && step.status === 'running';
  const hasDetail = !!(step.detail || step.tool || step.params || step.result || step.durationMs != null);

  return (
    <View>
      <Pressable
        onPress={() => hasDetail && setOpen(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}
      >
        {/* 时间轴圆点 */}
        <View style={{ alignItems: 'center', width: 20 }}>
          <View style={{
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: isRunning ? 'rgba(122,157,140,0.15)' : '#7A9D8C',
            borderWidth: isRunning ? 1.5 : 0, borderColor: '#7A9D8C',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {isRunning
              ? <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#7A9D8C' }} />
              : <Text style={{ fontSize: 9 }}>{statusIcon}</Text>}
          </View>
          {!isLast && (
            <View style={{ width: 1.5, flex: 1, minHeight: 8, backgroundColor: 'rgba(122,157,140,0.25)', marginTop: 2 }} />
          )}
        </View>
        {/* 步骤名称 + 展开箭头 */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
          <Text style={{
            fontSize: 12, lineHeight: 18, flex: 1,
            color: isRunning ? '#2d3748' : '#6b7280',
            fontWeight: isRunning ? '600' : '500',
          }}>
            {step.label}{isRunning ? '…' : ''}
          </Text>
          {hasDetail && (
            <ChevronDown size={13} color="#9ca3af" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
          )}
        </View>
      </Pressable>

      {/* 展开详情：完整思考过程、工具、参数、结果、时长 */}
      {open && hasDetail && (
        <View style={{ marginLeft: 20, paddingLeft: 10, borderLeftWidth: 1.5, borderLeftColor: 'rgba(122,157,140,0.2)', marginBottom: 4, gap: 3 }}>
          {step.detail ? <StepDetailRow label="思考过程" value={step.detail} /> : null}
          {step.tool ? <StepDetailRow label="使用工具" value={step.tool} /> : null}
          {step.params ? <StepDetailRow label="调用参数" value={step.params} /> : null}
          {step.result ? <StepDetailRow label="返回结果" value={step.result} /> : null}
          {step.durationMs != null ? <StepDetailRow label="执行时长" value={`${(step.durationMs / 1000).toFixed(1)} 秒`} /> : null}
        </View>
      )}
    </View>
  );
}

// ─── 流式过程：实时推理链可视化 ──────────────────────────
function StreamingBubble({ text, petState, steps }: { text: string; petState: PetState; steps: HeronStep[] }) {
  // 无任何步骤时降级到状态文案（有步骤时不再显示，避免与卡片重叠）
  const fallbackLabel =
    petState === 'thinking' ? '🔍 思考中…'
    : petState === 'tool-using' ? '🔧 调用工具…'
    : petState === 'working' ? '⚙️ 处理中…'
    : '正在回复…';

  const hasSteps = steps.length > 0;

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={{ alignItems: 'flex-start' }}>
      <View style={{ ...BOT_BUBBLE_STYLE, marginBottom: 10, maxWidth: '92%' }}>
        {/* 发言人 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7A9D8C' }} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#7A9D8C' }}>苍鹭医生</Text>
        </View>
        <View style={{ height: 1, backgroundColor: 'rgba(122,157,140,0.15)', marginBottom: 8 }} />

        {/* 推理链：每步可独立展开/收起 */}
        {hasSteps ? (
          <View style={{ marginBottom: text ? 10 : 0 }}>
            <StepTimeline steps={steps} live />
          </View>
        ) : (
          /* 尚无步骤时显示降级文案 */
          <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: text ? 10 : 0 }}>{fallbackLabel}</Text>
        )}

        {/* 流式正文 */}
        {text ? (
          <Text style={{ fontSize: 14, lineHeight: 21, color: '#2d3748' }}>{text}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}