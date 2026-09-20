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

// ── 冰山各层定义 ──────────────────────────────────────────────
interface IcebergLayer {
  key: string;
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  content: string;
}

const EMPTY_LAYERS: IcebergLayer[] = [
  { key: 'behavior',   label: '行为 / 应对姿态',  emoji: '🌊', color: '#E06A8C', bgColor: '#FFF0F4', borderColor: '#F5C8D8', description: '表面可见的行为与应对方式', content: '' },
  { key: 'feeling',    label: '感受',              emoji: '💧', color: '#C4507A', bgColor: '#FFF5F8', borderColor: '#F5D0E0', description: '情绪层——你真实感受到的',   content: '' },
  { key: 'feelingOf',  label: '感受的感受',        emoji: '🔵', color: '#9B4072', bgColor: '#FFF8FB', borderColor: '#EFC0D8', description: '对自己情绪的评价与反应',   content: '' },
  { key: 'belief',     label: '观点 / 信念',       emoji: '💎', color: '#7A3060', bgColor: '#FFF8FC', borderColor: '#E8B0CC', description: '你如何解读这件事',          content: '' },
  { key: 'expectation',label: '期待',              emoji: '🌙', color: '#5C2050', bgColor: '#FFF5FA', borderColor: '#DCA0C0', description: '你对自己、他人、情境的期待',content: '' },
  { key: 'longing',    label: '渴望',              emoji: '⭐', color: '#401040', bgColor: '#FFF0F8', borderColor: '#D090B0', description: '人类共有的深层需求',         content: '' },
  { key: 'self',       label: '自我 / 生命力',     emoji: '✨', color: '#280828', bgColor: '#FFEAF5', borderColor: '#C080A0', description: '核心自我与生命能量状态',   content: '' },
];

// ── 萨提亚色调 ────────────────────────────────────────────────
const THEME = {
  bg: '#FFF5F8',
  header: '#FFEEF3',
  headerBorder: '#F5C8D8',
  primary: '#E06A8C',
  primaryDark: '#C4507A',
  text: '#3D1020',
  subText: '#A05878',
  inputBg: '#FFFFFF',
  inputBorder: '#F5C8D8',
};

export default function IcebergAnalyzerScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState<IcebergLayer[]>([]);
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const analyze = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setLayers([]);
    setSuggestion('');

    // 校验并扣减每日 AI 积分额度（每次分析消耗 5 点积分）
    const quota = await checkAndConsumeCredits(5);
    if (!quota.allowed) {
      setError(quota.message || '今日 AI 积分不足（单次分析消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
      setLoading(false);
      return;
    }

    try {
      const systemPrompt = `你是维吉尼亚·萨提亚，擅长使用冰山隐喻帮助人们看见内在世界。
用户将输入一段冲突描述或情绪发泄，请你严格按照萨提亚冰山理论的七个层次逐层分析，并以 JSON 格式返回结果。

返回格式（严格遵守，只输出 JSON，不要有任何其他文字）：
{
  "behavior": "行为/应对姿态分析（1-2句）",
  "feeling": "感受层分析（1-2句）",
  "feelingOf": "感受的感受分析（1-2句）",
  "belief": "观点/信念分析（1-2句）",
  "expectation": "期待分析（1-2句）",
  "longing": "渴望分析（1-2句）",
  "self": "自我/生命力现状分析（1-2句）",
  "suggestion": "一致性表达建议（2-3句，给出具体的建议表达句式）"
}`;

      const raw = await streamAiChat({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: input.trim() },
        ],
      });

      // 提取 JSON — 兼容 markdown code block 包裹
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : raw;
      const parsed = JSON.parse(jsonStr.trim());

      const filled: IcebergLayer[] = EMPTY_LAYERS.map(l => ({
        ...l,
        content: parsed[l.key] ?? '',
      }));
      setLayers(filled);
      setSuggestion(parsed.suggestion ?? '');
      setTimeout(() => scrollRef.current?.scrollTo({ y: 400, animated: true }), 200);
    } catch {
      setError('解析失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setInput('');
    setLayers([]);
    setSuggestion('');
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
          width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(224,106,140,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowLeft size={20} color={THEME.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: THEME.text }}>🧊 冰山隐喻解析器</Text>
          <Text style={{ fontSize: 12, color: THEME.subText, marginTop: 1 }}>萨提亚 · 探索内在七层冰山</Text>
        </View>
        {layers.length > 0 && (
          <Pressable onPress={reset} style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
            backgroundColor: 'rgba(224,106,140,0.12)',
          }}>
            <RefreshCw size={14} color={THEME.primary} />
            <Text style={{ fontSize: 12, color: THEME.primary, fontWeight: '600' }}>重新解析</Text>
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
            <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.text, marginBottom: 6 }}>什么是冰山？</Text>
            <Text style={{ fontSize: 12, color: THEME.subText, lineHeight: 20 }}>
              萨提亚认为，我们的行为只是冰山露出水面的一角。水面之下，隐藏着感受、信念、期待与渴望。{'\n'}
              输入一段让你有情绪的事，AI 将为你逐层揭开内在冰山。
            </Text>
          </View>

          {/* 输入区 */}
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: THEME.text, marginBottom: 8 }}>描述一件让你有情绪的事</Text>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={'例如："老板今天当众批评我，我表面点头称是，心里觉得他根本不懂业务，委屈得想哭。"'}
              placeholderTextColor={THEME.subText + '80'}
              multiline
              style={{
                backgroundColor: THEME.inputBg,
                borderRadius: 16, borderWidth: 1.5, borderColor: THEME.inputBorder,
                paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 14, color: THEME.text, lineHeight: 22, minHeight: 110,
              }}
            />
            <Pressable
              onPress={analyze}
              disabled={!input.trim() || loading}
              style={{
                marginTop: 10, borderRadius: 16,
                backgroundColor: input.trim() && !loading ? THEME.primary : '#F5C8D880',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14,
              }}
            >
              {loading
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Send size={16} color="#FFFFFF" />}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                {loading ? '分析中…' : '解析我的冰山'}
              </Text>
            </Pressable>
            {error && (
              <Text style={{ fontSize: 12, color: '#E06A8C', marginTop: 8, textAlign: 'center' }}>{error}</Text>
            )}
          </View>

          {/* 冰山结果 */}
          {layers.length > 0 && (
            <View style={{ marginHorizontal: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.text, marginBottom: 12 }}>
                🧊 你的内在冰山
              </Text>

              {/* 水面线 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flex: 1, height: 1.5, backgroundColor: '#B8D8F5' }} />
                <Text style={{ fontSize: 11, color: '#6AAAD8', marginHorizontal: 8, fontWeight: '600' }}>水面以上</Text>
                <View style={{ flex: 1, height: 1.5, backgroundColor: '#B8D8F5' }} />
              </View>

              {layers.map((layer, idx) => (
                <View key={layer.key}>
                  {/* 分隔线：第1层之后加"水面以下"标注 */}
                  {idx === 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 6 }}>
                      <View style={{ flex: 1, height: 1.5, backgroundColor: '#F5C8D8' }} />
                      <Text style={{ fontSize: 11, color: THEME.subText, marginHorizontal: 8, fontWeight: '600' }}>水面以下</Text>
                      <View style={{ flex: 1, height: 1.5, backgroundColor: '#F5C8D8' }} />
                    </View>
                  )}
                  <View style={{
                    backgroundColor: layer.bgColor,
                    borderRadius: 16, borderWidth: 1.5, borderColor: layer.borderColor,
                    padding: 14, marginBottom: 10,
                    // 越深越宽，视觉上体现冰山形状（用左右 marginHorizontal 反向缩进）
                    marginHorizontal: Math.max(0, (6 - idx) * 4),
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 18 }}>{layer.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: layer.color }}>{layer.label}</Text>
                        <Text style={{ fontSize: 11, color: layer.color + 'A0' }}>{layer.description}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 13, color: THEME.text, lineHeight: 21 }}>{layer.content}</Text>
                  </View>
                </View>
              ))}

              {/* 一致性建议 */}
              {suggestion.length > 0 && (
                <View style={{
                  marginTop: 6, backgroundColor: '#FFF0F4',
                  borderRadius: 18, borderWidth: 2, borderColor: THEME.primary + '50',
                  padding: 16,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.primary, marginBottom: 8 }}>
                    🌸 一致性表达建议
                  </Text>
                  <Text style={{ fontSize: 13, color: THEME.text, lineHeight: 22 }}>{suggestion}</Text>
                </View>
              )}

              {/* 咨询入口 */}
              <Pressable
                onPress={() => router.push('/(app)/chat/satir' as RelativePathString)}
                style={{
                  marginTop: 16, borderRadius: 16,
                  backgroundColor: THEME.primary,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 14,
                }}
              >
                <Text style={{ fontSize: 22 }}>🌸</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>与萨提亚深度探索</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
