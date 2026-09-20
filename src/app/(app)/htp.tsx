import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Image as ImageIcon, Pencil } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSession } from '@/ctx';
import { supabase } from '@/client/supabase';
import { saveTestResult } from '@/db/api';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DrawingCanvas from '@/components/DrawingCanvas';
import { useSubscription } from '@/hooks/useSubscription';
import UpgradeModal from '@/components/UpgradeModal';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

// 绘画步骤引导
const DRAW_STEPS = [
  { emoji: '🏠', label: '第一步：画一座房子', hint: '可以是任意风格，大小随意，画出你脑海中的家' },
  { emoji: '🌲', label: '第二步：画一棵树', hint: '树干、树枝、树叶随意发挥，重要的是你感受到的树' },
  { emoji: '🧍', label: '第三步：画一个人', hint: '画一个完整的人物，可以是自己，也可以是任何人' },
];

// ── HTP房树人主页面 ──
export default function HTPScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { level: subLevel } = useSubscription();
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const [step, setStep] = useState<'intro' | 'drawing' | 'interpreting' | 'result'>('intro');
  const [drawStep, setDrawStep] = useState(0);
  const [interpretation, setInterpretation] = useState('');
  const [uploadedUri, setUploadedUri] = useState('');
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);
  // 手绘截图保存为本地文件，用于结果页展示
  const [drawnUri, setDrawnUri] = useState('');
  // 纯净模式：隐藏顶部标题栏
  const [pureMode, setPureMode] = useState(false);

  // 将 base64 保存为临时 file:// URI
  const saveBase64ToFile = async (base64: string): Promise<string> => {
    const dir = `${FileSystem.documentDirectory}htp_tmp/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const path = `${dir}drawing_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return path;
  };

  // 相册上传
  const handlePickImage = async () => {
    if (subLevel < 1) {
      setUpgradeVisible(true);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, quality: 0.8, base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setUploadedUri(result.assets[0].uri);
      setUploadedBase64(result.assets[0].base64 ?? null);
    }
  };

  // 两步 AI 解读：图像理解 → htp-interpret
  const handleInterpretFromBase64 = async (base64: string) => {
    // 先保存图片为本地 file URI，供结果页展示
    try {
      const uri = await saveBase64ToFile(base64);
      setDrawnUri(uri);
    } catch { /* 保存失败不阻塞解读 */ }
    setStep('interpreting');
    try {
      // 消耗 5 个 AI 额度（单次解读消耗5点积分）
      const quotaCheck = await checkAndConsumeCredits(5);
      if (!quotaCheck.allowed) {
        setInterpretation(quotaCheck.message || '今日 AI 积分额度不足（单次解读消耗5点），每日 24:00 自动重置。升级心愈版（每日50点）或工作台版（每日100点）享受更多额度。');
        setStep('result');
        return;
      }

      const { data: reqData, error: reqErr } = await supabase.functions.invoke(
        'image-understanding-request',
        { body: { question: '请描述这幅画的构图、内容、色彩和风格特点', image: base64 } },
      );
      if (reqErr || !reqData?.result?.task_id) throw new Error(reqErr?.message ?? '提交图像理解失败');
      const taskId: string = reqData.result.task_id;

      let description = '';
      const deadline = Date.now() + 2 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        const { data: resData, error: resErr } = await supabase.functions.invoke(
          'image-understanding-result', { body: { task_id: taskId } },
        );
        if (resErr) throw resErr;
        const retCode = resData?.result?.ret_code;
        if (retCode === 0) { description = resData.result.description ?? ''; break; }
        if (retCode !== 1) throw new Error(`图像理解失败，ret_code: ${retCode}`);
      }
      if (!description) throw new Error('图像理解超时，请重试');

      const { data, error: fnErr } = await supabase.functions.invoke('htp-interpret', {
        body: { image_description: description },
      });
      if (fnErr) throw fnErr;
      const text = data?.interpretation ?? '无法获取解读结果，请重试。';
      setInterpretation(text);
      if (session) await saveTestResult(
        session.user.id, 'htp',
        { image: '(已保存)', interpretation: text }, // 保存完整解读供测评档案展示
        0,
        text.slice(0, 200),
      );
    } catch (err: any) {
      console.error('HTP解读失败:', err);
      setInterpretation(`AI解读服务暂时不可用（${err?.message ?? '未知错误'}），请稍后重试。`);
    }
    setStep('result');
  };

  const handleInterpretUpload = async () => {
    if (uploadedBase64) { await handleInterpretFromBase64(uploadedBase64); return; }
    setStep('interpreting');
    setInterpretation('AI解读服务暂时不可用，请重新选择图片后重试。');
    setStep('result');
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
              <View className="h-44 bg-purple-50 items-center justify-center">
                <Text style={{ fontSize: 56 }}>🏠🌲🧍</Text>
              </View>
              <View className="px-6 pt-6 pb-28">
                <Text className="text-2xl font-bold text-foreground mb-2">房树人测试（HTP）</Text>
                <Text className="text-muted-foreground text-sm leading-6 mb-5">
                  房树人（House-Tree-Person）是一种经典的心理投射测试。通过你的绘画或上传作品，AI将基于色彩、比例、构图给出专属的心灵解读。
                </Text>

                {/* 绘画步骤引导卡 */}
                <View className="bg-card rounded-2xl p-4 mb-4"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }] }}>
                  <Text className="text-foreground font-bold text-sm mb-3">🎨 绘画步骤引导</Text>
                  {DRAW_STEPS.map((s, i) => (
                    <View key={i} className="flex-row items-start gap-3 mb-3 last:mb-0">
                      <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
                        <Text className="text-base">{s.emoji}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground text-sm font-semibold">{s.label}</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5 leading-4">{s.hint}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* 相册上传区 */}
                <View className="bg-card rounded-2xl p-4 mb-4"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }] }}>
                  <Text className="text-foreground font-bold text-sm mb-3">📷 或上传已有画作</Text>
                  {uploadedUri ? (
                    <View className="gap-3">
                      <Image source={{ uri: uploadedUri }} className="w-full rounded-xl"
                        style={{ height: 160 }} contentFit="cover" />
                      <View className="flex-row gap-2">
                        <Pressable className="flex-1 bg-muted rounded-xl py-2.5 items-center" onPress={handlePickImage}>
                          <Text className="text-foreground text-sm font-medium">重新选择</Text>
                        </Pressable>
                        <Pressable className="flex-1 bg-primary rounded-xl py-2.5 items-center" onPress={handleInterpretUpload}>
                          <Text className="text-primary-foreground text-sm font-bold">解读此画</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      className="border-2 border-dashed border-border rounded-xl py-8 items-center gap-2"
                      onPress={handlePickImage}>
                      <ImageIcon size={28} color="#9CA3AF" />
                      <Text className="text-muted-foreground text-sm">点击从相册选择图片</Text>
                      <Text className="text-muted-foreground text-xs">支持之前画好的房树人画作</Text>
                    </Pressable>
                  )}
                </View>

                <View className="bg-amber-50 rounded-2xl p-4 mb-5">
                  <Text className="text-amber-800 font-semibold text-sm mb-1">⚠️ 免责声明</Text>
                  <Text className="text-amber-700 text-xs leading-5">
                    房树人测试是趣味性心理投射工具，解读仅供自我探索参考，不作为任何诊断依据。
                  </Text>
                </View>

                <Pressable
                  className="bg-primary rounded-2xl py-4 items-center flex-row justify-center gap-2"
                  onPress={() => {
                    if (subLevel < 1) {
                      setUpgradeVisible(true);
                      return;
                    }
                    setDrawStep(0);
                    setStep('drawing');
                  }}>
                  <Pencil size={18} color="white" />
                  <Text className="text-primary-foreground font-bold text-base">
                    {subLevel >= 1 ? '开始手绘' : '🔒 解锁心愈版开始手绘'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
            <UpgradeModal
              visible={upgradeVisible}
              onClose={() => setUpgradeVisible(false)}
              requiredLevel={1}
              featureName="房树人绘画心理测试"
              featureDesc="房树人测验为心愈版专享功能，开通心愈版会员即可体验全功能自由手绘与 AI 投射深度解读报告。"
            />
          </>
        )}

        {/* ── 手绘画板页 ── */}
        {step === 'drawing' && (
          <View style={{ flex: 1 }}>
            {/* 顶部导航：纯净模式时隐藏 */}
            {!pureMode && (
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
                flexDirection: 'row', alignItems: 'center',
                paddingTop: 48, paddingBottom: 10, paddingHorizontal: 16,
                backgroundColor: 'rgba(247,245,240,0.88)',
              }}>
                <Pressable onPress={() => setStep('intro')}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <ArrowLeft size={18} color="#6B7280" />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: '#1F2937' }}>
                    {DRAW_STEPS[drawStep]?.label ?? '完成所有步骤后点击「AI解读」'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {DRAW_STEPS[drawStep]?.hint ?? '你的画作将提交AI解读'}
                  </Text>
                </View>
              </View>
            )}
            {/* 步骤进度：纯净模式时隐藏 */}
            {!pureMode && (
              <View style={{
                position: 'absolute', top: 104, left: 0, right: 0, zIndex: 20,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                paddingVertical: 6,
                backgroundColor: 'rgba(247,245,240,0.88)',
              }}>
                {DRAW_STEPS.map((s, i) => (
                  <Pressable key={i} onPress={() => setDrawStep(i)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{
                      width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: i === drawStep ? '#E8A365' : i < drawStep ? 'rgba(232,163,101,0.4)' : 'rgba(0,0,0,0.07)',
                    }}>
                      <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>{i < drawStep ? '✓' : String(i + 1)}</Text>
                    </View>
                    <Text style={{ fontSize: 13 }}>{s.emoji}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setDrawStep(d => Math.min(2, d + 1))}
                  style={{ backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 4 }}>
                  <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {drawStep < 2 ? '下一步 →' : '最后一步'}
                  </Text>
                </Pressable>
              </View>
            )}
            {/* 原生画板 */}
            <DrawingCanvas
              bgColor="#F7F5F0"
              submitLabel="完成解读"
              submitColor="#E8A365"
              topReservedHeight={0}
              onExport={handleInterpretFromBase64}
              onPureModeChange={setPureMode}
            />
          </View>
        )}

        {/* ── AI解读中 ── */}
        {step === 'interpreting' && (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-4xl mb-6">🔮</Text>
            <ActivityIndicator size="large" color="#E8A365" />
            <Text className="text-foreground font-semibold text-lg mt-5 mb-2">AI正在解读你的画作...</Text>
            <Text className="text-muted-foreground text-sm text-center leading-5">
              正在分析房屋结构、树木形态与人物特征，生成你的专属解读
            </Text>
          </View>
        )}

        {/* ── 解读结果 ── */}
        {step === 'result' && (
          <>
            <Pressable onPress={() => router.back()}
              className="absolute top-14 left-4 z-10 w-9 h-9 rounded-full bg-white/90 items-center justify-center">
              <ArrowLeft size={18} color="#6B7280" />
            </Pressable>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 72, paddingBottom: 48 }}>
              <View className="items-center mb-6">
                <Text className="text-5xl mb-3">🖼️</Text>
                <Text className="text-foreground font-bold text-xl">AI解读报告</Text>
                <Text className="text-muted-foreground text-sm mt-1">基于你的房树人画作</Text>
              </View>
              {(uploadedUri || drawnUri) ? (
                <Image source={{ uri: uploadedUri || drawnUri }} className="w-full rounded-2xl mb-4"
                  style={{ height: 160 }} contentFit="cover" />
              ) : null}
              <View className="bg-card rounded-3xl p-5 mb-4"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
                <Text className="text-foreground text-sm leading-7">{interpretation}</Text>
              </View>

              {/* 专家深度陪伴推荐 */}
              <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#E8A36515' }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <Text className="text-base">🌻</Text>
                  <Text className="text-foreground font-semibold text-sm">想更深入探索这幅画的含义？</Text>
                </View>
                <Text className="text-muted-foreground text-xs leading-5 mb-3">
                  房树人是投射性绘画测验，AI 解读仅为初步分析。以下专家可以读取你的画面内容，结合心理学视角为你进行更深层的探索与陪伴：
                </Text>
                <View className="gap-2">
                  {([
                    { key: 'jung',    name: '荣格',  desc: '分析心理学 · 潜意识与原型探索', emoji: '🌑', color: '#9B8EC4' },
                    { key: 'rogers', name: '罗杰斯', desc: '人本主义 · 无条件接纳与陪伴',   emoji: '🌻', color: '#E8A365' },
                    { key: 'perls',  name: '皮尔斯', desc: '格式塔疗法 · 整合身心感知',      emoji: '🌿', color: '#7A9D8C' },
                  ] as const).map(e => (
                    <Pressable
                      key={e.key}
                      className="flex-row items-center gap-2 bg-card rounded-xl px-3 py-2.5 active:opacity-80"
                      onPress={() => router.push({
                        pathname: '/(app)/chat/[persona]' as any,
                        params: {
                          persona: e.key,
                          contextHint: `用户刚完成了房树人绘画测试，AI解读摘要：${interpretation.slice(0, 200)}`,
                        },
                      })}
                    >
                      <View className="w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: e.color + '25' }}>
                        <Text style={{ fontSize: 16 }}>{e.emoji}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground text-xs font-semibold">{e.name}</Text>
                        <Text className="text-muted-foreground text-xs">{e.desc}</Text>
                      </View>
                      <Text className="text-primary text-xs font-medium">咨询 →</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="bg-amber-50 rounded-2xl p-4 mb-6">
                <Text className="text-amber-800 font-semibold text-sm mb-1">⚠️ 重要免责声明</Text>
                <Text className="text-amber-700 text-xs leading-5">
                  房树人测试是趣味性心理投射工具，解读仅供自我探索参考，不作为任何诊断或评估依据。如有需要请咨询专业心理咨询师。
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Pressable className="flex-1 bg-muted rounded-2xl py-3.5 items-center"
                  onPress={() => { setUploadedUri(''); setUploadedBase64(null); setStep('intro'); }}>
                  <Text className="text-foreground font-medium">重新测试</Text>
                </Pressable>
                <Pressable className="flex-1 bg-primary rounded-2xl py-3.5 items-center"
                  onPress={() => router.back()}>
                  <Text className="text-primary-foreground font-bold">返回</Text>
                </Pressable>
              </View>
            </ScrollView>
          </>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
