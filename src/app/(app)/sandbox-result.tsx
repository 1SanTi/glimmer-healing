/**
 * 沙盘游戏室 AI 解读结果页
 * 接收来自 sandbox.tsx 的截图（via sandboxStore），调用 image-understanding + sandbox-interpret
 * 完成后可选：回传咨询师 | 自主模式推荐咨询师
 */
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Brain, MessageCircle, UserCheck, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getSandboxCapture, clearSandboxCapture } from '@/lib/sandboxStore';
import { EXPERTS } from '@/lib/constants';
import { saveTestResult } from '@/db/api';
import { useSession } from '@/ctx';
import { checkAndConsumeCredits } from '@/hooks/useAiQuota';

type Step = 'loading' | 'result' | 'error';

export default function SandboxResultScreen() {
  const router = useRouter();
  const { session } = useSession();

  const capture = getSandboxCapture();
  const base64 = capture?.base64 ?? '';
  const objectsCount = capture?.objectsCount ?? 0;
  const returnExpertId = capture?.returnExpertId;

  const [step, setStep] = useState<Step>('loading');
  const [interpretation, setInterpretation] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // 两步解读：image-understanding → sandbox-interpret
  useEffect(() => {
    if (!base64) {
      setErrMsg('未获取到沙盘截图，请返回重试。');
      setStep('error');
      return;
    }
    (async () => {
      try {
        // 截取 base64 数据部分（去掉 data:image/png;base64, 前缀）
        const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

        // 校验并扣减每日 AI 积分（每次解读消耗 5 点积分）
        const quota = await checkAndConsumeCredits(5);
        if (!quota.allowed) {
          setErrMsg(quota.message || '今日 AI 积分不足（单次解读消耗5点），每日 24:00 自动重置。升级心愈版或工作台版享更多额度。');
          setStep('error');
          return;
        }

        // Step 1: 提交图像理解请求
        const { data: reqData, error: reqErr } = await supabase.functions.invoke(
          'image-understanding-request',
          { body: { question: '请详细描述这个沙盘场景中的物件布局、构图、空间分布和色彩氛围', image: rawBase64 } },
        );
        if (reqErr || !reqData?.result?.task_id) throw new Error(reqErr?.message ?? '提交图像理解失败');
        const taskId: string = reqData.result.task_id;

        // Step 2: 轮询图像理解结果
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

        // Step 3: 调用 sandbox-interpret 生成心理解读
        const { data, error: fnErr } = await supabase.functions.invoke('sandbox-interpret', {
          body: { image_description: description },
        });
        if (fnErr) throw fnErr;
        const text = data?.interpretation ?? '无法获取解读结果，请重试。';
        setInterpretation(text);
        setStep('result');
        // 保存到测评档案
        if (session?.user?.id) {
          await saveTestResult(
            session.user.id, 'sandbox',
            { interpretation: text, objectsCount },
            0, text.slice(0, 100),
          );
        }
      } catch (e: any) {
        console.error('沙盘解读失败:', e);
        setErrMsg(e?.message ?? '解读服务暂时不可用，请稍后重试');
        setStep('error');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 回传咨询师：带 sandboxContext 返回聊天页
  const handleReturnToExpert = () => {
    if (!returnExpertId) return;
    const ctx = encodeURIComponent(JSON.stringify({
      sandboxTitle: `沙盘创作（${objectsCount} 件物件）`,
      aiAnalysis: interpretation,
    }));
    clearSandboxCapture();
    router.replace(`/(app)/chat/${returnExpertId}?sandboxContext=${ctx}` as RelativePathString);
  };

  // 自主模式：推荐咨询师列表
  const handleViewExperts = () => {
    clearSandboxCapture();
    router.push('/(app)/home' as RelativePathString);
  };

  const isWeb = process.env.EXPO_OS === 'web';
  const topPt = isWeb ? 20 : 56;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View
        className="absolute top-0 left-0 right-0 flex-row items-center gap-3 px-4 pb-3 z-10"
        style={{ paddingTop: topPt, backgroundColor: 'rgba(255,255,255,0.95)' }}
      >
        <Pressable onPress={() => { clearSandboxCapture(); router.back(); }}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="flex-1 text-foreground font-bold text-base">沙盘解读报告</Text>
        <Brain size={20} color="#9B8EC4" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: topPt + 60, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 沙盘截图预览 */}
        {base64 ? (
          <View className="mx-5 rounded-3xl overflow-hidden mb-5"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.12)' }] }}>
            <Image
              source={{ uri: base64 }}
              style={{ width: '100%', height: 220 }}
              contentFit="cover"
            />
            <View className="absolute bottom-0 left-0 right-0 px-4 py-3"
              style={{ backgroundColor: 'rgba(26,15,5,0.55)' }}>
              <Text style={{ color: '#F5E6C8', fontSize: 12, fontWeight: '600' }}>
                🏖 我的沙盘 · {objectsCount} 件物件
              </Text>
            </View>
          </View>
        ) : null}

        {/* 加载状态 */}
        {step === 'loading' && (
          <View className="mx-5 bg-card rounded-3xl p-8 items-center gap-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
            <ActivityIndicator size="large" color="#9B8EC4" />
            <Text className="text-foreground font-semibold text-base text-center">AI 正在解读你的沙盘…</Text>
            <Text className="text-muted-foreground text-sm text-center leading-6">
              正在分析沙盘构图、物件意象与情感氛围{'\n'}通常需要 15–30 秒，请耐心等待
            </Text>
            {/* 进度提示 */}
            <View className="w-full rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#F3F0FF' }}>
              <View className="h-full rounded-full" style={{ width: '60%', backgroundColor: '#9B8EC4' }} />
            </View>
          </View>
        )}

        {/* 错误状态 */}
        {step === 'error' && (
          <View className="mx-5 bg-card rounded-3xl p-6 items-center gap-3"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
            <Text style={{ fontSize: 40 }}>😔</Text>
            <Text className="text-foreground font-semibold text-base text-center">解读暂时不可用</Text>
            <Text className="text-muted-foreground text-sm text-center leading-6">{errMsg}</Text>
            <Pressable
              onPress={() => { clearSandboxCapture(); router.back(); }}
              className="rounded-xl px-6 py-3 mt-2"
              style={{ backgroundColor: '#9B8EC420', borderWidth: 1, borderColor: '#9B8EC460' }}>
              <Text style={{ color: '#9B8EC4', fontWeight: '700', fontSize: 14 }}>返回重试</Text>
            </Pressable>
          </View>
        )}

        {/* 解读结果 */}
        {step === 'result' && (
          <>
            {/* 标题卡 */}
            <View className="mx-5 rounded-3xl p-5 mb-4"
              style={{
                backgroundColor: '#F5F0FC',
                boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(155,142,196,0.15)' }],
              }}>
              <View className="flex-row items-center gap-2 mb-3">
                <Brain size={18} color="#9B8EC4" />
                <Text style={{ color: '#9B8EC4', fontSize: 13, fontWeight: '700' }}>AI 沙盘疗愈解读</Text>
              </View>
              <Text className="text-foreground text-sm leading-7">{interpretation}</Text>
            </View>

            {/* 提示说明 */}
            <View className="mx-5 rounded-2xl p-4 mb-5"
              style={{ backgroundColor: '#FFF8EE', borderWidth: 1, borderColor: '#F0DDB0' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#9A7430', marginBottom: 4 }}>💡 温馨说明</Text>
              <Text style={{ fontSize: 12, color: '#B28840', lineHeight: 20 }}>
                以上解读仅供自我探索参考，不构成心理诊断。
                每个人的沙盘都是独一无二的，如需更深入的探索，
                建议与专业心理咨询师共同分析。
              </Text>
            </View>

            {/* CTA 区域 */}
            {returnExpertId ? (
              // 有来源咨询师 → 显示回传按钮
              <View className="mx-5 gap-3">
                <Pressable
                  onPress={handleReturnToExpert}
                  className="rounded-2xl py-4 flex-row items-center justify-center gap-2"
                  style={{ backgroundColor: '#9B8EC4' }}>
                  <MessageCircle size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>
                    将解读结果回传给咨询师
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { clearSandboxCapture(); router.back(); }}
                  className="rounded-2xl py-3.5 items-center"
                  style={{ backgroundColor: '#9B8EC420', borderWidth: 1, borderColor: '#9B8EC440' }}>
                  <Text style={{ color: '#9B8EC4', fontSize: 14, fontWeight: '600' }}>返回沙盘继续创作</Text>
                </Pressable>
              </View>
            ) : (
              // 自主模式 → 推荐咨询师
              <View className="mx-5 gap-3">
                <Text className="text-foreground font-bold text-base mb-1">✨ 推荐匹配咨询师</Text>
                <Text className="text-muted-foreground text-sm mb-3 leading-5">
                  基于你的沙盘创作，以下咨询师擅长通过投射性工具探索内心世界
                </Text>
                {EXPERTS.slice(0, 3).map(expert => (
                  <Pressable
                    key={expert.id}
                    onPress={() => {
                      const ctx = encodeURIComponent(JSON.stringify({
                        sandboxTitle: `沙盘创作（${objectsCount} 件物件）`,
                        aiAnalysis: interpretation,
                      }));
                      clearSandboxCapture();
                      router.push(`/(app)/chat/${expert.id}?sandboxContext=${ctx}` as RelativePathString);
                    }}
                    className="bg-card rounded-2xl p-4 flex-row items-center gap-3"
                    style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }] }}
                  >
                    <View className="w-12 h-12 rounded-full items-center justify-center"
                      style={{ backgroundColor: expert.color + '20' }}>
                      <Text style={{ fontSize: 26 }}>{expert.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-bold text-sm">{expert.name}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">{expert.school}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{expert.style}</Text>
                    </View>
                    <ChevronRight size={16} color="#9CA3AF" />
                  </Pressable>
                ))}
                <Pressable
                  onPress={handleViewExperts}
                  className="rounded-2xl py-3.5 items-center"
                  style={{ backgroundColor: '#9B8EC420', borderWidth: 1, borderColor: '#9B8EC440' }}>
                  <Text style={{ color: '#9B8EC4', fontSize: 14, fontWeight: '600' }}>查看更多咨询师</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
