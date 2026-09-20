/**
 * useAiQuota — 全局每日 AI 积分额度管理 hook
 * 每日动态计算，0点归零重置不累计
 * - 体验版：5 积分/日
 * - 心愈版：50 积分/日
 * - AI工作台版：100 积分/日
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import { useFocusEffect } from 'expo-router';

export interface AiQuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  planId: string;
}

export function useAiQuota() {
  const { session } = useSession();
  const [quota, setQuota] = useState<AiQuotaInfo>({
    used: 0,
    limit: 5,
    remaining: 5,
    planId: 'free',
  });
  const [loading, setLoading] = useState(true);

  const fetchQuota = useCallback(async () => {
    if (!session) {
      setQuota({ used: 0, limit: 5, remaining: 5, planId: 'free' });
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_my_ai_quota');
      if (!error && data) {
        setQuota({
          used: Number(data.used ?? 0),
          limit: Number(data.limit ?? 5),
          remaining: Number(data.remaining ?? 5),
          planId: String(data.plan_id ?? 'free'),
        });
      }
    } catch {
      // 容错兜底
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchQuota();
    }, [fetchQuota])
  );

  /**
   * 消耗积分，若额度不足则返回 false 并提供错误信息
   * 默认单次对话/AI交互扣减 5 点
   */
  const consumeCredits = useCallback(
    async (cost = 5): Promise<{ allowed: boolean; remaining: number; message?: string }> => {
      if (!session) {
        return { allowed: false, remaining: 0, message: '请先登录后使用 AI 功能' };
      }
      try {
        const { data, error } = await supabase.rpc('check_and_consume_ai_credits', {
          p_cost: cost,
        });
        if (error || !data) {
          return { allowed: false, remaining: 0, message: error?.message || '积分扣减失败' };
        }
        if (data.allowed) {
          setQuota({
            used: Number(data.used ?? 0),
            limit: Number(data.limit ?? 5),
            remaining: Number(data.remaining ?? 0),
            planId: String(data.plan_id ?? 'free'),
          });
          return { allowed: true, remaining: Number(data.remaining ?? 0) };
        } else {
          setQuota(prev => ({
            ...prev,
            used: Number(data.used ?? prev.used),
            remaining: Number(data.remaining ?? 0),
          }));
          return {
            allowed: false,
            remaining: Number(data.remaining ?? 0),
            message: data.message || '今日 AI 积分不足（每次交互消耗5点），每日24:00自动重置',
          };
        }
      } catch (err: any) {
        return { allowed: false, remaining: 0, message: err?.message || '网络异常' };
      }
    },
    [session]
  );

  return {
    quota,
    loading,
    refreshQuota: fetchQuota,
    consumeCredits,
  };
}

/**
 * 独立直接调用的消费扣减函数（可在非组件生命周期中直接调用）
 * 默认单次对话/AI交互扣减 5 点
 */
export async function checkAndConsumeCredits(
  cost = 5
): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('check_and_consume_ai_credits', {
      p_cost: cost,
    });
    if (error || !data) {
      return { allowed: false, remaining: 0, message: error?.message || '积分扣减失败' };
    }
    if (data.allowed) {
      return { allowed: true, remaining: Number(data.remaining ?? 0) };
    } else {
      return {
        allowed: false,
        remaining: Number(data.remaining ?? 0),
        message: data.message || '今日 AI 积分不足（每次交互消耗5点），每日24:00自动重置',
      };
    }
  } catch (err: any) {
    return { allowed: false, remaining: 0, message: err?.message || '网络异常' };
  }
}
