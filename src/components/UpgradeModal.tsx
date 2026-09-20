/**
 * UpgradeModal — 订阅等级不足时的升级引导弹窗
 * 用法：
 *   const [showUpgrade, setShowUpgrade] = useState(false);
 *   <UpgradeModal
 *     visible={showUpgrade}
 *     onClose={() => setShowUpgrade(false)}
 *     requiredLevel={1}
 *     featureName="AI专家咨询"
 *     featureDesc="与10位流派专家一对一深度对话，解锁全部心愈功能"
 *   />
 */
import { Modal, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Crown, Zap, Sparkles, Lock, X, ChevronRight } from 'lucide-react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 需要的最低等级：1=心愈版 2=AI工作台版 */
  requiredLevel: 1 | 2;
  /** 功能名称，如「AI专家咨询」 */
  featureName: string;
  /** 功能简介 */
  featureDesc?: string;
}

const PLAN_INFO = {
  1: {
    name: '心愈版',
    color: '#7C6FCD',
    icon: <Crown size={22} color="#7C6FCD" />,
    tagline: '深度心愈，专属AI陪伴',
    features: ['AI专家无限对话', '全部心理测评', 'OH卡/心灵绘画', '沙盘疗愈', '梦境解析', '音乐疗愈全库', '爱情实验室'],
  },
  2: {
    name: 'AI工作台版',
    color: '#E8A365',
    icon: <Zap size={22} color="#E8A365" />,
    tagline: '专业教师/咨询师首选',
    features: ['心绘小屋AI绘画', 'AI工作台（无限制）', '个人备课中心', '含心愈版全部功能'],
  },
};

export default function UpgradeModal({ visible, onClose, requiredLevel, featureName, featureDesc }: Props) {
  const router = useRouter();
  const plan = PLAN_INFO[requiredLevel];

  const handleGoSubscription = () => {
    onClose();
    router.push('/(app)/subscription' as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onPress={onClose}>
        <Pressable
          onPress={e => e.stopPropagation()}
          className="bg-card rounded-3xl mx-5 overflow-hidden w-full max-w-sm"
          style={{
            boxShadow: [{ offsetX: 0, offsetY: 16, blurRadius: 48, color: 'rgba(0,0,0,0.22)' }],
          } as any}>

          {/* 顶部色带 */}
          <View className="h-2" style={{ backgroundColor: plan.color }} />

          {/* 内容 */}
          <View className="px-6 pt-5 pb-6">
            {/* 关闭按钮 */}
            <Pressable onPress={onClose}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-muted items-center justify-center z-10">
              <X size={14} color="#6B7280" />
            </Pressable>

            {/* 锁图标 */}
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: plan.color + '18' }}>
                <Lock size={28} color={plan.color} />
              </View>
              <Text className="text-foreground font-bold text-lg text-center">
                {featureName}
              </Text>
              {featureDesc && (
                <Text className="text-muted-foreground text-xs text-center mt-1 leading-5">
                  {featureDesc}
                </Text>
              )}
            </View>

            {/* 需要套餐说明 */}
            <View className="rounded-2xl p-4 mb-4"
              style={{ backgroundColor: plan.color + '0E', borderWidth: 1, borderColor: plan.color + '28' }}>
              <View className="flex-row items-center gap-2 mb-2">
                {plan.icon}
                <View>
                  <Text className="font-bold text-sm" style={{ color: plan.color }}>{plan.name}</Text>
                  <Text className="text-muted-foreground text-xs">{plan.tagline}</Text>
                </View>
              </View>
              <View className="gap-1.5">
                {plan.features.map(f => (
                  <View key={f} className="flex-row items-center gap-2">
                    <View className="w-4 h-4 rounded-full items-center justify-center"
                      style={{ backgroundColor: plan.color + '20' }}>
                      <Sparkles size={9} color={plan.color} />
                    </View>
                    <Text className="text-xs text-foreground">{f}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 操作按钮 */}
            <Pressable
              onPress={handleGoSubscription}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl mb-3"
              style={{ backgroundColor: plan.color }}>
              <Text className="text-white font-bold text-sm">查看套餐 · 输入兑换码</Text>
              <ChevronRight size={16} color="#fff" />
            </Pressable>
            <Pressable onPress={onClose} className="py-2 items-center">
              <Text className="text-muted-foreground text-sm">稍后再说</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
