import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { CONTACT_EMAIL, CONTACT_WEBSITE } from '@/lib/contact';

const FEATURES = [
  { emoji: '💬', title: '沉浸式AI陪伴', desc: '基于5大心理学流派的专家AI，随时随地给你专业的心理陪伴' },
  { emoji: '🌳', title: '匿名树洞', desc: '安全的倾诉空间，释放内心压力，感受来自陌生人的温暖共鸣' },
  { emoji: '🧪', title: '趣味心理测评', desc: 'SCL-90、MBTI、VIA品格优势等专业测评，深度了解自己' },
  { emoji: '🎮', title: '心理互动游戏', desc: '呼吸冥想、压力气球、心灵速写，用游戏化方式疏导情绪' },
  { emoji: '📚', title: '心理科普学苑', desc: '专业心理学知识科普，帮你建立科学的心理健康认知' },
  { emoji: '📈', title: '成长轨迹追踪', desc: '幸福曲线、心情日历、测评历史，见证你的心理成长之路' },
];

export default function AboutScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="flex-row items-center px-4 pt-14 pb-4">
        <Pressable onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center mr-3">
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="text-foreground font-bold text-lg">关于微光心愈</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {/* 品牌展示 */}
        <View className="items-center py-6 mb-6">
          <Text style={{ fontSize: 64, marginBottom: 12 }}>🔆</Text>
          <Text className="text-foreground font-bold text-2xl">微光心愈</Text>
          <Text className="text-muted-foreground text-sm mt-1">Glimmer Healing</Text>
          <View className="bg-primary/10 rounded-full px-4 py-1.5 mt-3">
            <Text className="text-primary text-xs font-semibold">版本 1.0.0</Text>
          </View>
        </View>

        {/* 使命宣言 */}
        <View className="bg-card rounded-3xl p-5 mb-5"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
          <Text className="text-foreground font-bold text-base mb-3">✨ 我们的使命</Text>
          <Text className="text-muted-foreground text-sm leading-7">
            微光心愈诞生于一个简单的信念：每个人内心都有一束微光，等待被看见、被疗愈、被点亮。
            {'\n\n'}
            我们致力于将心理学的专业力量，以温暖、有趣、无压力的方式带给每一位需要陪伴的人。从「关注问题」转向「关注优势」，帮助你在日常中发现内在的韧性与美好。
          </Text>
        </View>

        {/* 核心功能 */}
        <Text className="text-foreground font-bold text-base mb-3">🌟 核心功能</Text>
        <View className="gap-3 mb-5">
          {FEATURES.map(f => (
            <View key={f.title} className="bg-card rounded-2xl p-4 flex-row items-start gap-3"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.04)' }] }}>
              <Text style={{ fontSize: 24, marginTop: 2 }}>{f.emoji}</Text>
              <View className="flex-1">
                <Text className="text-foreground font-semibold text-sm">{f.title}</Text>
                <Text className="text-muted-foreground text-xs mt-0.5 leading-4">{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 理念 */}
        <View className="bg-primary/8 rounded-3xl p-5 mb-5">
          <Text className="text-foreground font-bold text-base mb-3">💡 设计理念</Text>
          <Text className="text-muted-foreground text-sm leading-7">
            基于积极心理学（Positive Psychology）的核心理论，微光心愈聚焦于挖掘用户的品格优势与内在资源。我们整合了以下五大心理学流派：{'\n\n'}
            <Text className="text-foreground font-semibold">人本主义 · 认知行为 · 格式塔 · 行为主义 · 心理动力学{'\n\n'}</Text>
            为用户提供多元化、个性化的心理成长路径。
          </Text>
        </View>

        {/* 免责声明 */}
        <View className="bg-amber-50 rounded-2xl p-4 mb-5">
          <Text className="text-amber-800 font-semibold text-sm mb-2">⚠️ 重要声明</Text>
          <Text className="text-amber-700 text-xs leading-5">
            微光心愈是一款心理健康辅助工具，提供的内容仅供参考，不构成专业心理诊断或医疗建议。如您有持续、严重的心理健康问题，请及时寻求专业心理咨询师或精神科医生的帮助。
          </Text>
        </View>

        {/* 联系我们 */}
        <View className="bg-card rounded-2xl p-4"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.04)' }] }}>
          <Text className="text-foreground font-bold text-sm mb-2">📮 联系我们</Text>
          <Text className="text-muted-foreground text-xs leading-5">
            如有任何问题或建议，欢迎联系我们：{'\n'}
            邮箱：{CONTACT_EMAIL}{'\n'}
            官网：{CONTACT_WEBSITE}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
