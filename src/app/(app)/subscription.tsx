import { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Modal,
  ActivityIndicator, Dimensions, StyleSheet, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path } from 'react-native-svg';
import {
  ArrowLeft, Crown, Sparkles, Zap, Check,
  Heart, BookOpen, Users, BarChart3, BrainCircuit,
  Shield, Palette, Star, Gift, X, ClipboardPaste,
} from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AiQuotaCard } from '@/components/AiQuotaCard';

const { width: SCREEN_W } = Dimensions.get('window');

// ── 类型 ──────────────────────────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  description: string;
  level: number;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  highlight: boolean;
  color: string;
}

interface UserSub {
  plan_id: string;
  status: string;
  expires_at: string | null;
}

// ── 设计令牌 ──────────────────────────────────────────────────────
const PALETTE = {
  free:  { primary: '#8B92A5', bg: '#F8F9FC', card: '#FFFFFF', text: '#6B7280' },
  basic: { primary: '#7C6FCD', bg: '#F5F3FF', card: '#7C6FCD', text: '#FFFFFF' },
  pro:   { primary: '#D4845A', bg: '#FFF7F0', card: '#E8A365', text: '#FFFFFF' },
};

const PLAN_LABELS: Record<string, string> = {
  free: '体验版', basic: '心愈版', pro: 'AI工作台版', light: '轻享版',
};

const FEATURE_ICON_MAP: [string, any][] = [
  ['AI专家', BrainCircuit], ['OH卡', Heart], ['沙盘', Palette], ['音乐', Star],
  ['梦境', Star], ['心灵', Palette], ['亲密', Users], ['测评', BarChart3],
  ['冰山', BrainCircuit], ['暴力沟通', Users], ['心绘', Palette],
  ['工作台', BrainCircuit], ['备课', BookOpen], ['课件', BookOpen],
  ['档案', Users], ['家校', Users], ['班会', BookOpen],
  ['量表', BarChart3], ['危机', Shield], ['含', Check],
];

function pickFeatIcon(text: string): any {
  for (const [k, Icon] of FEATURE_ICON_MAP) {
    if (text.includes(k)) return Icon;
  }
  return Check;
}

// ── SVG 装饰背景 ──────────────────────────────────────────────────
function CardDecoration({ color, width }: { color: string; width: number }) {
  return (
    <Svg width={width} height={120} style={{ position: 'absolute', top: 0, right: 0 }}>
      <Circle cx={width - 20} cy={-10} r={80} fill={`${color}18`} />
      <Circle cx={width + 10} cy={60} r={50} fill={`${color}10`} />
    </Svg>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [plans, setPlans]           = useState<Plan[]>([]);
  const [userSub, setUserSub]       = useState<UserSub | null>(null);
  const [loading, setLoading]       = useState(true);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [payError, setPayError]     = useState<string | null>(null);
  const [showNativeHint, setShowNativeHint] = useState(false);
  const [billingYearly, setBillingYearly] = useState(true);
  const pendingOrderRef = useRef<string | null>(null);

  // 兑换码 Modal 状态
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);

  // 支付返回后主动查询订单状态（异步通知兜底 + 防重复支付）
  const confirmOrder = useCallback(async (outTradeNo: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('alipay-query', {
        body: { outTradeNo },
      });
      if (error) return;
      if (data?.status === 'paid') {
        const { data: subData } = await supabase
          .from('user_subscriptions')
          .select('plan_id, status, expires_at')
          .eq('user_id', session!.user.id)
          .maybeSingle();
        setUserSub(subData as UserSub | null);
        pendingOrderRef.current = null;
      }
    } catch { /* 忽略查询异常，等待异步通知 */ }
  }, [session]);

  // 格式化与清洗兑换码（去除各种空格、制表符、中英文全半角破折号）
  const formatCleanCode = (raw: string): string => {
    let s = raw.replace(/[\s\r\n\t]/g, '').toUpperCase();
    s = s.replace(/[—－_]/g, '-');
    return s;
  };

  // 手机端一键读取剪贴板并填入
  const handlePasteClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        const cleaned = formatCleanCode(text);
        setRedeemCode(cleaned);
        setRedeemError(null);
      }
    } catch {
      // 剪贴板异常忽略
    }
  };

  // 兑换码兑换逻辑
  const handleRedeem = useCallback(async () => {
    const cleanedCode = formatCleanCode(redeemCode);
    if (!cleanedCode) return;
    setRedeemLoading(true);
    setRedeemError(null);
    setRedeemSuccess(null);
    try {
      const { data, error } = await supabase.rpc('redeem_code', {
        p_code: cleanedCode,
      });
      if (error) { setRedeemError(error.message); return; }
      const result = data as { ok: boolean; error?: string; plan_id?: string; plan_name?: string; expires_at?: string };
      if (!result.ok) { setRedeemError(result.error ?? '兑换失败'); return; }
      const planName = result.plan_name || (({ basic: '心愈版', pro: 'AI工作台版' } as Record<string,string>)[result.plan_id ?? ''] ?? result.plan_id);
      const expiry = result.expires_at ? new Date(result.expires_at).toLocaleDateString('zh-CN') : '永久';
      setRedeemSuccess(`🎉 成功解锁 ${planName}！有效期至 ${expiry}`);
      // 立即刷新订阅状态
      if (session) {
        const { data: sub } = await supabase.from('user_subscriptions')
          .select('plan_id, status, expires_at').eq('user_id', session.user.id).maybeSingle();
        setUserSub(sub as UserSub | null);
      }
    } catch (err: any) {
      setRedeemError(err?.message || '网络连接异常，请重试');
    } finally {
      setRedeemLoading(false);
    }
  }, [redeemCode, session]);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const [{ data: plansData }, { data: subData }] = await Promise.all([
        supabase.from('subscription_plans').select('*').order('level'),
        session
          ? supabase.from('user_subscriptions')
              .select('plan_id, status, expires_at')
              .eq('user_id', session.user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setPlans((plansData as Plan[]) ?? []);
      setUserSub(subData as UserSub | null);
      setLoading(false);

      // 若存在未确认的订单，主动查询兜底
      if (pendingOrderRef.current && session) {
        await confirmOrder(pendingOrderRef.current);
      }
    })();
  }, [session, confirmOrder]));

  const isSubActive = userSub?.status === 'active' && (!userSub.expires_at || new Date(userSub.expires_at) > new Date());
  const currentPlanId = isSubActive ? (userSub?.plan_id ?? 'free') : 'free';
  const currentPlan   = plans.find(p => p.id === currentPlanId) ?? plans.find(p => p.id === 'free');

  const handlePay = async (plan: Plan) => {
    if (process.env.EXPO_OS !== 'web') {
      setShowNativeHint(true);
      return;
    }
    setPayingPlanId(plan.id);
    setPayError(null);
    try {
      const g = globalThis as any;
      const returnUrl = `${g.window.location.origin}/subscription`;
      const { data, error } = await supabase.functions.invoke('alipay-pay', {
        body: {
          planId: plan.id,
          billingCycle: billingYearly ? 'yearly' : 'monthly',
          returnUrl,
        },
      });
      if (error) throw error;
      if (data?.formHtml) {
        pendingOrderRef.current = data.outTradeNo ?? null;
        const blob = new g.Blob([data.formHtml], { type: 'text/html;charset=utf-8' });
        const blobUrl = g.URL.createObjectURL(blob);
        g.window.location.href = blobUrl;
        setTimeout(() => g.URL.revokeObjectURL(blobUrl), 5000);
      }
    } catch (e: any) {
      setPayError(e?.message ?? '支付发起失败');
    } finally {
      setPayingPlanId(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#7C6FCD" />
      </View>
    );
  }

  const visiblePlans = plans.filter(p => p.id !== 'light');

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F4FB' }}>
      <StatusBar style="dark" />

      {/* ── 顶部导航栏 ─────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
        <Pressable onPress={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEEAF8', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <ArrowLeft size={17} color="#5B4FA0" />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 19, fontWeight: '800', color: '#1A1340' }}>会员套餐</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }}>

        {/* ── 当前套餐状态 ────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={{
            borderRadius: 24, marginBottom: 20, overflow: 'hidden',
            backgroundColor: currentPlan?.color ?? '#7C6FCD',
            boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 30, color: (currentPlan?.color ?? '#7C6FCD') + '50' }],
          }}>
            <CardDecoration color="#ffffff" width={SCREEN_W - 32} />
            <View style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                  {currentPlan?.level === 0 ? <Sparkles size={22} color="#fff" />
                    : currentPlan?.level === 1 ? <Crown size={22} color="#fff" />
                    : <Zap size={22} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>当前套餐</Text>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{currentPlan?.name ?? '体验版'}</Text>
                </View>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 12, lineHeight: 18 }}>
                {userSub?.expires_at
                  ? `有效期至 ${new Date(userSub.expires_at).toLocaleDateString('zh-CN')}`
                  : currentPlanId !== 'free'
                  ? '永久有效'
                  : '输入兑换码即可解锁心愈版或工作台版'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── 今日 AI 额度进度卡片 ─────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400).delay(40)} style={{ marginBottom: 18 }}>
          <AiQuotaCard />
        </Animated.View>

        {/* ── 年/月 切换 ──────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400).delay(80)}
          style={{ flexDirection: 'row', backgroundColor: '#EDE9FB', borderRadius: 18, padding: 4, marginBottom: 20 }}>
          {(['年付', '月付'] as const).map((label, i) => {
            const isYearly = i === 0;
            const active   = billingYearly === isYearly;
            return (
              <Pressable key={label} onPress={() => setBillingYearly(isYearly)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 14,
                  backgroundColor: active ? '#7C6FCD' : 'transparent',
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : '#9CA3AF' }}>{label}</Text>
                {isYearly && (
                  <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'rgba(232,163,101,0.2)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: active ? '#fff' : '#E8A365' }}>省更多</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </Animated.View>

        {/* ── 套餐卡片列表 ────────────────────────────── */}
        {visiblePlans.map((plan, idx) => {
          const isCurrent = currentPlanId === plan.id && userSub?.status === 'active';
          const price     = billingYearly ? plan.price_yearly : plan.price_monthly;
          const isPro     = plan.id === 'pro';
          const isBasic   = plan.id === 'basic';
          const isFree    = plan.level === 0;
          const pal       = PALETTE[plan.id as keyof typeof PALETTE] ?? PALETTE.free;
          const monthlyEq = billingYearly && plan.price_yearly > 0
            ? (plan.price_yearly / 100 / 12).toFixed(1) : null;

          return (
            <Animated.View key={plan.id}
              entering={FadeInDown.duration(420).delay(130 + idx * 90)}
              style={{
                borderRadius: 28, marginBottom: 16, overflow: 'hidden',
                backgroundColor: '#fff',
                boxShadow: isCurrent
                  ? [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: plan.color + '90' }]
                  : [{ offsetX: 0, offsetY: 6, blurRadius: 20, color: 'rgba(0,0,0,0.07)' }],
              }}>

              {/* 卡头 – 彩色区 */}
              <View style={{ backgroundColor: isFree ? '#F8F7FE' : plan.color, padding: 22, overflow: 'hidden', position: 'relative' }}>
                {!isFree && <CardDecoration color="#ffffff" width={SCREEN_W - 32} />}

                {/* 推荐角标 */}
                {isBasic && !isCurrent && (
                  <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.28)', paddingHorizontal: 12, paddingVertical: 5, borderBottomLeftRadius: 16 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>⭐ 最受欢迎</Text>
                  </View>
                )}
                {isPro && !isCurrent && (
                  <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 5, borderBottomLeftRadius: 16 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>🎓 教师首选</Text>
                  </View>
                )}
                {isCurrent && (
                  <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'rgba(34,197,94,0.85)', paddingHorizontal: 12, paddingVertical: 5, borderBottomLeftRadius: 16 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓ 已激活</Text>
                  </View>
                )}

                {/* 套餐名称行 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 14,
                    backgroundColor: isFree ? pal.primary + '15' : 'rgba(255,255,255,0.25)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isFree ? <Sparkles size={20} color={pal.primary} />
                      : isBasic ? <Crown size={20} color="#fff" />
                      : <Zap size={20} color="#fff" />}
                  </View>
                  <View>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: isFree ? '#1A1340' : '#fff', letterSpacing: -0.3 }}>
                      {plan.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: isFree ? '#9CA3AF' : 'rgba(255,255,255,0.75)', marginTop: 1 }}>
                      {plan.description}
                    </Text>
                  </View>
                </View>

                {/* 价格区 */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 }}>
                  {isFree ? (
                    <Text style={{ fontSize: 38, fontWeight: '900', color: pal.primary, letterSpacing: -1 }}>免费</Text>
                  ) : (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginBottom: 7 }}>¥</Text>
                      <Text style={{ fontSize: 46, fontWeight: '900', color: '#fff', letterSpacing: -2 }}>
                        {Number.isInteger(price / 100) ? (price / 100).toFixed(0) : (price / 100).toFixed(1)}
                      </Text>
                      <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>
                        {billingYearly ? '/年' : '/月'}
                      </Text>
                    </>
                  )}
                </View>
                {monthlyEq && !isFree && (
                  <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                      平均 ¥{monthlyEq}/月
                    </Text>
                    {billingYearly && (
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
                          比月付省{Math.round((1 - plan.price_yearly / plan.price_monthly / 12) * 100)}%
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* 功能列表区 – 白色 */}
              <View style={{ padding: 20, gap: 10 }}>
                {/* 每日 AI 积分额度专属亮标 */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: isPro ? '#FFF5EC' : isBasic ? '#F3F0FA' : '#F9FAFB',
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                  borderWidth: 1, borderColor: isPro ? '#FCD8B8' : isBasic ? '#DDD6FE' : '#E5E7EB',
                  marginBottom: 4,
                }}>
                  <Zap size={15} color={isPro ? '#E07A5F' : isBasic ? '#7C6FCD' : '#6B7280'} />
                  <Text style={{
                    fontSize: 13, fontWeight: '700',
                    color: isPro ? '#C8664B' : isBasic ? '#6154B5' : '#4B5563',
                  }}>
                    {isPro ? '每日 100 点 AI 积分 · 支持20次对话/解读' : isBasic ? '每日 50 点 AI 积分 · 支持10次对话/解读' : '每日 5 点 AI 积分 · 支持1次体验'}
                  </Text>
                </View>

                {plan.features.map((feat, fi) => {
                  const FIcon = pickFeatIcon(feat);
                  const isInherited = feat.startsWith('含');
                  return (
                    <View key={fi} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <View style={{
                        width: 22, height: 22, borderRadius: 11, marginTop: 1, flexShrink: 0,
                        backgroundColor: isInherited ? '#F3F4F6' : plan.color + '15',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <FIcon size={12} color={isInherited ? '#9CA3AF' : plan.color} strokeWidth={2.5} />
                      </View>
                      <Text style={{
                        flex: 1, fontSize: 14, lineHeight: 20, fontWeight: isInherited ? '400' : '500',
                        color: isInherited ? '#9CA3AF' : '#2D2D3A',
                      }}>
                        {feat}
                      </Text>
                    </View>
                  );
                })}

                {/* 支付按钮：未激活时「立即开通」，已激活时「续费」— 始终橙色+白字 */}
                {plan.level > 0 && (
                  <View>
                    <Pressable
                      onPress={() => handlePay(plan)}
                      disabled={payingPlanId === plan.id}
                      style={{
                        marginTop: 10, paddingVertical: 14, borderRadius: 18,
                        backgroundColor: plan.color,
                        alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                        opacity: payingPlanId === plan.id ? 0.7 : 1,
                        boxShadow: [{ offsetX: 0, offsetY: 5, blurRadius: 14, color: plan.color + '55' }],
                      }}>
                      {payingPlanId === plan.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <>
                            <Text style={{
                              color: '#fff',
                              fontWeight: '800', fontSize: 15, letterSpacing: 0.2,
                            }}>
                              {isCurrent ? '续费' : '立即开通'}
                            </Text>
                            <Text style={{
                              color: 'rgba(255,255,255,0.85)',
                              fontWeight: '600', fontSize: 13,
                            }}>
                              {billingYearly ? '年付' : '月付'}
                            </Text>
                          </>
                      }
                    </Pressable>
                    {isCurrent && (
                      <Text style={{ color: '#9CA3AF', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
                        续费将在当前有效期结束后顺延
                      </Text>
                    )}
                    {payError && payingPlanId === null && (
                      <Text style={{ color: '#DC2626', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                        {payError}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </Animated.View>
          );
        })}

        <Text style={{ textAlign: 'center', color: '#C4BADB', fontSize: 12, lineHeight: 18, marginTop: 4 }}>
          支付宝安全支付 · 支付成功后自动开通对应套餐
        </Text>

        {/* 兑换码入口 */}
        <Pressable
          onPress={() => { setRedeemCode(''); setRedeemError(null); setRedeemSuccess(null); setShowRedeemModal(true); }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, borderColor: '#E8A36555', backgroundColor: '#FFF7F0' }}>
          <Gift size={16} color="#E8A365" />
          <Text style={{ color: '#E8A365', fontWeight: '700', fontSize: 14 }}>使用兑换码激活</Text>
        </Pressable>

        {/* 兑换码 Modal（防键盘遮挡 + 自动居中适配） */}
        <Modal
          visible={showRedeemModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRedeemModal(false)}
        >
          <KeyboardAvoidingView
            behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ width: '100%' }}
            >
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 24,
                  padding: 24,
                  width: '100%',
                  maxWidth: 380,
                  gap: 16,
                  boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 25, color: 'rgba(0,0,0,0.15)' }],
                }}>
                {/* 标题栏 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF7F0', alignItems: 'center', justifyContent: 'center' }}>
                      <Gift size={20} color="#E8A365" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: '#1A1340' }}>输入兑换码</Text>
                      <Text style={{ fontSize: 11, color: '#A09B94', marginTop: 1 }}>激活心愈版或 AI工作台版</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setShowRedeemModal(false)} style={{ padding: 6, borderRadius: 12, backgroundColor: '#F3F0E6' }}>
                    <X size={16} color="#7C7670" />
                  </Pressable>
                </View>

                {/* 输入框 + 一键粘贴操作栏 */}
                <View style={{ gap: 8 }}>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      style={{
                        borderWidth: 1.5,
                        borderColor: redeemError ? '#DC2626' : '#E8A36566',
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        paddingRight: 75,
                        fontSize: 15,
                        fontWeight: '700',
                        letterSpacing: 1.5,
                        color: '#1A1340',
                        backgroundColor: '#FFFAF5',
                        fontFamily: 'monospace',
                      }}
                      placeholder="输入或粘贴兑换码"
                      placeholderTextColor="#C9B99F"
                      value={redeemCode}
                      onChangeText={v => { setRedeemCode(formatCleanCode(v)); setRedeemError(null); }}
                      maxLength={32}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={handlePasteClipboard}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: 9,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        backgroundColor: '#FFF7F0',
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#E8A36540',
                      }}>
                      <ClipboardPaste size={12} color="#E8A365" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#E8A365' }}>粘贴</Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 11, color: '#A09B94', lineHeight: 15 }}>
                    💡 提示：支持带横杠或纯字母数字，直接粘贴即可自动识别
                  </Text>
                </View>

                {/* 错误/成功提示 */}
                {redeemError ? (
                  <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 10 }}>
                    <Text style={{ color: '#DC2626', fontSize: 12, textAlign: 'center', fontWeight: '500' }}>
                      {redeemError}
                    </Text>
                  </View>
                ) : null}

                {redeemSuccess ? (
                  <View style={{ backgroundColor: '#ECFDF5', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#A7F3D0' }}>
                    <Text style={{ color: '#059669', fontSize: 13, textAlign: 'center', fontWeight: '700' }}>
                      {redeemSuccess}
                    </Text>
                  </View>
                ) : null}

                {/* 兑换按钮 */}
                {!redeemSuccess ? (
                  <Pressable
                    onPress={handleRedeem}
                    disabled={redeemLoading || !redeemCode.trim()}
                    style={{
                      backgroundColor: '#E8A365',
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: 'center',
                      opacity: (redeemLoading || !redeemCode.trim()) ? 0.6 : 1,
                      boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: '#E8A36540' }],
                    }}>
                    {redeemLoading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>立即兑换激活</Text>
                    }
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setShowRedeemModal(false)}
                    style={{
                      backgroundColor: '#059669',
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: 'center',
                      boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: '#05966940' }],
                    }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>完成并返回</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>

      <AlertDialog open={showNativeHint} onOpenChange={setShowNativeHint}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>支付宝网页支付请在浏览器中打开本应用网页版完成。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onPress={() => setShowNativeHint(false)}>
              <Text>知道了</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      </View>
  );
}
