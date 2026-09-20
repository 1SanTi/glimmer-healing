import { useState, useEffect, useRef } from 'react';
import {
  Text, TextInput, Pressable, View, ScrollView,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Eye, EyeOff, Smartphone, ShieldCheck, Sparkles, KeyRound, AlertCircle, Check } from 'lucide-react-native';
import { supabase } from '@/client/supabase';

export default function SignIn() {
  const router = useRouter();

  // 认证方式：'phone'（手机验证码快捷登录/注册，推荐） | 'password'（手机号密码登录/注册）
  const [authMethod, setAuthMethod] = useState<'phone' | 'password'>('phone');

  // 手机号与短信验证码状态（共享/快捷）
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSessionId, setSmsSessionId] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsSentHint, setSmsSentHint] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 密码模式状态：'login'（已有账号登录） | 'register'（新账号手机号注册）
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [accountInput, setAccountInput] = useState(''); // 登录时的手机号/账号
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // 通用状态
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 倒计时管理
  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown]);

  const validatePhone = (p: string) => /^1[3-9]\d{9}$/.test(p);

  // ── 发送短信验证码 ─────────────────────────────────────────────
  const handleSendCode = async (targetPhone: string) => {
    setError('');
    setSmsSentHint('');
    const trimmed = targetPhone.trim();
    if (!trimmed) {
      setError('请输入11位中国大陆手机号码');
      return;
    }
    if (!validatePhone(trimmed)) {
      setError('请输入正确的11位中国大陆手机号码');
      return;
    }

    setSendingSms(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('send-sms-code', {
        body: { mobile: trimmed },
      });

      if (invokeErr) {
        throw new Error(invokeErr.message || '短信服务暂时不可用，请稍后重试');
      }
      if (data?.status !== 0 && data?.code !== 0 && data?.success === false) {
        throw new Error(data?.msg || data?.message || '短信发送过于频繁，请稍后重试');
      }

      if (data?.data?.sessionId) {
        setSmsSessionId(data.data.sessionId);
      }

      setCountdown(60);
      setSmsSentHint(`验证码已发送至 ${trimmed.slice(0, 3)}****${trimmed.slice(-4)}，请注意查收`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSendingSms(false);
    }
  };

  // ── 手机号验证码快捷登录/注册 ─────────────────────────────────
  const handlePhoneSubmit = async () => {
    setError('');
    const trimmedPhone = phone.trim();
    const trimmedCode = smsCode.trim();

    if (!trimmedPhone) {
      setError('请输入手机号码');
      return;
    }
    if (!validatePhone(trimmedPhone)) {
      setError('请输入正确的11位中国大陆手机号码');
      return;
    }
    if (!trimmedCode || trimmedCode.length < 4) {
      setError('请输入收到的短信验证码');
      return;
    }
    if (!agreed) {
      setError('请先阅读并同意用户协议和隐私政策');
      return;
    }

    setLoading(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('verify-sms-code', {
        body: { mobile: trimmedPhone, code: trimmedCode, sessionId: smsSessionId },
      });

      if (invokeErr) {
        throw new Error(invokeErr.message || '验证码校验失败，请重试');
      }
      if (data?.status !== 0 && data?.success === false) {
        throw new Error(data?.message || data?.msg || '验证码错误或已失效');
      }

      const email = data?.email || `${trimmedPhone}@miaoda.com`;
      const pass = data?.password || `Glimmer_Mobile_${trimmedPhone}_AuthSecure!2026`;

      // 优先通过 magiclink token_hash 免密建立会话，无需依赖密码
      if (data?.token_hash) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: 'magiclink',
        });
        if (otpErr) {
          const { error: fallbackErr } = await supabase.auth.signInWithPassword({ email, password: pass });
          if (fallbackErr) throw fallbackErr;
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: pass,
        });
        if (signInErr) {
          throw new Error('登录建立会话失败：' + (signInErr.message.includes('Invalid') ? '验证码凭证失效，请重试' : signInErr.message));
        }
      }

      // 登录成功后直接进入 App
      setLoading(false);
      router.replace('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 避免输出原生 SQL 错误堆栈
      if (msg.includes('SQLSTATE') || msg.includes('relation') || msg.includes('column')) {
        setError('系统初始化异常，已自动为您重置，请重试');
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  };

  // ── 密码模式提交（手机号注册 / 已有账号登录）───────────────────
  const handlePasswordSubmit = async () => {
    setError('');

    if (mode === 'register') {
      // 注册必须通过手机号注册！
      const trimmedPhone = phone.trim();
      const trimmedCode = smsCode.trim();
      const trimmedPwd = password.trim();

      if (!trimmedPhone) {
        setError('请输入用于注册的11位手机号码');
        return;
      }
      if (!validatePhone(trimmedPhone)) {
        setError('请输入正确的11位中国大陆手机号码');
        return;
      }
      if (!trimmedCode || trimmedCode.length < 4) {
        setError('请输入短信验证码完成手机号认证');
        return;
      }
      if (trimmedPwd.length < 6) {
        setError('设置密码不能少于6位字符');
        return;
      }
      if (trimmedPwd !== confirmPwd.trim()) {
        setError('两次输入的密码不一致，请重新检查');
        return;
      }
      if (!agreed) {
        setError('请先阅读并同意用户协议和隐私政策');
        return;
      }

      setLoading(true);
      try {
        // 第一步：校验短信验证码并将自设密码同步设置到 Supabase Auth
        const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('verify-sms-code', {
          body: {
            mobile: trimmedPhone,
            code: trimmedCode,
            sessionId: smsSessionId,
            password: trimmedPwd,
          },
        });

        if (verifyErr || (verifyData?.status !== 0 && verifyData?.success === false)) {
          throw new Error(verifyData?.message || verifyData?.msg || '短信验证码错误或已失效');
        }

        const email = verifyData?.email || `${trimmedPhone}@miaoda.com`;

        // 第二步：验证码通过且密码已原子更新至 Auth，直接使用新自设密码建立登录会话
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: trimmedPwd,
        });

        if (signInErr) {
          throw new Error('注册完成但建立登录会话失败：' + (signInErr.message.includes('Invalid') ? '密码校验异常，请重试' : signInErr.message));
        }

        setLoading(false);
        router.replace('/');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('SQLSTATE') || msg.includes('relation') || msg.includes('column')) {
          setError('注册初始化异常，请重试');
        } else {
          setError(msg);
        }
        setLoading(false);
      }
    } else {
      // 已有账号登录（支持手机号，也兼容已有的自定义账号名）
      const trimmedAccount = accountInput.trim();
      const trimmedPwd = password.trim();

      if (!trimmedAccount) {
        setError('请输入已注册的手机号码或账号');
        return;
      }
      if (trimmedPwd.length < 6) {
        setError('请输入至少6位的登录密码');
        return;
      }

      setLoading(true);
      try {
        const email = trimmedAccount.includes('@') ? trimmedAccount : `${trimmedAccount}@miaoda.com`;
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: trimmedPwd,
        });

        if (signInErr) {
          setError('手机号/账号或密码错误。如忘记密码，可切换至「手机验证码」快捷登录');
          setLoading(false);
          return;
        }

        setLoading(false);
        router.replace('/');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      style={{ backgroundColor: '#FAF7F0' }}
      behavior="padding"
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 顶部治愈系 Logo 与手绘光晕区域 */}
        <View className="items-center mb-6">
          <View className="items-center justify-center mb-3">
            <View
              className="w-20 h-20 items-center justify-center"
              style={{
                backgroundColor: '#FFF9ED',
                borderRadius: 22,
                borderWidth: 1.5,
                borderColor: '#E0DDD5',
                boxShadow: [
                  { offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(234,168,56,0.18)' },
                  { offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.04)' },
                ],
              }}
            >
              <Text style={{ fontSize: 38, lineHeight: 46 }}>🔆</Text>
            </View>
            <View
              className="absolute -bottom-1.5 w-14 h-3 rounded-full"
              style={{ backgroundColor: 'rgba(234,168,56,0.18)' }}
            />
          </View>
          <Text
            className="text-2xl font-bold tracking-tight"
            style={{ color: '#2B2927' }}
          >
            微光心愈
          </Text>
          <View className="flex-row items-center gap-2 mt-1 mb-1.5">
            <View className="h-[1.5px] w-6" style={{ backgroundColor: 'rgba(234,168,56,0.35)' }} />
            <Text
              className="font-bold text-xs tracking-widest uppercase"
              style={{ color: '#EAA838' }}
            >
              Glimmer Healing
            </Text>
            <View className="h-[1.5px] w-6" style={{ backgroundColor: 'rgba(234,168,56,0.35)' }} />
          </View>
          <Text
            className="text-xs"
            style={{ color: '#78746D' }}
          >
            手绘治愈心境 · 陪伴你探索内心的积极优势
          </Text>
        </View>

        {/* 主卡片容器（手绘纸质感，18px圆角与微质感线框） */}
        <View
          className="p-5"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 22,
            borderWidth: 1.5,
            borderColor: '#E0DDD5',
            boxShadow: [
              { offsetX: 0, offsetY: 6, blurRadius: 20, color: 'rgba(0,0,0,0.04)' },
            ],
          }}
        >
          {/* 主认证切换栏：手机验证码 vs 手机密码 */}
          <View
            className="flex-row p-1 mb-4"
            style={{ backgroundColor: '#F4EFE6', borderRadius: 16 }}
          >
            <Pressable
              className="flex-1 py-2.5 items-center flex-row justify-center gap-1.5"
              style={{
                backgroundColor: authMethod === 'phone' ? '#FFFFFF' : 'transparent',
                borderRadius: 12,
                boxShadow: authMethod === 'phone' ? [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }] : [],
              }}
              onPress={() => {
                setAuthMethod('phone');
                setError('');
                setSmsSentHint('');
              }}
            >
              <Smartphone size={16} color={authMethod === 'phone' ? '#EAA838' : '#78746D'} />
              <Text
                className="font-bold text-xs"
                style={{ color: authMethod === 'phone' ? '#2B2927' : '#78746D' }}
              >
                手机验证码快捷
              </Text>
            </Pressable>

            <Pressable
              className="flex-1 py-2.5 items-center flex-row justify-center gap-1.5"
              style={{
                backgroundColor: authMethod === 'password' ? '#FFFFFF' : 'transparent',
                borderRadius: 12,
                boxShadow: authMethod === 'password' ? [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }] : [],
              }}
              onPress={() => {
                setAuthMethod('password');
                setError('');
                setSmsSentHint('');
              }}
            >
              <KeyRound size={16} color={authMethod === 'password' ? '#EAA838' : '#78746D'} />
              <Text
                className="font-bold text-xs"
                style={{ color: authMethod === 'password' ? '#2B2927' : '#78746D' }}
              >
                手机密码登录/注册
              </Text>
            </Pressable>
          </View>

          {/* ══════════════ 模式一：手机验证码快捷登录/注册 ══════════════ */}
          {authMethod === 'phone' && (
            <View className="gap-3">
              {/* 手机号输入框 */}
              <View
                className="flex-row items-center px-3.5"
                style={{
                  backgroundColor: '#FAF7F0',
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: '#E0DDD5',
                }}
              >
                <View className="flex-row items-center pr-3 mr-3" style={{ borderRightWidth: 1.5, borderRightColor: '#E0DDD5' }}>
                  <Text style={{ color: '#2B2927', fontWeight: '700', fontSize: 14 }}>+86</Text>
                </View>
                <TextInput
                  className="flex-1 py-3 text-base"
                  style={{ color: '#2B2927' }}
                  placeholder="请输入11位手机号码"
                  placeholderTextColor="#A8A39A"
                  value={phone}
                  onChangeText={v => { setPhone(v); setError(''); }}
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>

              {/* 验证码输入框与发送按钮 */}
              <View
                className="flex-row items-center pl-3.5 pr-2"
                style={{
                  backgroundColor: '#FAF7F0',
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: '#E0DDD5',
                }}
              >
                <ShieldCheck size={18} color="#78746D" style={{ marginRight: 8 }} />
                <TextInput
                  className="flex-1 py-3 text-base"
                  style={{ color: '#2B2927' }}
                  placeholder="请输入6位短信验证码"
                  placeholderTextColor="#A8A39A"
                  value={smsCode}
                  onChangeText={v => { setSmsCode(v); setError(''); }}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Pressable
                  onPress={() => handleSendCode(phone)}
                  disabled={sendingSms || countdown > 0}
                  className="px-3 py-2 items-center justify-center"
                  style={{
                    backgroundColor: countdown > 0 ? '#EAE6DD' : '#EAA838',
                    borderRadius: 12,
                  }}
                >
                  {sendingSms ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text
                      style={{
                        color: countdown > 0 ? '#78746D' : '#FFFFFF',
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                    </Text>
                  )}
                </Pressable>
              </View>

              {/* 短信下发提示 */}
              {!!smsSentHint && (
                <View className="flex-row items-center gap-1.5 px-1">
                  <Sparkles size={13} color="#5E936C" />
                  <Text className="text-xs" style={{ color: '#5E936C' }}>
                    {smsSentHint}
                  </Text>
                </View>
              )}

              {/* 用户协议勾选 */}
              <Pressable
                className="flex-row items-start gap-2.5 mt-1 px-1"
                onPress={() => setAgreed(a => !a)}
              >
                <View
                  className="w-5 h-5 items-center justify-center mt-0.5"
                  style={{
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: agreed ? '#EAA838' : '#D0CBC1',
                    backgroundColor: agreed ? '#EAA838' : '#FFFFFF',
                  }}
                >
                  {agreed && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text className="flex-1 text-xs leading-5" style={{ color: '#78746D' }}>
                  我已阅读并同意{' '}
                  <Text style={{ color: '#EAA838', fontWeight: '700' }}>《用户协议》</Text>
                  {' '}与{' '}
                  <Text style={{ color: '#EAA838', fontWeight: '700' }}>《隐私政策》</Text>
                  {'\n'}
                  <Text style={{ color: '#A8A39A' }}>新手机号验证通过后将自动完成注册</Text>
                </Text>
              </Pressable>

              {/* 错误提示卡片 */}
              {!!error && (
                <View
                  className="p-3 flex-row items-center gap-2 mt-1"
                  style={{ backgroundColor: '#FDF2F0', borderRadius: 12, borderWidth: 1, borderColor: '#F8D7DA' }}
                >
                  <AlertCircle size={16} color="#D9534F" />
                  <Text className="flex-1 text-xs leading-4" style={{ color: '#D9534F' }}>
                    {error}
                  </Text>
                </View>
              )}

              {/* 登录/注册主按钮 */}
              <Pressable
                className="py-4 items-center justify-center mt-2"
                style={{
                  backgroundColor: '#EAA838',
                  borderRadius: 18,
                  boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(234,168,56,0.28)' }],
                }}
                onPress={handlePhoneSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base tracking-wide">
                    验证并进入微光
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {/* ══════════════ 模式二：手机密码登录/注册 ══════════════ */}
          {authMethod === 'password' && (
            <View className="gap-3">
              {/* 子切换：已有账号登录 vs 新账号注册 */}
              <View
                className="flex-row p-1 mb-1"
                style={{ backgroundColor: '#FAF7F0', borderRadius: 14, borderWidth: 1.5, borderColor: '#E0DDD5' }}
              >
                {(['login', 'register'] as const).map(m => (
                  <Pressable
                    key={m}
                    className="flex-1 py-2 items-center rounded-xl"
                    style={{
                      backgroundColor: mode === m ? '#FFFFFF' : 'transparent',
                      boxShadow: mode === m ? [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }] : [],
                    }}
                    onPress={() => {
                      setMode(m);
                      setError('');
                      setSmsSentHint('');
                    }}
                  >
                    <Text
                      className="font-bold text-xs"
                      style={{ color: mode === m ? '#EAA838' : '#78746D' }}
                    >
                      {m === 'login' ? '已有账号登录' : '手机号新账号注册'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* ── 密码模式：新账号注册（必须通过手机号+验证码+密码） ── */}
              {mode === 'register' && (
                <>
                  {/* 提示条 */}
                  <View
                    className="p-2.5 flex-row items-center gap-2"
                    style={{ backgroundColor: '#FFF9ED', borderRadius: 12, borderWidth: 1, borderColor: '#F5E6CC' }}
                  >
                    <Sparkles size={14} color="#EAA838" />
                    <Text className="text-xs" style={{ color: '#8A6D3B' }}>
                      新账号必须绑定手机号以保障您的心愈资产与安全
                    </Text>
                  </View>

                  {/* 手机号输入框 */}
                  <View
                    className="flex-row items-center px-3.5"
                    style={{
                      backgroundColor: '#FAF7F0',
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: '#E0DDD5',
                    }}
                  >
                    <View className="flex-row items-center pr-3 mr-3" style={{ borderRightWidth: 1.5, borderRightColor: '#E0DDD5' }}>
                      <Text style={{ color: '#2B2927', fontWeight: '700', fontSize: 14 }}>+86</Text>
                    </View>
                    <TextInput
                      className="flex-1 py-3 text-base"
                      style={{ color: '#2B2927' }}
                      placeholder="请输入11位手机号码"
                      placeholderTextColor="#A8A39A"
                      value={phone}
                      onChangeText={v => { setPhone(v); setError(''); }}
                      keyboardType="phone-pad"
                      maxLength={11}
                    />
                  </View>

                  {/* 短信验证码输入框与发送按钮 */}
                  <View
                    className="flex-row items-center pl-3.5 pr-2"
                    style={{
                      backgroundColor: '#FAF7F0',
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: '#E0DDD5',
                    }}
                  >
                    <ShieldCheck size={18} color="#78746D" style={{ marginRight: 8 }} />
                    <TextInput
                      className="flex-1 py-3 text-base"
                      style={{ color: '#2B2927' }}
                      placeholder="短信验证码"
                      placeholderTextColor="#A8A39A"
                      value={smsCode}
                      onChangeText={v => { setSmsCode(v); setError(''); }}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    <Pressable
                      onPress={() => handleSendCode(phone)}
                      disabled={sendingSms || countdown > 0}
                      className="px-3 py-2 items-center justify-center"
                      style={{
                        backgroundColor: countdown > 0 ? '#EAE6DD' : '#EAA838',
                        borderRadius: 12,
                      }}
                    >
                      {sendingSms ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text
                          style={{
                            color: countdown > 0 ? '#78746D' : '#FFFFFF',
                            fontSize: 12,
                            fontWeight: '700',
                          }}
                        >
                          {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                        </Text>
                      )}
                    </Pressable>
                  </View>

                  {/* 短信下发提示 */}
                  {!!smsSentHint && (
                    <Text className="text-xs px-1" style={{ color: '#5E936C' }}>
                      {smsSentHint}
                    </Text>
                  )}

                  {/* 设置密码 */}
                  <View
                    className="flex-row items-center px-4"
                    style={{
                      backgroundColor: '#FAF7F0',
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: '#E0DDD5',
                    }}
                  >
                    <TextInput
                      className="flex-1 py-3 text-base"
                      style={{ color: '#2B2927' }}
                      placeholder="设置登录密码（至少6位）"
                      placeholderTextColor="#A8A39A"
                      value={password}
                      onChangeText={v => { setPassword(v); setError(''); }}
                      secureTextEntry={!showPwd}
                    />
                    <Pressable onPress={() => setShowPwd(p => !p)}>
                      {showPwd ? <EyeOff size={18} color="#78746D" /> : <Eye size={18} color="#78746D" />}
                    </Pressable>
                  </View>

                  {/* 确认密码 */}
                  <View
                    className="flex-row items-center px-4"
                    style={{
                      backgroundColor: '#FAF7F0',
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: '#E0DDD5',
                    }}
                  >
                    <TextInput
                      className="flex-1 py-3 text-base"
                      style={{ color: '#2B2927' }}
                      placeholder="确认登录密码"
                      placeholderTextColor="#A8A39A"
                      value={confirmPwd}
                      onChangeText={v => { setConfirmPwd(v); setError(''); }}
                      secureTextEntry={!showConfirmPwd}
                    />
                    <Pressable onPress={() => setShowConfirmPwd(p => !p)}>
                      {showConfirmPwd ? <EyeOff size={18} color="#78746D" /> : <Eye size={18} color="#78746D" />}
                    </Pressable>
                  </View>

                  {/* 协议勾选 */}
                  <Pressable
                    className="flex-row items-start gap-2 mt-1 px-1"
                    onPress={() => setAgreed(a => !a)}
                  >
                    <View
                      className="w-5 h-5 items-center justify-center mt-0.5"
                      style={{
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: agreed ? '#EAA838' : '#D0CBC1',
                        backgroundColor: agreed ? '#EAA838' : '#FFFFFF',
                      }}
                    >
                      {agreed && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                    <Text className="flex-1 text-xs leading-5" style={{ color: '#78746D' }}>
                      我已阅读并同意{' '}
                      <Text style={{ color: '#EAA838', fontWeight: '700' }}>《用户协议》</Text>
                      {' '}与{' '}
                      <Text style={{ color: '#EAA838', fontWeight: '700' }}>《隐私政策》</Text>
                    </Text>
                  </Pressable>
                </>
              )}

              {/* ── 密码模式：已有账号登录 ── */}
              {mode === 'login' && (
                <>
                  {/* 手机号或账号输入框 */}
                  <View
                    className="flex-row items-center px-4"
                    style={{
                      backgroundColor: '#FAF7F0',
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: '#E0DDD5',
                    }}
                  >
                    <TextInput
                      className="flex-1 py-3.5 text-base"
                      style={{ color: '#2B2927' }}
                      placeholder="请输入注册手机号码或账号"
                      placeholderTextColor="#A8A39A"
                      value={accountInput}
                      onChangeText={v => { setAccountInput(v); setError(''); }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  {/* 密码输入框 */}
                  <View
                    className="flex-row items-center px-4"
                    style={{
                      backgroundColor: '#FAF7F0',
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: '#E0DDD5',
                    }}
                  >
                    <TextInput
                      className="flex-1 py-3.5 text-base"
                      style={{ color: '#2B2927' }}
                      placeholder="请输入登录密码"
                      placeholderTextColor="#A8A39A"
                      value={password}
                      onChangeText={v => { setPassword(v); setError(''); }}
                      secureTextEntry={!showPwd}
                      onSubmitEditing={handlePasswordSubmit}
                    />
                    <Pressable onPress={() => setShowPwd(p => !p)}>
                      {showPwd ? <EyeOff size={18} color="#78746D" /> : <Eye size={18} color="#78746D" />}
                    </Pressable>
                  </View>

                  <View className="flex-row justify-end mt-1 px-1">
                    <Pressable
                      onPress={() => {
                        setAuthMethod('phone');
                        if (accountInput && validatePhone(accountInput.trim())) {
                          setPhone(accountInput.trim());
                        }
                        setError('');
                      }}
                    >
                      <Text className="text-xs" style={{ color: '#EAA838', fontWeight: '600' }}>
                        忘记密码？使用验证码快捷登录
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}

              {/* 错误提示卡片 */}
              {!!error && (
                <View
                  className="p-3 flex-row items-center gap-2 mt-1"
                  style={{ backgroundColor: '#FDF2F0', borderRadius: 12, borderWidth: 1, borderColor: '#F8D7DA' }}
                >
                  <AlertCircle size={16} color="#D9534F" />
                  <Text className="flex-1 text-xs leading-4" style={{ color: '#D9534F' }}>
                    {error}
                  </Text>
                </View>
              )}

              {/* 提交按钮 */}
              <Pressable
                className="py-4 items-center justify-center mt-2"
                style={{
                  backgroundColor: '#EAA838',
                  borderRadius: 18,
                  boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(234,168,56,0.28)' }],
                }}
                onPress={handlePasswordSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base tracking-wide">
                    {mode === 'login' ? '立即登录' : '注册并登录'}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* 底部温暖温和说明 */}
        <View className="items-center mt-8">
          <Text className="text-xs" style={{ color: '#A8A39A' }}>
            微光心愈 · 每一次倾诉，都是与内在优势的重逢
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

