import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeft, Plus, Copy, Trash2, Users, Key, TrendingUp,
  X, Check, ShieldOff, Download, ShieldCheck, Search,
  Clock, Calendar, AlertCircle, RefreshCw, UserCheck, UserX,
  FileText, Sparkles,
} from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';

// ── 类型定义 ──────────────────────────────────────────────────────────
interface CodeRow {
  id: string;
  code: string;
  plan_id: string;
  duration_days: number;
  is_used: boolean;
  is_disabled: boolean;
  used_at: string | null;
  expires_at: string | null;
  batch_label: string | null;
  created_at: string;
}

interface RedemptionRecordRow {
  id: string;
  code_id: string | null;
  code: string;
  user_id: string;
  user_phone: string;
  plan_id: string;
  duration_days: number;
  used_at: string;
  expires_at: string | null;
  status: string; // 'active', 'expired', 'revoked'
  batch_label: string | null;
}

interface UserSubscriptionRow {
  id: string;
  phone: string;
  created_at: string;
  plan_id: string;
  status: string; // 'active', 'free', 'cancelled', 'expired'
  expires_at: string | null;
  started_at: string | null;
  redeemed_code: string | null;
}

interface Stats {
  totalUsers: number;
  totalCodes: number;
  usedCodes: number;
  activeSubs: number;
  byPlan: { free: number; basic: number; pro: number };
}

const PLAN_LABELS: Record<string, string> = { free: '体验版', basic: '心愈版', pro: 'AI工作台版' };
const PLAN_COLORS: Record<string, string> = { free: '#6B7280', basic: '#7C6FCD', pro: '#DE6B35' };
const PLAN_BG: Record<string, string> = {
  free: 'rgba(107,114,128,0.10)',
  basic: 'rgba(124,111,205,0.12)',
  pro: 'rgba(222,107,53,0.12)',
};
const PLAN_OPTIONS = ['basic', 'pro'] as const;

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { session } = useSession();

  // ── 主导航 Tab ──
  const [activeTab, setActiveTab] = useState<'codes' | 'records' | 'members'>('codes');

  // ── 全局数据 ──
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, totalCodes: 0, usedCodes: 0, activeSubs: 0,
    byPlan: { free: 0, basic: 0, pro: 0 },
  });

  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [records, setRecords] = useState<RedemptionRecordRow[]>([]);
  const [users, setUsers] = useState<UserSubscriptionRow[]>([]);

  // ── 兑换码筛选 ──
  const [filterCodePlan, setFilterCodePlan] = useState<string>('all');
  const [filterCodeStatus, setFilterCodeStatus] = useState<string>('all');
  const [searchCodeText, setSearchCodeText] = useState<string>('');

  // ── 兑换记录筛选 ──
  const [searchRecordText, setSearchRecordText] = useState<string>('');
  const [filterRecordPlan, setFilterRecordPlan] = useState<string>('all');

  // ── 会员管理筛选 ──
  const [searchMemberText, setSearchMemberText] = useState<string>('');
  const [filterMemberPlan, setFilterMemberPlan] = useState<string>('all');
  const [filterMemberStatus, setFilterMemberStatus] = useState<string>('all');

  // ── 复制 / 操作反馈 ──
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3000);
  };

  // ── 生成兑换码弹窗状态 ──
  const [showGen, setShowGen] = useState(false);
  const [genPlan, setGenPlan] = useState<'basic' | 'pro'>('basic');
  const [genCount, setGenCount] = useState('5');
  const [genDays, setGenDays] = useState('365');
  const [genLabel, setGenLabel] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genMsg, setGenMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  // ── 删除兑换码状态 ──
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── 禁用/启用状态 ──
  const [disableLoading, setDisableLoading] = useState<string | null>(null);

  // ── 手动延长会员弹窗 ──
  const [extendUser, setExtendUser] = useState<UserSubscriptionRow | null>(null);
  const [extendDays, setExtendDays] = useState<string>('30');
  const [extendPlan, setExtendPlan] = useState<'basic' | 'pro'>('basic');
  const [extendLoading, setExtendLoading] = useState(false);

  // ── 手动取消会员弹窗 ──
  const [cancelUser, setCancelUser] = useState<UserSubscriptionRow | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // ── 数据加载 ──────────────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    // 自动授权写入 admin_users
    if (session?.user?.id) {
      try {
        await supabase
          .from('admin_users')
          .upsert({ id: session.user.id }, { onConflict: 'id', ignoreDuplicates: true });
      } catch (err) {
        console.warn('admin_users 自动授权非致命异常:', err);
      }
    }

    try {
      const [codesRes, recordsRes, usersRes, usersCountRes] = await Promise.all([
        supabase.from('redemption_codes').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.rpc('admin_get_redemption_records'),
        supabase.rpc('admin_get_users_subscriptions'),
        supabase.functions.invoke('get-admin-stats', {}),
      ]);

      const allCodes = (codesRes.data ?? []) as CodeRow[];
      const allRecords = (recordsRes.data ?? []) as RedemptionRecordRow[];
      const allUsers = (usersRes.data ?? []) as UserSubscriptionRow[];

      // 计算真实总用户数
      const edgeUserCount = (usersCountRes.data as any)?.total_users;
      const totalUsers = edgeUserCount && edgeUserCount > 0 ? edgeUserCount : allUsers.length;

      // 计算有效订阅与套餐分布
      const activeUsers = allUsers.filter(u => u.status === 'active');
      const freeCount = allUsers.filter(u => u.plan_id === 'free' || u.status === 'free').length;
      const basicCount = allUsers.filter(u => u.plan_id === 'basic' && u.status === 'active').length;
      const proCount = allUsers.filter(u => u.plan_id === 'pro' && u.status === 'active').length;

      setCodes(allCodes);
      setRecords(allRecords);
      setUsers(allUsers);

      setStats({
        totalUsers,
        totalCodes: allCodes.length,
        usedCodes: allRecords.length > 0 ? allRecords.length : allCodes.filter(c => c.is_used).length,
        activeSubs: activeUsers.length,
        byPlan: { free: freeCount, basic: basicCount, pro: proCount },
      });
    } catch (err) {
      console.error('加载后台管理数据失败:', err);
      showToast('加载数据发生异常，请重试', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── 格式化工具 ──
  const formatDate = (dateStr: string | null | undefined, withTime = false) => {
    if (!dateStr) return '无到期时间';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      if (!withTime) return `${yr}-${mo}-${da}`;
      const hr = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yr}-${mo}-${da} ${hr}:${mi}`;
    } catch {
      return dateStr;
    }
  };

  const handleCopy = async (text: string, id: string) => {
    let success = false;
    try {
      // 1. Expo 跨平台统一剪贴板（原生 iOS/Android/Web 优先使用）
      await Clipboard.setStringAsync(text);
      success = true;
    } catch (e1) {
      console.warn('Clipboard.setStringAsync 失败，尝试浏览器原生接口:', e1);
    }

    if (!success) {
      try {
        // 2. 浏览器 Navigator Clipboard API 兜底
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          success = true;
        }
      } catch (e2) {
        console.warn('navigator.clipboard.writeText 失败，尝试 execCommand:', e2);
      }
    }

    if (!success && typeof document !== 'undefined') {
      try {
        // 3. Web 传统 textarea + execCommand 兜底
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e3) {
        console.warn('execCommand copy 失败:', e3);
      }
    }

    if (success) {
      setCopiedId(id);
      showToast(`已成功复制：${text}`);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      showToast('复制失败，请手动长按复制', 'error');
    }
  };

  // ── 生成兑换码 ────────────────────────────────────────────────
  const genCodeStr = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) code += '-';
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const handleGenerate = async () => {
    setGenLoading(true);
    setGenMsg(null);
    setGeneratedCodes([]);

    try {
      const safeCount = Math.min(100, Math.max(1, parseInt(genCount) || 1));
      const safeDays = Math.max(0, parseInt(genDays) || 365);
      const expiresAt = safeDays > 0
        ? new Date(Date.now() + safeDays * 86400 * 1000).toISOString()
        : null;
      const batchLabel = genLabel || `批次-${new Date().toISOString().slice(0, 10)}`;

      const codesSet = new Set<string>();
      while (codesSet.size < safeCount) codesSet.add(genCodeStr());
      const candidates = Array.from(codesSet);

      const { data: existing } = await supabase
        .from('redemption_codes')
        .select('code')
        .in('code', candidates);
      const existingSet = new Set((existing ?? []).map((r: { code: string }) => r.code));
      const uniqueCodes = candidates.filter(c => !existingSet.has(c)).slice(0, safeCount);

      const rows = uniqueCodes.map(code => ({
        code,
        plan_id: genPlan,
        duration_days: safeDays,
        expires_at: expiresAt,
        batch_label: batchLabel,
      }));

      const { data, error } = await supabase
        .from('redemption_codes')
        .insert(rows)
        .select();

      if (error) throw new Error(error.message);

      const newCodes = (data as CodeRow[]).map(c => c.code);
      setGeneratedCodes(newCodes);
      setGenMsg({ ok: true, text: `✓ 成功生成 ${newCodes.length} 个密钥` });
      showToast(`成功生成 ${newCodes.length} 个密钥`);
      await loadData();
    } catch (err: any) {
      setGenMsg({ ok: false, text: `生成失败：${err.message || '未知错误'}` });
    } finally {
      setGenLoading(false);
    }
  };

  // ── 切换禁用 ──────────────────────────────────────────────────
  const handleToggleDisable = async (item: CodeRow) => {
    setDisableLoading(item.id);
    try {
      const nextDisabled = !item.is_disabled;
      const { error } = await supabase
        .from('redemption_codes')
        .update({ is_disabled: nextDisabled })
        .eq('id', item.id);

      if (error) throw error;
      setCodes(prev => prev.map(c => c.id === item.id ? { ...c, is_disabled: nextDisabled } : c));
      showToast(nextDisabled ? '密钥已禁用' : '密钥已启用恢复');
    } catch (err: any) {
      showToast(`操作失败：${err.message}`, 'error');
    } finally {
      setDisableLoading(null);
    }
  };

  // ── 删除兑换码 ────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.from('redemption_codes').delete().eq('id', deleteId);
      if (error) throw error;
      setCodes(prev => prev.filter(c => c.id !== deleteId));
      setDeleteId(null);
      showToast('密钥已彻底删除');
    } catch (err: any) {
      showToast(`删除失败：${err.message}`, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── 手动延长会员 ──────────────────────────────────────────────
  const handleExtendSubscription = async () => {
    if (!extendUser) return;
    const days = parseInt(extendDays, 10);
    if (isNaN(days) || days <= 0) {
      showToast('请输入有效的延长时间（天数）', 'error');
      return;
    }

    setExtendLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_extend_user_subscription', {
        p_user_id: extendUser.id,
        p_days: days,
        p_plan_id: extendPlan,
      });

      if (error) throw error;
      if (data && !data.ok) throw new Error(data.error || '延期失败');

      showToast(data?.message || `已为用户成功延期 ${days} 天`);
      setExtendUser(null);
      await loadData();
    } catch (err: any) {
      showToast(`延期失败：${err.message || '网络异常'}`, 'error');
    } finally {
      setExtendLoading(false);
    }
  };

  // ── 手动取消会员 ──────────────────────────────────────────────
  const handleCancelSubscription = async () => {
    if (!cancelUser) return;
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_cancel_user_subscription', {
        p_user_id: cancelUser.id,
      });

      if (error) throw error;
      if (data && !data.ok) throw new Error(data.error || '取消订阅失败');

      showToast(data?.message || '已取消用户会员并降级为体验版');
      setCancelUser(null);
      await loadData();
    } catch (err: any) {
      showToast(`取消失败：${err.message || '网络异常'}`, 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  // ── 导出 CSV ──────────────────────────────────────────────────
  const handleExportCodes = async () => {
    if (codes.length === 0) {
      showToast('暂无数据可导出', 'error');
      return;
    }
    const headers = ['密钥Code', '套餐', '有效天数', '状态', '批次备注', '生成时间', '到期时间'];
    const rows = codes.map(c => [
      c.code,
      PLAN_LABELS[c.plan_id] || c.plan_id,
      c.duration_days > 0 ? `${c.duration_days}天` : '永久',
      c.is_disabled ? '已禁用' : c.is_used ? '已使用' : '可用',
      c.batch_label || '',
      formatDate(c.created_at, true),
      c.expires_at ? formatDate(c.expires_at, false) : '',
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');

    if (typeof document !== 'undefined') {
      try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `兑换密钥导出_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('已导出CSV文件');
      } catch {
        handleCopy(csv, 'export');
      }
    } else {
      handleCopy(csv, 'export');
    }
  };

  // ── 过滤后的码列表 ──
  const filteredCodes = useMemo(() => {
    return codes.filter(c => {
      if (filterCodePlan !== 'all' && c.plan_id !== filterCodePlan) return false;
      if (filterCodeStatus === 'used' && !c.is_used) return false;
      if (filterCodeStatus === 'unused' && c.is_used) return false;
      if (filterCodeStatus === 'disabled' && !c.is_disabled) return false;
      if (searchCodeText.trim()) {
        const q = searchCodeText.trim().toUpperCase();
        return c.code.includes(q) || (c.batch_label && c.batch_label.toUpperCase().includes(q));
      }
      return true;
    });
  }, [codes, filterCodePlan, filterCodeStatus, searchCodeText]);

  // ── 过滤后的兑换记录列表 ──
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filterRecordPlan !== 'all' && r.plan_id !== filterRecordPlan) return false;
      if (searchRecordText.trim()) {
        const q = searchRecordText.trim().toLowerCase();
        const matchPhone = (r.user_phone || '').toLowerCase().includes(q);
        const matchCode = (r.code || '').toLowerCase().includes(q);
        const matchBatch = (r.batch_label || '').toLowerCase().includes(q);
        return matchPhone || matchCode || matchBatch;
      }
      return true;
    });
  }, [records, filterRecordPlan, searchRecordText]);

  // ── 过滤后的会员列表 ──
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (filterMemberPlan !== 'all' && u.plan_id !== filterMemberPlan) return false;
      if (filterMemberStatus === 'active' && u.status !== 'active') return false;
      if (filterMemberStatus === 'free' && (u.status === 'active' || u.plan_id !== 'free')) return false;
      if (filterMemberStatus === 'cancelled' && u.status !== 'cancelled') return false;
      if (searchMemberText.trim()) {
        const q = searchMemberText.trim();
        return (u.phone || '').includes(q) || (u.id || '').includes(q);
      }
      return true;
    });
  }, [users, filterMemberPlan, filterMemberStatus, searchMemberText]);

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#7C6FCD" />
        <Text className="text-muted-foreground text-sm mt-3">加载管理控制台中...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F7F5EE]">
      <StatusBar style="dark" />

      {/* ── 顶部导航栏 ── */}
      <View className="px-4 pt-14 pb-3 bg-[#F7F5EE] border-b border-border/40">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <Pressable
              onPress={() => router.back()}
              className="w-9 h-9 rounded-full bg-white items-center justify-center border border-border/40 shadow-sm active:opacity-70">
              <ArrowLeft size={18} color="#2B2826" />
            </Pressable>
            <View className="flex-row items-center gap-2">
              <View className="w-8 h-8 rounded-xl bg-[#7C6FCD]/15 items-center justify-center">
                <ShieldCheck size={18} color="#7C6FCD" />
              </View>
              <Text className="text-[#2B2826] font-bold text-lg" numberOfLines={1}>
                管理员后台
              </Text>
            </View>
          </View>

          {/* 顶部右侧刷新操作 */}
          <Pressable
            onPress={() => loadData(true)}
            disabled={refreshing}
            className="w-9 h-9 rounded-full bg-white items-center justify-center border border-border/40 shadow-sm active:opacity-70">
            <RefreshCw size={15} color="#7C7670" className={refreshing ? 'animate-spin' : ''} />
          </Pressable>
        </View>

        {/* 快捷管理操作工具栏（独立整行，大圆角卡片按钮） */}
        <View className="flex-row items-center gap-2.5 mt-3">
          <Pressable
            onPress={handleExportCodes}
            className="flex-1 py-2 px-3 rounded-xl bg-white border border-border/40 flex-row items-center justify-center gap-1.5 shadow-sm active:opacity-80">
            <Download size={14} color="#059669" />
            <Text className="text-xs font-bold text-[#2B2826]">导出密钥 (CSV)</Text>
          </Pressable>

          <Pressable
            onPress={() => { setShowGen(true); setGenMsg(null); setGeneratedCodes([]); }}
            className="flex-1 py-2 px-3 rounded-xl bg-[#DE6B35] flex-row items-center justify-center gap-1.5 shadow-sm active:opacity-80">
            <Plus size={15} color="#FFFFFF" />
            <Text className="text-xs font-bold text-white">批量生成新密钥</Text>
          </Pressable>
        </View>
      </View>

      {/* Toast 提示横幅 */}
      {toastMsg && (
        <View className={`mx-4 mt-2 px-4 py-2.5 rounded-xl flex-row items-center gap-2 shadow-sm ${
          toastMsg.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          <AlertCircle size={16} color="#FFFFFF" />
          <Text className="text-white text-xs font-medium flex-1">{toastMsg.text}</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>

        {/* ── 1. 核心指标卡片矩阵（卡片样式） ── */}
        <View className="flex-row gap-2 mb-4">
          {[
            { icon: <Users size={17} color="#7C6FCD" />, label: '注册用户', value: stats.totalUsers, bg: 'rgba(124,111,205,0.12)' },
            { icon: <TrendingUp size={17} color="#059669" />, label: '活跃订阅', value: stats.activeSubs, bg: 'rgba(5,150,105,0.12)' },
            { icon: <Key size={17} color="#DE6B35" />, label: '密钥总量', value: stats.totalCodes, bg: 'rgba(222,107,53,0.12)' },
            { icon: <Check size={17} color="#4F805D" />, label: '已兑换', value: stats.usedCodes, bg: 'rgba(79,128,93,0.12)' },
          ].map(s => (
            <View
              key={s.label}
              className="flex-1 bg-white rounded-2xl py-2.5 px-1.5 items-center border border-border/40 shadow-sm"
              style={{ backgroundColor: '#FFFFFF' }}>
              <View className="w-8 h-8 rounded-xl items-center justify-center mb-1" style={{ backgroundColor: s.bg }}>
                {s.icon}
              </View>
              <Text className="text-[#2B2826] font-bold text-base" numberOfLines={1}>{s.value}</Text>
              <Text className="text-[#7C7670] text-[11px] font-medium" numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── 2. 套餐分布卡片（卡片样式） ── */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-border/40 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-1.5">
              <Sparkles size={16} color="#DE6B35" />
              <Text className="text-[#2B2826] font-bold text-sm">会员套餐分布</Text>
            </View>
            <Text className="text-[#7C7670] text-xs">
              付费会员 {stats.activeSubs} 人 · 总用户 {stats.totalUsers} 人
            </Text>
          </View>

          {(['free', 'basic', 'pro'] as const).map(pid => {
            const count = stats.byPlan[pid];
            const total = stats.totalUsers || (stats.byPlan.free + stats.byPlan.basic + stats.byPlan.pro) || 1;
            const pct = Math.round((count / total) * 100);
            return (
              <View key={pid} className="mb-2.5 last:mb-0">
                <View className="flex-row items-center justify-between mb-1">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: PLAN_COLORS[pid] }} />
                    <Text className="text-xs font-semibold" style={{ color: PLAN_COLORS[pid] }}>
                      {PLAN_LABELS[pid]}
                    </Text>
                  </View>
                  <Text className="text-xs text-[#7C7670] font-medium">
                    {count} 人 ({pct}%)
                  </Text>
                </View>
                <View className="h-2 rounded-full bg-[#F3F0E6] overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(pct, count > 0 ? 4 : 0))}%`, backgroundColor: PLAN_COLORS[pid] }}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* ── 3. 模块选项卡导航（卡片样式分段控制器） ── */}
        <View className="bg-white rounded-2xl p-1.5 mb-4 flex-row gap-1.5 border border-border/40 shadow-sm">
          {[
            { key: 'codes', label: '🔑 兑换码管理', count: filteredCodes.length },
            { key: 'records', label: '📜 密钥使用记录', count: filteredRecords.length },
            { key: 'members', label: '👥 会员管理', count: filteredUsers.length },
          ].map(t => {
            const isCur = activeTab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setActiveTab(t.key as any)}
                className={`flex-1 py-2.5 rounded-xl items-center justify-center transition-all ${
                  isCur ? 'bg-[#7C6FCD] shadow-sm' : 'bg-transparent'
                }`}>
                <Text className={`text-xs font-bold ${isCur ? 'text-white' : 'text-[#7C7670]'}`}>
                  {t.label}
                </Text>
                <Text className={`text-[10px] mt-0.5 ${isCur ? 'text-white/80' : 'text-[#7C7670]/60'}`}>
                  {t.count} 条
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ─────────────────────────────────────────────────────────────
            TAB 1: 兑换码管理卡片
           ───────────────────────────────────────────────────────────── */}
        {activeTab === 'codes' && (
          <View className="bg-white rounded-2xl p-4 border border-border/40 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-1.5">
                <Key size={16} color="#7C6FCD" />
                <Text className="text-[#2B2826] font-bold text-sm">兑换码列表与控制</Text>
              </View>
              <Text className="text-xs text-[#7C7670]">已显示 {filteredCodes.length} 个</Text>
            </View>

            {/* 搜索框 */}
            <View className="flex-row items-center bg-[#F7F5EE] rounded-xl px-3 py-2 mb-3 border border-border/30">
              <Search size={14} color="#7C7670" className="mr-2" />
              <TextInput
                value={searchCodeText}
                onChangeText={setSearchCodeText}
                placeholder="搜索密钥或批次备注..."
                placeholderTextColor="#A09B94"
                className="flex-1 text-xs text-[#2B2826] p-0"
              />
              {searchCodeText.length > 0 && (
                <Pressable onPress={() => setSearchCodeText('')} className="p-1">
                  <X size={12} color="#7C7670" />
                </Pressable>
              )}
            </View>

            {/* 筛选标签条 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <View className="flex-row items-center gap-1.5">
                {[
                  { key: 'all', label: '全部套餐' },
                  ...PLAN_OPTIONS.map(p => ({ key: p, label: PLAN_LABELS[p] })),
                ].map(opt => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setFilterCodePlan(opt.key)}
                    className="px-2.5 py-1 rounded-full border"
                    style={{
                      backgroundColor: filterCodePlan === opt.key ? '#7C6FCD' : '#F7F5EE',
                      borderColor: filterCodePlan === opt.key ? '#7C6FCD' : '#E5E1D5',
                    }}>
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: filterCodePlan === opt.key ? '#FFFFFF' : '#7C7670' }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}

                <View className="w-px h-4 bg-border/60 mx-1" />

                {[
                  { key: 'all', label: '全部状态' },
                  { key: 'unused', label: '可用' },
                  { key: 'used', label: '已兑换' },
                  { key: 'disabled', label: '已停用' },
                ].map(opt => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setFilterCodeStatus(opt.key)}
                    className="px-2.5 py-1 rounded-full border"
                    style={{
                      backgroundColor: filterCodeStatus === opt.key ? '#DE6B35' : '#F7F5EE',
                      borderColor: filterCodeStatus === opt.key ? '#DE6B35' : '#E5E1D5',
                    }}>
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: filterCodeStatus === opt.key ? '#FFFFFF' : '#7C7670' }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* 兑换码微卡片列表 */}
            {filteredCodes.length === 0 ? (
              <View className="py-12 items-center justify-center bg-[#F7F5EE]/40 rounded-xl">
                <Key size={36} color="#DBD6CA" />
                <Text className="text-[#7C7670] text-xs mt-2 font-medium">无符合条件的兑换密钥</Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {filteredCodes.slice(0, 100).map((item) => (
                  <View
                    key={item.id}
                    className="p-3.5 rounded-xl border border-border/40 bg-[#FCFBF8] shadow-sm"
                    style={{ opacity: item.is_disabled ? 0.6 : 1 }}>
                    {/* 卡片顶部行：套餐标签 + 状态标签 + 右侧操作 */}
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-1.5 flex-1 min-w-0 mr-2">
                        <View
                          className="px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: PLAN_BG[item.plan_id] || '#F3F0E6' }}>
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: PLAN_COLORS[item.plan_id] || '#7C6FCD' }}>
                            {PLAN_LABELS[item.plan_id] || item.plan_id}
                          </Text>
                        </View>
                        <View
                          className="rounded-full px-2 py-0.5"
                          style={{
                            backgroundColor: item.is_disabled
                              ? '#FEE2E2'
                              : item.is_used
                                ? '#F3F4F6'
                                : '#ECFDF5',
                          }}>
                          <Text
                            className="text-[10px] font-bold"
                            style={{
                              color: item.is_disabled ? '#DC2626' : item.is_used ? '#6B7280' : '#059669',
                            }}>
                            {item.is_disabled ? '已停用' : item.is_used ? '已兑换' : '可用'}
                          </Text>
                        </View>
                      </View>

                      {/* 右侧操作按钮（带 flex-shrink-0，防挤压） */}
                      <View className="flex-row items-center gap-1.5 flex-shrink-0">
                        <Pressable
                          onPress={() => handleCopy(item.code, item.id)}
                          className={`flex-row items-center gap-1 px-2.5 py-1 rounded-lg border active:opacity-70 ${
                            copiedId === item.id
                              ? 'bg-emerald-50 border-emerald-300'
                              : 'bg-[#F7F5EE] border-border/40'
                          }`}>
                          {copiedId === item.id ? (
                            <>
                              <Check size={13} color="#059669" />
                              <Text className="text-[11px] text-emerald-700 font-bold">已复制</Text>
                            </>
                          ) : (
                            <>
                              <Copy size={13} color="#7C7670" />
                              <Text className="text-[11px] text-[#2B2826] font-semibold">复制</Text>
                            </>
                          )}
                        </Pressable>

                        {!item.is_used && (
                          <Pressable
                            onPress={() => handleToggleDisable(item)}
                            disabled={disableLoading === item.id}
                            className="w-7 h-7 rounded-lg items-center justify-center bg-[#F7F5EE] border border-border/40 active:opacity-70">
                            {disableLoading === item.id ? (
                              <ActivityIndicator size="small" color="#7C6FCD" />
                            ) : item.is_disabled ? (
                              <ShieldCheck size={12} color="#059669" />
                            ) : (
                              <ShieldOff size={12} color="#DC2626" />
                            )}
                          </Pressable>
                        )}

                        {!item.is_used && (
                          <Pressable
                            onPress={() => setDeleteId(item.id)}
                            className="w-7 h-7 rounded-lg items-center justify-center bg-red-50 border border-red-200 active:opacity-70">
                            <Trash2 size={12} color="#DC2626" />
                          </Pressable>
                        )}
                      </View>
                    </View>

                    {/* 兑换码单行完整展示（整行可点击快速复制） */}
                    <Pressable
                      onPress={() => handleCopy(item.code, item.id)}
                      className="flex-row items-center justify-between bg-[#F7F5EE]/50 px-2.5 py-1.5 rounded-lg mb-1 active:bg-[#F7F5EE]">
                      <Text
                        className="text-[#2B2826] text-sm font-mono font-bold tracking-wider"
                        style={{ textDecorationLine: item.is_disabled ? 'line-through' : 'none' }}>
                        {item.code}
                      </Text>
                      <Copy size={12} color="#A09B94" />
                    </Pressable>

                    {/* 底部信息行 */}
                    <View className="flex-row flex-wrap items-center gap-1.5 text-xs text-[#7C7670]">
                      <Clock size={11} color="#A09B94" />
                      <Text className="text-[11px] text-[#7C7670]">
                        {item.duration_days > 0 ? `${item.duration_days}天` : '永久'}
                      </Text>
                      {item.expires_at && (
                        <>
                          <Text className="text-[11px] text-[#A09B94]">·</Text>
                          <Text className="text-[11px] text-[#7C7670]">
                            到期 {formatDate(item.expires_at, false)}
                          </Text>
                        </>
                      )}
                      {item.batch_label && (
                        <>
                          <Text className="text-[11px] text-[#A09B94]">·</Text>
                          <Text className="text-[11px] text-[#7C7670] max-w-[150px]" numberOfLines={1}>
                            {item.batch_label}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 2: 密钥兑换记录卡片（用户需求：详细审计流水，防卡单卡会员）
           ───────────────────────────────────────────────────────────── */}
        {activeTab === 'records' && (
          <View className="bg-white rounded-2xl p-4 border border-border/40 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-1.5">
                <FileText size={16} color="#059669" />
                <Text className="text-[#2B2826] font-bold text-sm">用户密钥兑换记录</Text>
              </View>
              <Text className="text-xs text-[#7C7670]">共 {filteredRecords.length} 条流水</Text>
            </View>

            {/* 提示文案卡 */}
            <View className="bg-[#ECFDF5] rounded-xl p-3 mb-3 border border-emerald-200">
              <Text className="text-emerald-800 text-xs leading-relaxed font-medium">
                💡 记录每位用户激活兑换密钥的完整日志（包含兑换账号、使用时间、套餐规格与到期日），便于管理员实时核验，防范卡单或权益异常。
              </Text>
            </View>

            {/* 搜索框 */}
            <View className="flex-row items-center bg-[#F7F5EE] rounded-xl px-3 py-2 mb-3 border border-border/30">
              <Search size={14} color="#7C7670" className="mr-2" />
              <TextInput
                value={searchRecordText}
                onChangeText={setSearchRecordText}
                placeholder="搜索手机号、密钥Code或批次备注..."
                placeholderTextColor="#A09B94"
                className="flex-1 text-xs text-[#2B2826] p-0"
              />
              {searchRecordText.length > 0 && (
                <Pressable onPress={() => setSearchRecordText('')} className="p-1">
                  <X size={12} color="#7C7670" />
                </Pressable>
              )}
            </View>

            {/* 筛选标签条 */}
            <View className="flex-row items-center gap-1.5 mb-3">
              {[
                { key: 'all', label: '全部套餐' },
                ...PLAN_OPTIONS.map(p => ({ key: p, label: PLAN_LABELS[p] })),
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setFilterRecordPlan(opt.key)}
                  className="px-2.5 py-1 rounded-full border"
                  style={{
                    backgroundColor: filterRecordPlan === opt.key ? '#059669' : '#F7F5EE',
                    borderColor: filterRecordPlan === opt.key ? '#059669' : '#E5E1D5',
                  }}>
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: filterRecordPlan === opt.key ? '#FFFFFF' : '#7C7670' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 兑换记录卡片列表 */}
            {filteredRecords.length === 0 ? (
              <View className="py-12 items-center justify-center bg-[#F7F5EE]/40 rounded-xl">
                <FileText size={36} color="#DBD6CA" />
                <Text className="text-[#7C7670] text-xs mt-2 font-medium">暂无符合条件的密钥兑换记录</Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {filteredRecords.map((rec) => (
                  <View
                    key={rec.id}
                    className="p-3.5 rounded-xl border border-border/40 bg-[#FCFBF8] shadow-sm">
                    {/* 第一行：兑换人手机号 + 套餐类型 + 生效状态 */}
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-2">
                        <View className="w-6 h-6 rounded-full bg-emerald-100 items-center justify-center">
                          <UserCheck size={12} color="#059669" />
                        </View>
                        <Text className="text-[#2B2826] text-xs font-bold font-mono">
                          {rec.user_phone || '未绑定手机'}
                        </Text>
                        <View
                          className="px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: PLAN_BG[rec.plan_id] || '#F3F0E6' }}>
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: PLAN_COLORS[rec.plan_id] || '#7C6FCD' }}>
                            {PLAN_LABELS[rec.plan_id] || rec.plan_id}
                          </Text>
                        </View>
                      </View>

                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{
                          backgroundColor:
                            rec.status === 'revoked'
                              ? '#FEE2E2'
                              : rec.status === 'expired'
                                ? '#F3F4F6'
                                : '#ECFDF5',
                        }}>
                        <Text
                          className="text-[10px] font-bold"
                          style={{
                            color:
                              rec.status === 'revoked'
                                ? '#DC2626'
                                : rec.status === 'expired'
                                  ? '#6B7280'
                                  : '#059669',
                          }}>
                          {rec.status === 'revoked' ? '已取消' : rec.status === 'expired' ? '已到期' : '生效中'}
                        </Text>
                      </View>
                    </View>

                    {/* 第二行：兑换的密钥代码与复制（整行可点击复制） */}
                    <Pressable
                      onPress={() => handleCopy(rec.code, `rec_code_${rec.id}`)}
                      className={`flex-row items-center justify-between rounded-lg px-2.5 py-2 mb-2 border active:opacity-75 ${
                        copiedId === `rec_code_${rec.id}`
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-[#F7F5EE] border-border/30'
                      }`}>
                      <View className="flex-row items-center gap-1.5 flex-1 min-w-0 mr-2">
                        <Key size={12} color="#DE6B35" />
                        <Text className="text-[#2B2826] text-xs font-mono font-bold tracking-wider">
                          {rec.code}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1 flex-shrink-0">
                        {copiedId === `rec_code_${rec.id}` ? (
                          <>
                            <Check size={12} color="#059669" />
                            <Text className="text-[11px] text-emerald-700 font-bold">已复制</Text>
                          </>
                        ) : (
                          <>
                            <Copy size={12} color="#7C7670" />
                            <Text className="text-[11px] text-[#7C7670] font-semibold">复制</Text>
                          </>
                        )}
                      </View>
                    </Pressable>

                    {/* 第三行：时间与天数详情 */}
                    <View className="flex-row flex-wrap items-center justify-between text-[11px] text-[#7C7670]">
                      <View className="flex-row items-center gap-1">
                        <Clock size={11} color="#A09B94" />
                        <Text className="text-[11px] text-[#7C7670]">
                          兑换时间: {formatDate(rec.used_at, true)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Calendar size={11} color="#A09B94" />
                        <Text className="text-[11px] text-[#7C7670]">
                          会员至: {formatDate(rec.expires_at, false)} ({rec.duration_days}天)
                        </Text>
                      </View>
                    </View>

                    {rec.batch_label && (
                      <View className="mt-1 pt-1 border-t border-border/20 flex-row items-center gap-1">
                        <Text className="text-[10px] text-[#A09B94]">批次备注:</Text>
                        <Text className="text-[10px] text-[#7C7670]">{rec.batch_label}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 3: 会员用户管理卡片（用户需求：支持管理员手动延长/取消会员）
           ───────────────────────────────────────────────────────────── */}
        {activeTab === 'members' && (
          <View className="bg-white rounded-2xl p-4 border border-border/40 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-1.5">
                <Users size={16} color="#7C6FCD" />
                <Text className="text-[#2B2826] font-bold text-sm">会员用户管理与运维</Text>
              </View>
              <Text className="text-xs text-[#7C7670]">共 {filteredUsers.length} 位用户</Text>
            </View>

            {/* 提示文案卡 */}
            <View className="bg-[#FAF5FF] rounded-xl p-3 mb-3 border border-purple-200">
              <Text className="text-purple-900 text-xs leading-relaxed font-medium">
                🛠️ 支持对任意用户进行手动延长会员有效期（快速+7/+30/+90天或自定义），或手动取消会员订阅降级为体验版，操作即时生效。
              </Text>
            </View>

            {/* 搜索框 */}
            <View className="flex-row items-center bg-[#F7F5EE] rounded-xl px-3 py-2 mb-3 border border-border/30">
              <Search size={14} color="#7C7670" className="mr-2" />
              <TextInput
                value={searchMemberText}
                onChangeText={setSearchMemberText}
                placeholder="搜索手机号或用户ID..."
                placeholderTextColor="#A09B94"
                className="flex-1 text-xs text-[#2B2826] p-0"
              />
              {searchMemberText.length > 0 && (
                <Pressable onPress={() => setSearchMemberText('')} className="p-1">
                  <X size={12} color="#7C7670" />
                </Pressable>
              )}
            </View>

            {/* 筛选标签条 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <View className="flex-row items-center gap-1.5">
                {[
                  { key: 'all', label: '全部套餐' },
                  ...PLAN_OPTIONS.map(p => ({ key: p, label: PLAN_LABELS[p] })),
                  { key: 'free', label: '体验版' },
                ].map(opt => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setFilterMemberPlan(opt.key)}
                    className="px-2.5 py-1 rounded-full border"
                    style={{
                      backgroundColor: filterMemberPlan === opt.key ? '#7C6FCD' : '#F7F5EE',
                      borderColor: filterMemberPlan === opt.key ? '#7C6FCD' : '#E5E1D5',
                    }}>
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: filterMemberPlan === opt.key ? '#FFFFFF' : '#7C7670' }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}

                <View className="w-px h-4 bg-border/60 mx-1" />

                {[
                  { key: 'all', label: '全部状态' },
                  { key: 'active', label: '活跃会员' },
                  { key: 'cancelled', label: '已取消' },
                  { key: 'free', label: '体验版' },
                ].map(opt => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setFilterMemberStatus(opt.key)}
                    className="px-2.5 py-1 rounded-full border"
                    style={{
                      backgroundColor: filterMemberStatus === opt.key ? '#DE6B35' : '#F7F5EE',
                      borderColor: filterMemberStatus === opt.key ? '#DE6B35' : '#E5E1D5',
                    }}>
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: filterMemberStatus === opt.key ? '#FFFFFF' : '#7C7670' }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* 用户列表卡片 */}
            {filteredUsers.length === 0 ? (
              <View className="py-12 items-center justify-center bg-[#F7F5EE]/40 rounded-xl">
                <Users size={36} color="#DBD6CA" />
                <Text className="text-[#7C7670] text-xs mt-2 font-medium">无符合条件的用户</Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {filteredUsers.map((user) => {
                  const isActive = user.status === 'active';
                  return (
                    <View
                      key={user.id}
                      className="p-3.5 rounded-xl border border-border/40 bg-[#FCFBF8] shadow-sm">
                      <View className="flex-row items-center justify-between mb-2">
                        {/* 用户身份与套餐 */}
                        <View className="flex-row items-center gap-2">
                          <View className="w-7 h-7 rounded-full bg-[#7C6FCD]/15 items-center justify-center">
                            <Users size={14} color="#7C6FCD" />
                          </View>
                          <View>
                            <Text className="text-[#2B2826] text-xs font-bold font-mono">
                              {user.phone ? user.phone : `用户-${user.id.slice(0, 8)}`}
                            </Text>
                            <Text className="text-[10px] text-[#A09B94]">
                              注册: {formatDate(user.created_at, false)}
                            </Text>
                          </View>
                        </View>

                        {/* 套餐徽章与状态 */}
                        <View className="flex-row items-center gap-1.5">
                          <View
                            className="px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: PLAN_BG[user.plan_id] || '#F3F0E6' }}>
                            <Text
                              className="text-[10px] font-bold"
                              style={{ color: PLAN_COLORS[user.plan_id] || '#7C6FCD' }}>
                              {PLAN_LABELS[user.plan_id] || user.plan_id}
                            </Text>
                          </View>
                          <View
                            className="px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: isActive
                                ? '#ECFDF5'
                                : user.status === 'cancelled'
                                  ? '#FEE2E2'
                                  : '#F3F4F6',
                            }}>
                            <Text
                              className="text-[10px] font-bold"
                              style={{
                                color: isActive
                                  ? '#059669'
                                  : user.status === 'cancelled'
                                    ? '#DC2626'
                                    : '#6B7280',
                              }}>
                              {isActive ? '活跃' : user.status === 'cancelled' ? '已取消' : '体验版'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* 到期时间 */}
                      <View className="flex-row items-center justify-between bg-[#F7F5EE] rounded-lg px-2.5 py-1.5 mb-2.5">
                        <View className="flex-row items-center gap-1.5">
                          <Calendar size={12} color="#7C7670" />
                          <Text className="text-xs text-[#2B2826]">
                            到期时间:{' '}
                            <Text className="font-semibold text-[#DE6B35]">
                              {formatDate(user.expires_at, false)}
                            </Text>
                          </Text>
                        </View>
                        {user.redeemed_code && (
                          <Text className="text-[10px] text-[#A09B94] font-mono">
                            来自: {user.redeemed_code}
                          </Text>
                        )}
                      </View>

                      {/* 操作按钮区：手动延长 / 取消会员 */}
                      <View className="flex-row items-center justify-end gap-2 pt-1 border-t border-border/20">
                        {/* 手动延长 */}
                        <Pressable
                          onPress={() => {
                            setExtendUser(user);
                            setExtendPlan(user.plan_id === 'pro' ? 'pro' : 'basic');
                            setExtendDays('30');
                          }}
                          className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-[#7C6FCD]/12 border border-[#7C6FCD]/30">
                          <Clock size={12} color="#7C6FCD" />
                          <Text className="text-xs font-bold text-[#7C6FCD]">延长会员</Text>
                        </Pressable>

                        {/* 手动取消（仅当为活跃会员或非体验版时展示） */}
                        {(isActive || user.plan_id !== 'free') && (
                          <Pressable
                            onPress={() => setCancelUser(user)}
                            className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
                            <UserX size={12} color="#DC2626" />
                            <Text className="text-xs font-bold text-red-600">取消会员</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: 批量生成兑换密钥弹窗
         ───────────────────────────────────────────────────────────── */}
      <Modal visible={showGen} transparent animationType="slide">
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setShowGen(false)}>
          <Pressable
            onPress={e => e.stopPropagation()}
            className="bg-white rounded-t-3xl px-6 pt-5 pb-10 border-t border-border/40 shadow-xl">
            <View className="flex-row items-center justify-between mb-5">
              <View className="flex-row items-center gap-2">
                <Sparkles size={18} color="#DE6B35" />
                <Text className="text-[#2B2826] font-bold text-base">批量生成兑换密钥</Text>
              </View>
              <Pressable
                onPress={() => setShowGen(false)}
                className="w-7 h-7 rounded-full bg-[#F7F5EE] items-center justify-center">
                <X size={14} color="#7C7670" />
              </Pressable>
            </View>

            {/* 套餐选择 */}
            <Text className="text-[#2B2826] text-xs font-semibold mb-2">选择会员规格</Text>
            <View className="flex-row gap-3 mb-4">
              {PLAN_OPTIONS.map(p => (
                <Pressable
                  key={p}
                  onPress={() => setGenPlan(p)}
                  className="flex-1 py-3 rounded-xl items-center"
                  style={{
                    backgroundColor: genPlan === p ? PLAN_BG[p] : '#F7F5EE',
                    borderWidth: 1.5,
                    borderColor: genPlan === p ? PLAN_COLORS[p] : 'transparent',
                  }}>
                  <Text
                    className="text-sm font-bold"
                    style={{ color: genPlan === p ? PLAN_COLORS[p] : '#7C7670' }}>
                    {PLAN_LABELS[p]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 数量 + 天数 */}
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Text className="text-[#2B2826] text-xs font-semibold mb-1.5">生成数量（1-100）</Text>
                <TextInput
                  value={genCount}
                  onChangeText={setGenCount}
                  keyboardType="numeric"
                  placeholder="5"
                  placeholderTextColor="#A09B94"
                  className="bg-[#F7F5EE] rounded-xl px-4 py-3 text-[#2B2826] text-sm border border-border/30"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[#2B2826] text-xs font-semibold mb-1.5">有效天数（0=永久）</Text>
                <TextInput
                  value={genDays}
                  onChangeText={setGenDays}
                  keyboardType="numeric"
                  placeholder="365"
                  placeholderTextColor="#A09B94"
                  className="bg-[#F7F5EE] rounded-xl px-4 py-3 text-[#2B2826] text-sm border border-border/30"
                />
              </View>
            </View>

            {/* 批次备注 */}
            <Text className="text-[#2B2826] text-xs font-semibold mb-1.5">批次备注（可选）</Text>
            <TextInput
              value={genLabel}
              onChangeText={setGenLabel}
              placeholder="例如：2026年9月活动批次"
              placeholderTextColor="#A09B94"
              className="bg-[#F7F5EE] rounded-xl px-4 py-3 text-[#2B2826] text-sm mb-4 border border-border/30"
            />

            {/* 结果区域 */}
            {genMsg && (
              <View
                className="rounded-xl p-3 mb-3 border"
                style={{
                  backgroundColor: genMsg.ok ? '#ECFDF5' : '#FEE2E2',
                  borderColor: genMsg.ok ? '#A7F3D0' : '#FECACA',
                }}>
                <Text
                  className="text-xs font-medium"
                  style={{ color: genMsg.ok ? '#059669' : '#DC2626' }}>
                  {genMsg.text}
                </Text>
              </View>
            )}

            {generatedCodes.length > 0 && (
              <View className="bg-[#F7F5EE] rounded-xl p-3 mb-4 border border-border/40">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[#2B2826] text-xs font-bold">新生成的密钥</Text>
                  <Pressable
                    onPress={() => handleCopy(generatedCodes.join('\n'), 'all_gen')}
                    className="flex-row items-center gap-1 px-2 py-1 rounded-lg bg-white border border-border/30">
                    {copiedId === 'all_gen' ? (
                      <Check size={12} color="#059669" />
                    ) : (
                      <Copy size={12} color="#7C6FCD" />
                    )}
                    <Text className="text-xs font-medium text-[#7C6FCD]">
                      {copiedId === 'all_gen' ? '已复制全部' : '复制全部'}
                    </Text>
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                  {generatedCodes.map(c => (
                    <Text key={c} className="text-[#2B2826] text-xs font-mono py-0.5">
                      {c}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            )}

            <Pressable
              onPress={handleGenerate}
              disabled={genLoading}
              className="py-3.5 rounded-xl items-center bg-[#DE6B35] shadow-sm">
              {genLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-bold text-sm">确认生成密钥</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: 管理员手动延长会员有效期弹窗
         ───────────────────────────────────────────────────────────── */}
      <Modal visible={!!extendUser} transparent animationType="slide">
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setExtendUser(null)}>
          <Pressable
            onPress={e => e.stopPropagation()}
            className="bg-white rounded-t-3xl px-6 pt-5 pb-10 border-t border-border/40 shadow-xl">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <Clock size={18} color="#7C6FCD" />
                <Text className="text-[#2B2826] font-bold text-base">手动延长会员有效期</Text>
              </View>
              <Pressable
                onPress={() => setExtendUser(null)}
                className="w-7 h-7 rounded-full bg-[#F7F5EE] items-center justify-center">
                <X size={14} color="#7C7670" />
              </Pressable>
            </View>

            {extendUser && (
              <View className="bg-[#F7F5EE] rounded-xl p-3 mb-4 border border-border/40">
                <Text className="text-xs text-[#2B2826] font-bold mb-1">
                  目标用户: {extendUser.phone || extendUser.id}
                </Text>
                <Text className="text-[11px] text-[#7C7670]">
                  当前套餐: {PLAN_LABELS[extendUser.plan_id] || extendUser.plan_id} · 当前到期:{' '}
                  {formatDate(extendUser.expires_at, false)}
                </Text>
              </View>
            )}

            {/* 选择目标套餐 */}
            <Text className="text-[#2B2826] text-xs font-semibold mb-2">指定套餐等级</Text>
            <View className="flex-row gap-3 mb-4">
              {PLAN_OPTIONS.map(p => (
                <Pressable
                  key={p}
                  onPress={() => setExtendPlan(p)}
                  className="flex-1 py-2.5 rounded-xl items-center border"
                  style={{
                    backgroundColor: extendPlan === p ? PLAN_BG[p] : '#F7F5EE',
                    borderColor: extendPlan === p ? PLAN_COLORS[p] : 'transparent',
                  }}>
                  <Text
                    className="text-xs font-bold"
                    style={{ color: extendPlan === p ? PLAN_COLORS[p] : '#7C7670' }}>
                    {PLAN_LABELS[p]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 快捷天数选项 */}
            <Text className="text-[#2B2826] text-xs font-semibold mb-2">快捷延长时间</Text>
            <View className="flex-row gap-2 mb-3">
              {[
                { days: '7', label: '+7天' },
                { days: '30', label: '+30天' },
                { days: '90', label: '+90天' },
                { days: '365', label: '+1年' },
              ].map(opt => (
                <Pressable
                  key={opt.days}
                  onPress={() => setExtendDays(opt.days)}
                  className="flex-1 py-2 rounded-lg items-center border"
                  style={{
                    backgroundColor: extendDays === opt.days ? '#7C6FCD' : '#F7F5EE',
                    borderColor: extendDays === opt.days ? '#7C6FCD' : '#E5E1D5',
                  }}>
                  <Text
                    className="text-xs font-bold"
                    style={{ color: extendDays === opt.days ? '#FFFFFF' : '#7C7670' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 自定义天数输入 */}
            <Text className="text-[#2B2826] text-xs font-semibold mb-1.5">或输入自定义天数</Text>
            <TextInput
              value={extendDays}
              onChangeText={setExtendDays}
              keyboardType="numeric"
              placeholder="输入延期天数，例如 30"
              placeholderTextColor="#A09B94"
              className="bg-[#F7F5EE] rounded-xl px-4 py-3 text-[#2B2826] text-sm mb-5 border border-border/30"
            />

            <Pressable
              onPress={handleExtendSubscription}
              disabled={extendLoading}
              className="py-3.5 rounded-xl items-center bg-[#7C6FCD] shadow-sm">
              {extendLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-bold text-sm">确认立即延长会员</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: 管理员手动取消会员确认弹窗
         ───────────────────────────────────────────────────────────── */}
      <Modal visible={!!cancelUser} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl border border-border/40">
            <View className="w-10 h-10 rounded-full bg-red-100 items-center justify-center mx-auto mb-3">
              <UserX size={20} color="#DC2626" />
            </View>
            <Text className="text-[#2B2826] font-bold text-base mb-2 text-center">
              确认取消该用户会员？
            </Text>
            <Text className="text-[#7C7670] text-xs text-center mb-5 leading-relaxed">
              取消后用户将立即降级为【免费体验版】，会员有效期重置，专属测评与高级功能将被阻断。此操作可随时通过延长重新激活。
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setCancelUser(null)}
                className="flex-1 py-2.5 rounded-xl items-center bg-[#F7F5EE] border border-border/40">
                <Text className="text-[#2B2826] font-medium text-xs">取消</Text>
              </Pressable>
              <Pressable
                onPress={handleCancelSubscription}
                disabled={cancelLoading}
                className="flex-1 py-2.5 rounded-xl items-center bg-red-600 shadow-sm">
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-xs">确认取消</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: 删除兑换码确认弹窗
         ───────────────────────────────────────────────────────────── */}
      <Modal visible={!!deleteId} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl border border-border/40">
            <View className="w-10 h-10 rounded-full bg-red-100 items-center justify-center mx-auto mb-3">
              <Trash2 size={20} color="#DC2626" />
            </View>
            <Text className="text-[#2B2826] font-bold text-base mb-2 text-center">确认删除密钥</Text>
            <Text className="text-[#7C7670] text-xs text-center mb-5 leading-relaxed">
              删除后该兑换码将无法被任何用户使用，此操作不可撤销。
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl items-center bg-[#F7F5EE] border border-border/40">
                <Text className="text-[#2B2826] font-medium text-xs">取消</Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2.5 rounded-xl items-center bg-red-600 shadow-sm">
                {deleteLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-xs">删除</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
