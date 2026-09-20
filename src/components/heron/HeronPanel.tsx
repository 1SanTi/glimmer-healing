import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, useWindowDimensions } from 'react-native';
import { useRouter, type RelativePathString } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Brain, Eye, EyeOff, PlusCircle, History, ChevronRight } from 'lucide-react-native';
import type { HeronMessage, HeronSession, PetState, HeronAttachment, HeronStep } from '@/types/types';
import { PetStage } from './PetStage';
import { ChatMessageList } from './ChatMessageList';
import { InputHub } from './InputHub';

interface Props {
  visible: boolean;
  onClose: () => void;
  messages: HeronMessage[];
  streamingText: string;
  streaming: boolean;
  petState: PetState;
  streamingSteps: HeronStep[]; // ReAct 推理链节点（实时）
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onStop: () => void;
  attachments: HeronAttachment[];
  onAddAttachments: (items: HeronAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  modelIndex: number;
  onCycleModel: () => void;
  skill: string | null;
  onPickSkill: (name: string | null) => void;
  busy: boolean;
  // 悬浮球开关
  floatVisible: boolean;
  onToggleFloat: () => void;
  // 新建 & 历史对话
  onNewChat: () => void;
  sessions: HeronSession[];
  onLoadSessions: () => void;
  onLoadSession: (s: HeronSession) => void;
}

export function HeronPanel(props: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stageSize = Math.min(82, width * 0.24);
  const [stageCardHeight, setStageCardHeight] = useState(stageSize + 80);
  const [historyVisible, setHistoryVisible] = useState(false);

  function openHistory() {
    props.onLoadSessions();
    setHistoryVisible(true);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // fix: 直接关闭Panel并同步跳转，避免 setTimeout 在 Web 预览中渲染为弹层
  function handleMemoryPress() {
    props.onClose();
    router.push('/(app)/heron-memory' as RelativePathString);
  }

  return (
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>

        {/* ── 顶部栏：左侧标题 | 右侧：记忆·新建·历史·悬浮球·关闭 ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: 'rgba(122,157,140,0.15)',
          backgroundColor: '#7A9D8C0D',
        }}>
          {/* 左：标题 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7A9D8C' }} />
            <Brain size={18} color="#7A9D8C" />
            <Text style={{ fontSize: 16, fontWeight: '700' }} className="text-foreground">苍鹭医生</Text>
          </View>

          {/* 右：按钮组，各按钮等宽圆形 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* 记忆 — fix1：先关Panel再跳转 */}
            <Pressable
              onPress={handleMemoryPress}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: '#7A9D8C18', borderRadius: 20,
                paddingHorizontal: 10, paddingVertical: 5,
                borderWidth: 1, borderColor: '#7A9D8C40',
              }}
            >
              <Brain size={12} color="#7A9D8C" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#7A9D8C' }}>记忆</Text>
            </Pressable>

            {/* fix2: 新建对话 — 仅图标 */}
            <Pressable
              onPress={props.onNewChat}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(122,157,140,0.10)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(122,157,140,0.30)',
              }}
            >
              <PlusCircle size={15} color="#7A9D8C" />
            </Pressable>

            {/* fix2: 历史对话 — 仅图标 */}
            <Pressable
              onPress={openHistory}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(0,0,0,0.05)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
              }}
            >
              <History size={15} color="#6b7280" />
            </Pressable>

            {/* 悬浮球开关 */}
            <Pressable
              onPress={props.onToggleFloat}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: props.floatVisible ? 'rgba(122,157,140,0.12)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1,
                borderColor: props.floatVisible ? 'rgba(122,157,140,0.35)' : 'transparent',
              }}
            >
              {props.floatVisible
                ? <Eye size={15} color="#7A9D8C" />
                : <EyeOff size={15} color="#9ca3af" />
              }
            </Pressable>

            {/* 关闭 */}
            <Pressable
              onPress={props.onClose}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(0,0,0,0.06)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={17} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        {/* ── 对话区 + 舞台区 ── */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <ChatMessageList
              messages={props.messages}
              streamingText={props.streamingText}
              streaming={props.streaming}
              petState={props.petState}
              streamingSteps={props.streamingSteps}
              stageTopOffset={stageCardHeight}
            />
          </View>
          <View
            style={{ position: 'absolute', top: 10, left: 16, right: 16, zIndex: 20, alignItems: 'center' }}
            onLayout={(e) => setStageCardHeight(e.nativeEvent.layout.height + 8)}
            pointerEvents="none"
          >
            <PetStage state={props.petState} size={stageSize} />
          </View>
        </View>

        {/* ── 输入枢纽（无独立工具栏，已并入标题栏）── */}
        <InputHub
          value={props.value}
          onChangeText={props.onChangeText}
          onSend={props.onSend}
          onStop={props.onStop}
          attachments={props.attachments}
          onAddAttachments={props.onAddAttachments}
          onRemoveAttachment={props.onRemoveAttachment}
          modelIndex={props.modelIndex}
          onCycleModel={props.onCycleModel}
          skill={props.skill}
          onPickSkill={props.onPickSkill}
          busy={props.busy}
        />
        <View style={{ height: insets.bottom }} />
      </View>

      {/* ── 历史对话底部面板 ── */}
      <Modal visible={historyVisible} animationType="slide" transparent onRequestClose={() => setHistoryVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setHistoryVisible(false)} />
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#FAFAF8',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingBottom: insets.bottom + 16, maxHeight: '70%',
        }}>
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)' }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>历史对话</Text>
            <Pressable onPress={() => setHistoryVisible(false)}>
              <X size={20} color="#9ca3af" />
            </Pressable>
          </View>
          {props.sessions.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>💬</Text>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>暂无历史对话</Text>
            </View>
          ) : (
            <FlatList
              data={props.sessions}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { props.onLoadSession(item); setHistoryVisible(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#fff', borderRadius: 14, padding: 14,
                    borderWidth: 1, borderColor: 'rgba(122,157,140,0.15)', gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#2d3748' }} numberOfLines={1}>
                      {item.title || '无标题对话'}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {formatDate(item.updated_at)} · {item.messages?.length ?? 0} 条消息
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#c4c9d4" />
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </Modal>
  );
}

