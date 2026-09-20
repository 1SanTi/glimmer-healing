import { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Paperclip, Send, Bot, AtSign, X, Check, Sparkles, Square, ChevronDown } from 'lucide-react-native';
import type { HeronAttachment } from '@/types/types';
import { MODELS } from '@/lib/heron/models';
import { getAllSkills } from '@/lib/heron/skills';

interface Props {
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
}

export function InputHub(props: Props) {
  const { value, onChangeText, onSend, onStop, attachments, onAddAttachments, onRemoveAttachment, modelIndex, onCycleModel, skill, onPickSkill, busy } = props;
  const [showSkills, setShowSkills] = useState(false);
  const [showModels, setShowModels] = useState(false); // fix4: 模型下拉
  const model = MODELS[modelIndex % MODELS.length];
  const isAuto = model.id === 'auto';

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const items: HeronAttachment[] = res.assets.map((a) => ({
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: 'image', name: a.fileName || '图片', uri: a.uri, size: a.fileSize,
    }));
    onAddAttachments(items);
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/pdf', 'text/markdown', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const items: HeronAttachment[] = res.assets.map((a) => ({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind: 'file', name: a.name, uri: a.uri, size: a.size,
      }));
      onAddAttachments(items);
    } catch { /* ignore */ }
  };

  const send = () => {
    if (busy) return;
    if (!value.trim() && attachments.length === 0) return;
    onSend();
  };

  // 找到已选技能的显示名
  const skillDisplayName = skill ? (getAllSkills().find(s => s.name === skill)?.displayName ?? skill) : null;

  return (
    <View style={{
      marginHorizontal: 10, marginBottom: 8,
      backgroundColor: '#fff',
      borderRadius: 22,
      borderWidth: 1.5, borderColor: 'rgba(122,157,140,0.22)',
      shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: -4 },
      elevation: 6,
      paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10,
    }}>

      {/* ── 顶栏：附件 + 模型下拉 + 技能 — fix4: gap加大到14 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        {/* 附件按钮 */}
        <Pressable
          onPress={pickFile}
          onLongPress={pickImage}
          style={{
            width: 34, height: 34,
            borderRadius: 17, alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#F5F0E8', borderWidth: 1.5, borderColor: '#7A9D8C',
          }}
        >
          <Paperclip size={16} color="#7A9D8C" />
        </Pressable>

        {/* fix4: 模型选择芯片 → 点击弹下拉菜单 */}
        <Pressable
          onPress={() => setShowModels(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
            borderWidth: 1.5,
            borderColor: isAuto ? 'rgba(122,157,140,0.6)' : 'rgba(122,157,140,0.3)',
            backgroundColor: isAuto ? 'rgba(122,157,140,0.12)' : 'rgba(122,157,140,0.06)',
          }}
        >
          {isAuto
            ? <Sparkles size={13} color="#7A9D8C" />
            : <Bot size={13} color="#7A9D8C" />
          }
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#7A9D8C' }}>{model.label}</Text>
          <ChevronDown size={11} color="#7A9D8C" />
        </Pressable>

        {/* 技能选择芯片：已选中则再次点击取消，未选中则打开选择弹层 */}
        <Pressable
          onPress={() => skill ? onPickSkill(null) : setShowSkills(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
            borderWidth: 1.5,
            borderColor: skill ? '#E88D67' : 'rgba(0,0,0,0.12)',
            backgroundColor: skill ? 'rgba(232,141,103,0.08)' : 'rgba(0,0,0,0.04)',
          }}
        >
          {skill
            ? <X size={13} color="#E88D67" />
            : <AtSign size={13} color="#6b7280" />
          }
          <Text style={{ fontSize: 12, fontWeight: '600', color: skill ? '#E88D67' : '#6b7280' }}>
            {skillDisplayName ?? '选技能'}
          </Text>
        </Pressable>
      </View>

      {/* ── 分割线 ── */}
      <View style={{ height: 1, backgroundColor: 'rgba(122,157,140,0.15)', marginBottom: 10 }} />

      {/* ── 附件预览（若有）── */}
      {attachments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
          {attachments.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 6, maxWidth: 190, minWidth: 0 }}>
              {a.kind === 'image' && a.uri ? (
                <Image source={{ uri: a.uri }} style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} contentFit="cover" />
              ) : (
                <Text style={{ fontSize: 11, color: '#6b7280', flex: 1, minWidth: 0 }} numberOfLines={1}>{a.name}</Text>
              )}
              <Pressable
                onPress={() => onRemoveAttachment(a.id)}
                style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(220,38,38,0.85)', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 2 }}
              >
                <X size={10} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* ── 输入框 + 发送/暂停按钮 同行 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          flex: 1, minWidth: 0,
          borderRadius: 16, borderWidth: 1.5,
          borderColor: skill ? 'rgba(232,141,103,0.55)' : 'rgba(122,157,140,0.25)',
          backgroundColor: skill ? 'rgba(232,141,103,0.04)' : '#FAFAFA',
          paddingHorizontal: 14, paddingVertical: 8,
          minHeight: 60, justifyContent: 'center',
        }}>
          {/* fix3: 移除输入框内的技能标签提示行，技能状态仅在顶栏芯片体现，不注入消息文本 */}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="和苍鹭医生说说…"
            placeholderTextColor="#b0b8c1"
            multiline
            editable={!busy}
            scrollEnabled
            style={{ fontSize: 14, lineHeight: 22, color: '#2d3748', textAlignVertical: 'top', minHeight: 44, maxHeight: 66 }}
          />
        </View>

        {/* busy 时变为暂停按钮 */}
        <Pressable
          onPress={busy ? onStop : send}
          style={{
            width: 52, height: 52, borderRadius: 26,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: busy ? '#E88D67' : (value.trim() || attachments.length > 0 ? '#7A9D8C' : '#b0b8c1'),
          }}
        >
          {busy
            ? <Square size={20} color="#fff" fill="#fff" />
            : <Send size={20} color="#fff" />
          }
        </Pressable>
      </View>

      {/* ── 技能选择弹层 ── */}
      <Modal visible={showSkills} transparent animationType="slide" onRequestClose={() => setShowSkills(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowSkills(false)}>
          <View style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#fff', padding: 20, paddingBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(122,157,140,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <AtSign size={15} color="#7A9D8C" />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>选择技能</Text>
              </View>
              <Pressable onPress={() => setShowSkills(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {getAllSkills().map((s) => (
                <Pressable
                  key={s.name}
                  onPress={() => { onPickSkill(s.name); setShowSkills(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    borderRadius: 18, backgroundColor: '#fff', padding: 14, marginBottom: 10,
                    borderWidth: 1.5, borderColor: skill === s.name ? '#7A9D8C' : 'rgba(122,157,140,0.18)',
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(122,157,140,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <AtSign size={18} color="#7A9D8C" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#2d3748' }}>{s.displayName}</Text>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }} numberOfLines={2}>{s.description}</Text>
                  </View>
                  {skill === s.name ? <Check size={18} color="#7A9D8C" /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* ── fix4: 模型选择下拉菜单 ── */}
      <Modal visible={showModels} transparent animationType="fade" onRequestClose={() => setShowModels(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowModels(false)}>
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(122,157,140,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={15} color="#7A9D8C" />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>选择模型</Text>
              </View>
              <Pressable onPress={() => setShowModels(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            {MODELS.map((m, idx) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  // 切换到对应 index：连续调用 onCycleModel 直到对齐
                  const diff = (idx - modelIndex + MODELS.length) % MODELS.length;
                  for (let i = 0; i < diff; i++) onCycleModel();
                  setShowModels(false);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  borderRadius: 14, padding: 12, marginBottom: 8,
                  borderWidth: 1.5,
                  borderColor: modelIndex === idx ? '#7A9D8C' : 'rgba(122,157,140,0.15)',
                  backgroundColor: modelIndex === idx ? 'rgba(122,157,140,0.07)' : '#fff',
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(122,157,140,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                  {m.id === 'auto' ? <Sparkles size={16} color="#7A9D8C" /> : <Bot size={16} color="#7A9D8C" />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#2d3748' }}>{m.label}</Text>
                  {m.desc ? <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }} numberOfLines={1}>{m.desc}</Text> : null}
                </View>
                {modelIndex === idx ? <Check size={16} color="#7A9D8C" /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
