import { useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Send, RefreshCw } from 'lucide-react-native';
import { streamAiChat } from '@/lib/aiStream';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

// ── NVC 四要素 ────────────────────────────────────────────────
interface NVCElement {
  key: string;
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  content: string;
}

const EMPTY_ELEMENTS: NVCElement[] = [
  { key: 'observation', label: '观察',  emoji: '👁️', color: '#3A72B8', bgColor: '#F0F7FF', borderColor: '#B8D8F5', description: '客观描述，不带评判',      content: '' },
  { key: 'feeling',     label: '感受',  emoji: '💙',  color: '#2A5A9A', bgColor: '#F0F5FF', borderColor: '#A8C8F0', description: '真实的情绪词，非想法',   content: '' },
  { key: 'need',        label: '需要',  emoji: '🌱',  color: '#1A4880', bgColor: '#EAF2FF', borderColor: '#90B8E8', description: '未被满足的内在需求',     content: '' },
  { key: 'request',     label: '请求',  emoji: '🤝',  color: '#0A3060', bgColor: '#E4EDFF', borderColor: '#78A8E0', description: '具体可行的积极请求',     content: '' },
];

// ── 卢森堡色调（天鸽蓝）────────────────────────────────────────
const THEME = {
  bg: '#F0F7FF',
  header: '#FFFFFF',
  headerBorder: '#B8D8F5',
  primary: '#5B9BD5',
  primaryDark: '#3A72B8',
  text: '#0A2040',
  subText: '#4A7CB8',
  inputBg: '#FFFFFF',
  inputBorder: '#B8D8F5',
};

export default function NvcTranslatorScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [elements, setElements] = useState<NVCElement[]>([]);
  const [fullSentence, setFullSentence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const translate = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setElements([]);
    setFullSentence('');
    setAnalysis('');
    setOriginal(input.trim());

    // 校验并扣减每日 AI 积分额度（每次翻译消耗 5 点积分）
    const quota = await checkAndConsumeCredits(5);
    if (!quota.allowed) {
      setError(quota.message || '今日 AI 积分不足（单次翻译消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
      setLoading(false);
      return;
    }

    try {
      const systemPrompt = `你是马歇尔·卢森堡，非暴力沟通（NVC）创始人。
用户将输入一句评判性、指责性或带有"暴力"色彩的话，请你：
1. 分析原话的问题（异化沟通方式）
2. 将其翻译为非暴力沟通的四要素
3. 组合成完整的NVC句子

严格以 JSON 格式返回，只输出 JSON，不要有任何其他文字：
{
  "analysis": "对原话的分析（1-2句，指出是道德评判/比较/回避责任/强人所难等哪种异化沟通方式）",
  "observation": "客观观察（不含评判，描述具体可观察到的事实，1句话）",
  "feeling": "感受（使用情绪词，非想法，1句话）",
  "need": "需要（内在未被满足的需求，1句话）",
  "request": "具体请求（积极、明确、可行，1句话）",
  "fullSentence": "组合成完整的NVC表达（1-2句自然流畅的话，包含四个要素）"
}`;

      const raw = await streamAiChat({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: input.trim() },
        ],
      });

      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : raw;
      const parsed = JSON.parse(jsonStr.trim());

      const filled: NVCElement[] = EMPTY_ELEMENTS.map(e => ({
        ...e,
        content: parsed[e.key] ?? '',
      }));
      setElements(filled);
      setFullSentence(parsed.fullSentence ?? '');
      setAnalysis(parsed.analysis ?? '');
      setInput('');
      setTimeout(() => scrollRef.current?.scrollTo({ y: 300, animated: true }), 200);
    } catch {
      setError('翻译失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setInput('');
    setOriginal('');
    setElements([]);
    setFullSentence('');
    setAnalysis('');
    setError(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg }}>
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View style={{
        backgroundColor: THEME.header, borderBottomWidth: 1, borderBottomColor: THEME.headerBorder,
        paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <Pressable onPress={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(91,155,213,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowLeft size={20} color={THEME.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: THEME.text }}>🕊️ 非暴力沟通翻译机</Text>
          <Text style={{ fontSize: 12, color: THEME.subText, marginTop: 1 }}>卢森堡 · 四要素重构表达</Text>
        </View>
        {elements.length > 0 && (
          <Pressable onPress={reset} style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
            backgroundColor: 'rgba(91,155,213,0.12)',
          }}>
            <RefreshCw size={14} color={THEME.primary} />
            <Text style={{ fontSize: 12, color: THEME.primary, fontWeight: '600' }}>重新翻译</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 说明区 */}
          <View style={{ margin: 16, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: THEME.headerBorder }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.text, marginBottom: 6 }}>什么是非暴力沟通？</Text>
            <Text style={{ fontSize: 12, color: THEME.subText, lineHeight: 20 }}>
              非暴力沟通（NVC）包含四个要素：{'\n'}
              <Text style={{ fontWeight: '600' }}>观察</Text>（客观事实）·{' '}
              <Text style={{ fontWeight: '600' }}>感受</Text>（情绪）·{' '}
              <Text style={{ fontWeight: '600' }}>需要</Text>（内在需求）·{' '}
              <Text style={{ fontWeight: '600' }}>请求</Text>（具体行动）{'\n'}
              输入一句带情绪或评判的话，AI 将帮你翻译成更有爱的表达。
            </Text>
          </View>

          {/* 四要素徽章 */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 16 }}>
            {EMPTY_ELEMENTS.map((el, i) => (
              <View key={el.key} style={{
                flex: 1, alignItems: 'center', paddingVertical: 8,
                backgroundColor: el.bgColor, borderRadius: 14,
                borderWidth: 1, borderColor: el.borderColor,
              }}>
                <Text style={{ fontSize: 16, marginBottom: 2 }}>{el.emoji}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: el.color }}>{el.label}</Text>
              </View>
            ))}
          </View>

          {/* 输入区 */}
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: THEME.text, marginBottom: 8 }}>
              输入一句评判性或带"暴力"色彩的话
            </Text>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={'例如："你真是太自私了！""你怎么这么懒！""你永远不关心我！"'}
              placeholderTextColor={THEME.subText + '80'}
              multiline
              style={{
                backgroundColor: THEME.inputBg,
                borderRadius: 16, borderWidth: 1.5, borderColor: THEME.inputBorder,
                paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 14, color: THEME.text, lineHeight: 22, minHeight: 90,
              }}
            />
            <Pressable
              onPress={translate}
              disabled={!input.trim() || loading}
              style={{
                marginTop: 10, borderRadius: 16,
                backgroundColor: input.trim() && !loading ? THEME.primary : '#B8D8F580',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14,
              }}
            >
              {loading
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Send size={16} color="#FFFFFF" />}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                {loading ? '翻译中…' : '翻译成非暴力沟通'}
              </Text>
            </Pressable>
            {error && (
              <Text style={{ fontSize: 12, color: '#E06A8C', marginTop: 8, textAlign: 'center' }}>{error}</Text>
            )}
          </View>

          {/* 翻译结果 */}
          {elements.length > 0 && (
            <View style={{ marginHorizontal: 16 }}>

              {/* 原话展示 */}
              <View style={{
                backgroundColor: '#FFF0F4', borderRadius: 16,
                borderWidth: 1.5, borderColor: '#F5C8D8', padding: 14, marginBottom: 12,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#E06A8C', marginBottom: 4 }}>📢 原话</Text>
                <Text style={{ fontSize: 13, color: '#3D1020', lineHeight: 20, fontStyle: 'italic' }}>
                  "{original}"
                </Text>
                {analysis.length > 0 && (
                  <>
                    <View style={{ height: 1, backgroundColor: '#F5C8D8', marginVertical: 8 }} />
                    <Text style={{ fontSize: 12, color: '#E06A8C', lineHeight: 19 }}>⚠️ {analysis}</Text>
                  </>
                )}
              </View>

              {/* 箭头 */}
              <Text style={{ textAlign: 'center', fontSize: 22, marginBottom: 12 }}>⬇️</Text>

              <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.text, marginBottom: 10 }}>
                🕊️ 非暴力沟通翻译
              </Text>

              {/* 四要素卡片 */}
              {elements.map((el, idx) => (
                <View key={el.key} style={{
                  backgroundColor: el.bgColor, borderRadius: 16,
                  borderWidth: 1.5, borderColor: el.borderColor,
                  padding: 14, marginBottom: 10,
                  flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                }}>
                  {/* 序号 + 要素名 */}
                  <View style={{ alignItems: 'center', width: 46 }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: el.color + '20',
                      alignItems: 'center', justifyContent: 'center', marginBottom: 4,
                    }}>
                      <Text style={{ fontSize: 16 }}>{el.emoji}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: el.color, textAlign: 'center' }}>{el.label}</Text>
                    <Text style={{ fontSize: 9, color: el.color + '90', textAlign: 'center', marginTop: 1 }}>
                      {['①', '②', '③', '④'][idx]}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: el.color + 'A0', marginBottom: 4 }}>{el.description}</Text>
                    <Text style={{ fontSize: 13, color: THEME.text, lineHeight: 21 }}>{el.content}</Text>
                  </View>
                </View>
              ))}

              {/* 完整NVC句子 */}
              {fullSentence.length > 0 && (
                <View style={{
                  marginTop: 6, backgroundColor: '#FFFFFF',
                  borderRadius: 18, borderWidth: 2, borderColor: THEME.primary + '60',
                  padding: 16,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.primary, marginBottom: 8 }}>
                    ✨ 完整的非暴力沟通表达
                  </Text>
                  <Text style={{ fontSize: 14, color: THEME.text, lineHeight: 24, fontStyle: 'italic' }}>
                    "{fullSentence}"
                  </Text>
                </View>
              )}

              {/* 与卢森堡对话入口 */}
              <Pressable
                onPress={() => router.push('/(app)/chat/rosenberg' as RelativePathString)}
                style={{
                  marginTop: 16, borderRadius: 16,
                  backgroundColor: THEME.primary,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 14,
                }}
              >
                <Text style={{ fontSize: 22 }}>🕊️</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>与卢森堡深入练习</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
