/**
 * useSubscription — 全局订阅等级读取 hook
 * 读取当前用户的 plan_id，返回等级数字（0=免费 1=心愈版 2=AI工作台版）
 * 使用 useFocusEffect：页面每次获得焦点时重新查询，确保兑换/购买后状态及时同步
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import { useFocusEffect } from 'expo-router';

export type PlanId = 'free' | 'basic' | 'pro';

export interface SubscriptionState {
  planId: PlanId;
  level: number;       // 0 | 1 | 2
  loading: boolean;
  expiresAt: string | null;
}

export function useSubscription(): SubscriptionState {
  const { session } = useSession();
  const [state, setState] = useState<SubscriptionState>({
    planId: 'free',
    level: 0,
    loading: true,
    expiresAt: null,
  });

  const fetchSubscription = useCallback(async () => {
    if (!session) {
      setState({ planId: 'free', level: 0, loading: false, expiresAt: null });
      return;
    }
    setState(s => ({ ...s, loading: true }));
    const { data } = await supabase
      .from('user_subscriptions')
      .select('plan_id, status, expires_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const now = new Date();
    const isActive =
      data?.status === 'active' &&
      (!data.expires_at || new Date(data.expires_at) > now);

    const planId: PlanId = isActive ? (data!.plan_id as PlanId) : 'free';
    const LEVEL: Record<PlanId, number> = { free: 0, basic: 1, pro: 2 };
    setState({
      planId,
      level: LEVEL[planId],
      loading: false,
      expiresAt: isActive ? data?.expires_at ?? null : null,
    });
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchSubscription();
    }, [fetchSubscription])
  );

  return state;
}
