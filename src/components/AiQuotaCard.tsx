import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles, Zap, Clock, ChevronRight } from 'lucide-react-native';
import { useAiQuota } from '@/hooks/useAiQuota';

interface Props {
  onUpgradePress?: () => void;
  hideUpgradeButton?: boolean;
}

export default function AiQuotaCard({ onUpgradePress, hideUpgradeButton = false }: Props) {
  const router = useRouter();
  const { quota } = useAiQuota();

  const percent = Math.min(100, Math.max(0, Math.round((quota.used / Math.max(1, quota.limit)) * 100)));
  const isExhausted = quota.remaining <= 0;

  const planLabels: Record<string, string> = {
    free: '体验版 (5点/日)',
    basic: '心愈版 (50点/日)',
    pro: 'AI工作台版 (100点/日)',
  };

  const currentPlanLabel = planLabels[quota.planId] ?? '体验版 (5点/日)';

  const handleAction = () => {
    if (onUpgradePress) {
      onUpgradePress();
    } else {
      router.push('/(app)/subscription' as any);
    }
  };

  return (
    <View
      className="bg-card rounded-2xl p-4 overflow-hidden"
      style={{
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(224,122,95,0.08)' }],
        borderWidth: 1,
        borderColor: 'rgba(224,122,95,0.18)',
      }}
    >
      {/* 标题栏 */}
      <View className="flex-row items-center justify-between mb-2.5">
        <View className="flex-row items-center gap-2.5 flex-1 min-w-0 pr-2">
          <View className="w-9 h-9 rounded-xl items-center justify-center bg-orange-100 flex-shrink-0">
            <Sparkles size={18} color="#E07A5F" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-foreground font-bold text-sm" numberOfLines={1}>
              今日 AI 额度积分
            </Text>
            <View className="flex-row items-center mt-1">
              <View className="bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200 self-start">
                <Text style={{ fontSize: 10, color: '#E07A5F', fontWeight: '700' }} numberOfLines={1}>
                  {currentPlanLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 数值占比 */}
        <View className="items-end flex-shrink-0">
          <View className="flex-row items-baseline gap-1">
            <Text
              className="text-lg font-extrabold"
              style={{ color: isExhausted ? '#EF4444' : '#E07A5F' }}
            >
              {quota.used}
            </Text>
            <Text className="text-muted-foreground text-xs font-semibold">
              / {quota.limit} 点
            </Text>
          </View>
          <Text className="text-[10px] text-muted-foreground font-medium">
            今日已消耗
          </Text>
        </View>
      </View>

      {/* 额度进度条 */}
      <View className="w-full h-2.5 bg-muted rounded-full overflow-hidden my-2">
        <View
          style={{
            height: '100%',
            width: `${percent}%`,
            backgroundColor: isExhausted ? '#EF4444' : '#E07A5F',
            borderRadius: 99,
          }}
        />
      </View>

      {/* 剩余额度与说明 */}
      <View className="flex-row items-center justify-between mt-1">
        <View className="flex-row items-center gap-1.5 flex-1 min-w-0 pr-2">
          <Clock size={12} color="#78756E" />
          <Text style={{ fontSize: 11, color: '#78756E' }} numberOfLines={1}>
            剩余 <Text style={{ color: isExhausted ? '#EF4444' : '#E07A5F', fontWeight: '700' }}>{quota.remaining}</Text> 点 · 每日 24:00 重置
          </Text>
        </View>

        {!hideUpgradeButton && (
          <Pressable
            onPress={handleAction}
            className="flex-row items-center gap-0.5 bg-orange-50 px-2.5 py-1 rounded-xl active:opacity-70 border border-orange-200/60 flex-shrink-0"
          >
            <Zap size={11} color="#E07A5F" />
            <Text style={{ fontSize: 11, color: '#E07A5F', fontWeight: '700' }}>
              {quota.planId === 'pro' ? '查看权益' : '提升额度'}
            </Text>
            <ChevronRight size={11} color="#E07A5F" />
          </Pressable>
        )}
      </View>

      {/* 额度消耗说明（规整分行排布） */}
      <View style={{
        marginTop: 10,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        gap: 5,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#9CA3AF' }} />
          <Text style={{ fontSize: 11, color: '#6B7280', flex: 1, lineHeight: 16 }}>
            大模型对话 · 智能体 · AI深度解读 · 心绘生图 每次扣减5点
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#E07A5F' }} />
          <Text style={{ fontSize: 11, color: '#9CA3AF', flex: 1, lineHeight: 16 }}>
            体验版 5点/日(1次) · 心愈版 50点/日(10次) · 工作台版 100点/日(20次)
          </Text>
        </View>
      </View>
    </View>
  );
}
export { AiQuotaCard };
