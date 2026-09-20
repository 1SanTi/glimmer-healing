import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ImagePlus } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSession } from '@/ctx';
import { supabase } from '@/client/supabase';
import { saveTestResult } from '@/db/api';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DrawingCanvas from '@/components/DrawingCanvas';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

const MOOD_TIPS = [
  '用任意颜色和线条，描绘你现在的心情',
  '不需要画出具体形状，感受引导你的手',
  '你选择的颜色本身就是你情绪的语言',
  '放慢节奏，让线条随心流动',
];

// ── 共用 AI 解读流程 ──
async function runSketchInterpret(base64: string): Promise<string> {
  // 校验并扣减每日 AI 积分（每次解读消耗 5 点积分）
  const quota = await checkAndConsumeCredits(5);
  if (!quota.allowed) {
    throw new Error(quota.message || '今日 AI 积分不足（单次解读消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
  }

  const { data: reqData, error: reqErr } = await supabase.functions.invoke(
    'image-understanding-request',
    { body: { question: '请描述这幅画的构图、线条走势、使用的颜色及整体视觉风格', image: base64 } },
  );
  if (reqErr || !reqData?.result?.task_id) throw new Error(reqErr?.message ?? '提交图像理解失败');

  let description = '';
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const { data: resData, error: resErr } = await supabase.functions.invoke(
      'image-understanding-result', { body: { task_id: reqData.result.task_id } },
    );
    if (resErr) throw resErr;
    const retCode = resData?.result?.ret_code;
    if (retCode === 0) { description = resData.result.description ?? ''; break; }
    if (retCode !== 1) throw new Error(`图像理解失败 ret_code:${retCode}`);
  }
  if (!description) throw new Error('图像理解超时，请重试');

  const { data, error: fnErr } = await supabase.functions.invoke('sketch-interpret', {
    body: { image_description: description },
  });
  if (fnErr) throw fnErr;
  return data?.interpretation ?? '无法获取解读结果，请重试。';
}

// ── 心灵速写主页面 ──
export default function SketchScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [step, setStep] = useState<'intro' | 'drawing' | 'interpreting' | 'result'>('intro');
  const [interpretation, setInterpretation] = useState('');
  const [exporting, setExporting] = useState(false);
  const [drawnUri, setDrawnUri] = useState('');
  const [tipIdx] = useState(() => Math.floor(Math.random() * MOOD_TIPS.length));
  // 纯净模式：隐藏顶部标题栏
  const [pureMode, setPureMode] = useState(false);

  // 将 base64 保存为临时 file:// URI
  const saveBase64ToFile = async (base64: string): Promise<string> => {
    const dir = `${FileSystem.documentDirectory}sketch_tmp/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const path = `${dir}sketch_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return path;
  };

  // 导出画布 → 保存图片 → AI 解读
  const handleExport = async (base64: string) => {
    setExporting(true);
    setStep('interpreting');
    try {
      // 先保存图片为本地 file URI，供结果页展示
      try {
        const uri = await saveBase64ToFile(base64);
        setDrawnUri(uri);
      } catch { /* 保存失败不阻塞解读 */ }
      const text = await runSketchInterpret(base64);
      setInterpretation(text);
      if (session) {
        await saveTestResult(session.user.id, 'sketch', { image: '(手绘已保存)', interpretation: text }, 0, text.slice(0, 100));
      }
    } catch (err: any) {
      console.error('心灵速写解读失败:', err);
      setInterpretation(`AI解读暂时不可用（${err?.message ?? '未知错误'}），请稍后重试。`);
    } finally {
      setExporting(false);
      setStep('result');
    }
  };

  // 上传图片直接 AI 解读
  const handleUploadAndInterpret = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, quality: 0.8, base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setStep('interpreting');
      try {
        setInterpretation(await runSketchInterpret(result.assets[0].base64));
      } catch (err: any) {
        setInterpretation(`AI解读暂时不可用（${err?.message ?? '未知错误'}），请稍后重试。`);
      }
      setStep('result');
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-background">
        <StatusBar style="dark" />

        {/* ── 引导介绍页 ── */}
        {step === 'intro' && (
          <>
            <Pressable onPress={() => router.back()}
              className="absolute top-14 left-4 z-10 w-9 h-9 rounded-full bg-white/90 items-center justify-center"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.1)' }] }}>
              <ArrowLeft size={18} color="#6B7280" />
            </Pressable>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
              <View className="h-48 items-center justify-center" style={{ backgroundColor: '#F3F0FF' }}>
                <Text style={{ fontSize: 64 }}>🎨</Text>
              </View>
              <View className="px-6 pt-6 pb-28">
                <Text className="text-2xl font-bold text-foreground mb-2">心灵速写</Text>
                <Text className="text-muted-foreground text-sm leading-6 mb-5">
                  颜色是情绪的语言。拿起画笔，用颜色和线条描绘你此刻的感受。完成后，AI将从色彩心理学角度解读画作中藏着的情绪信息。
                  {'\n\n'}也可以直接上传已有图片，即刻获得AI色彩解读 📸
                </Text>

                <View className="bg-purple-50 rounded-2xl p-4 mb-6">
                  <Text className="text-foreground font-semibold text-sm mb-2">🌈 色彩情绪小知识</Text>
                  {[
                    { color: '#DC2626', meaning: '红色 — 热情、能量、紧迫感' },
                    { color: '#EAB308', meaning: '黄色 — 阳光、希望、轻快感' },
                    { color: '#0EA5E9', meaning: '蓝色 — 平静、思考、忧郁感' },
                    { color: '#6366F1', meaning: '紫色 — 神秘、想象、内省' },
                    { color: '#1F2937', meaning: '黑色 — 力量、深沉、内心保护' },
                  ].map(item => (
                    <View key={item.color} className="flex-row items-center gap-2 mb-1.5">
                      <View className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <Text className="text-muted-foreground text-xs">{item.meaning}</Text>
                    </View>
                  ))}
                </View>

                <Text className="text-muted-foreground text-xs text-center italic mb-6">
                  💡 {MOOD_TIPS[tipIdx]}
                </Text>

                <View className="gap-3">
                  {/* 开始手绘 */}
                  <Pressable
                    className="rounded-2xl py-4 items-center flex-row justify-center gap-2"
                    style={{ backgroundColor: '#9B8EC4' }}
                    onPress={() => setStep('drawing')}>
                    <Text className="text-white font-bold text-base">开始手绘 🖌️</Text>
                  </Pressable>
                  {/* 上传图片直接解读 */}
                  <Pressable
                    className="bg-muted rounded-2xl py-3.5 items-center flex-row justify-center gap-2"
                    onPress={handleUploadAndInterpret}>
                    <ImagePlus size={16} color="#6366F1" />
                    <Text style={{ color: '#6366F1', fontWeight: '600', fontSize: 14 }}>上传图片 · AI解读</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </>
        )}

        {/* ── 绘画页（使用共享 DrawingCanvas 组件） ── */}
        {step === 'drawing' && (
          <View style={{ flex: 1 }}>
            {/* 顶部导航：纯净模式时隐藏 */}
            {!pureMode && (
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
                flexDirection: 'row', alignItems: 'center',
                paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16,
                backgroundColor: 'rgba(251,248,244,0.88)',
              }}>
                <Pressable onPress={() => setStep('intro')}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <ArrowLeft size={18} color="#6B7280" />
                </Pressable>
                <Text style={{ fontWeight: '700', fontSize: 15, color: '#1F2937', flex: 1 }}>心灵速写 🎨</Text>
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>随心画，无对错</Text>
              </View>
            )}
            <DrawingCanvas
              bgColor="#FBF8F4"
              submitLabel="AI解读"
              submitColor="#9B8EC4"
              topReservedHeight={0}
              onExport={handleExport}
              exporting={exporting}
              onPureModeChange={setPureMode}
            />
          </View>
        )}

        {/* ── 解读中 ── */}
        {step === 'interpreting' && (
          <View className="flex-1 items-center justify-center px-8 gap-4">
            <Text style={{ fontSize: 56 }}>🔮</Text>
            <ActivityIndicator size="large" color="#9B8EC4" />
            <Text className="text-foreground font-semibold text-base text-center">AI正在解读你的色彩语言…</Text>
            <Text className="text-muted-foreground text-sm text-center">
              通过颜色选择与线条走势{'\n'}探索你此刻的情绪世界
            </Text>
          </View>
        )}

        {/* ── 结果页 ── */}
        {step === 'result' && (
          <>
            <Pressable onPress={() => router.back()}
              className="absolute top-14 left-4 z-10 w-9 h-9 rounded-full bg-white/90 items-center justify-center"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.1)' }] }}>
              <ArrowLeft size={18} color="#6B7280" />
            </Pressable>
            <ScrollView contentContainerStyle={{ paddingTop: 80, paddingHorizontal: 24, paddingBottom: 48 }}>
              <View className="items-center mb-6">
                <Text style={{ fontSize: 52 }}>🎨</Text>
                <Text className="text-foreground font-bold text-xl mt-3">色彩心理解读</Text>
                <Text className="text-muted-foreground text-sm mt-1">基于你的画作线条与色彩</Text>
              </View>
              {drawnUri ? (
                <Image source={{ uri: drawnUri }} className="w-full rounded-2xl mb-4"
                  style={{ height: 160 }} contentFit="cover" />
              ) : null}
              <View className="bg-card rounded-3xl p-5 mb-5"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.07)' }] }}>
                <Text className="text-foreground text-sm leading-7">{interpretation}</Text>
              </View>
              <Text className="text-muted-foreground text-xs text-center leading-5 mb-6">
                ✨ 色彩解读仅供情绪探索参考，不构成任何诊断结论
              </Text>
              <View className="gap-3">
                <Pressable
                  className="rounded-2xl py-4 items-center"
                  style={{ backgroundColor: '#9B8EC4' }}
                  onPress={() => setStep('drawing')}>
                  <Text className="text-white font-bold">再画一幅 🖌️</Text>
                </Pressable>
                <Pressable
                  className="bg-muted rounded-2xl py-3.5 items-center flex-row justify-center gap-2"
                  onPress={handleUploadAndInterpret}>
                  <ImagePlus size={14} color="#6366F1" />
                  <Text style={{ color: '#6366F1', fontWeight: '600' }}>换张图片解读</Text>
                </Pressable>
                <Pressable className="bg-muted rounded-2xl py-3.5 items-center" onPress={() => router.back()}>
                  <Text className="text-foreground font-semibold">返回游戏舱</Text>
                </Pressable>
              </View>
            </ScrollView>
          </>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
