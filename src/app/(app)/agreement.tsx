import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Crown, Gift, ShieldCheck } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { ADMIN_PHONE, isAdminLoginEnabled } from '@/lib/adminConfig';

const SECTIONS = [
  {
    title: '1. 服务说明',
    content: `微光心愈（Glimmer Healing）是一款心理健康辅助应用，提供以下服务：

• AI心理陪伴对话（基于五大心理学流派）
• 心理健康自测与评估
• 匿名情感倾诉与社区交流
• 心理知识科普与积极心理学学习
• 心理健康数据追踪与可视化

重要声明：微光心愈提供的所有服务均为心理健康辅助性质，不构成专业心理诊断、心理治疗或医疗建议，不能替代专业心理咨询师或精神科医生的专业服务。`,
  },
  {
    title: '2. 用户资格',
    content: `使用本应用，您须满足以下条件：

• 年龄须满14周岁（14-18周岁未成年人需在监护人同意下使用）
• 具有完全民事行为能力，或经监护人授权
• 提供真实有效的注册信息
• 遵守中华人民共和国相关法律法规`,
  },
  {
    title: '3. 用户行为规范',
    content: `使用本应用时，您同意：

• 不发布违法、有害、骚扰性、歧视性或攻击他人的内容
• 不冒充他人或虚假陈述个人身份
• 不利用应用从事任何商业推广活动
• 不尝试破解、干扰应用正常运行或服务器安全
• 不传播可能伤害他人心理健康的内容

违反上述规定，我们有权暂停或终止您的账号，并保留追究法律责任的权利。`,
  },
  {
    title: '4. AI对话免责声明',
    content: `关于AI心理咨询对话功能，请注意：

• AI对话基于大语言模型技术，不具备真实心理咨询师的资质与判断力
• AI的回复可能存在不准确、不完整的情况
• 对话内容不应被视为专业医疗或心理诊断意见
• 如您处于心理危机状态（如有自伤、自杀念头），请立即拨打专业热线：12356 或 400-161-9995

我方对用户依赖AI对话内容做出的决定不承担责任。`,
  },
  {
    title: '5. 知识产权',
    content: `应用内所有内容的知识产权归微光心愈所有，包括但不限于：

• 应用界面设计与交互逻辑
• 科普文章、心理测评题目与结果解析
• 心理专家形象设计与对话脚本
• 应用图标、插图与多媒体资源

用户不得未经授权复制、传播、修改上述内容。用户创作的内容（如树洞发帖）版权归用户所有，但用户授予我们在应用内展示的非排他性许可。`,
  },
  {
    title: '6. 服务变更与终止',
    content: `我们保留以下权利：

• 随时修改、暂停或终止部分或全部服务功能
• 重大变更将提前通过应用内通知或邮件告知用户
• 因不可抗力（如自然灾害、政策调整）导致服务中断的，我方不承担责任

如我们决定终止服务，将提前30天通知用户，并提供数据导出渠道。`,
  },
  {
    title: '7. 责任限制',
    content: `在法律允许的最大范围内：

• 我们不对使用本应用产生的间接损失或利润损失承担责任
• 我们对直接损失的赔偿总额不超过您过去12个月内支付给我们的费用
• 对于免费服务，我们不承担任何损害赔偿责任`,
  },
  {
    title: '8. 争议解决',
    content: `本协议适用中华人民共和国法律。如发生争议，双方应首先协商解决；协商不成的，提交本公司注册地有管辖权的人民法院诉讼解决。

本协议最后更新日期：2024年1月1日`,
  },
];

export default function AgreementScreen() {
  const router = useRouter();
  const { session } = useSession();
  const isAdmin = isAdminLoginEnabled && session?.user?.phone === ADMIN_PHONE;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="flex-row items-center px-4 pt-14 pb-4">
        <Pressable onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center mr-3">
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="text-foreground font-bold text-lg">用户协议</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View className="bg-primary/8 rounded-2xl p-4 mb-5">
          <Text className="text-foreground font-semibold text-sm mb-1">📋 使用前请仔细阅读</Text>
          <Text className="text-muted-foreground text-xs leading-5">
            本用户协议（「协议」）是您与微光心愈之间就使用应用所订立的法律协议。注册或使用应用即表示您已阅读、理解并接受本协议。
          </Text>
        </View>

        {SECTIONS.map(section => (
          <View key={section.title} className="mb-5">
            <Text className="text-foreground font-bold text-sm mb-2">{section.title}</Text>
            <View className="bg-card rounded-2xl p-4"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.03)' }] }}>
              <Text className="text-muted-foreground text-xs leading-6">{section.content}</Text>
            </View>
          </View>
        ))}

        {/* ── 管理员后台入口（仅管理员可见，置于会员条款上方）── */}
        {isAdmin && (
          <Pressable
            onPress={() => router.push('/(app)/admin-dashboard' as any)}
            className="rounded-2xl p-4 mb-5 flex-row items-center gap-4"
            style={{
              backgroundColor: 'rgba(31,41,55,0.96)',
              borderWidth: 1.5,
              borderColor: 'rgba(124,111,205,0.45)',
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(124,111,205,0.25)' }],
            }}
          >
            <View className="w-12 h-12 rounded-2xl items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(124,111,205,0.20)' }}>
              <ShieldCheck size={24} color="#9B8EC4" />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-0.5">
                <Text style={{ color: '#E0D9FF', fontWeight: '700', fontSize: 15 }}>管理员后台</Text>
                <View style={{ backgroundColor: 'rgba(232,163,101,0.25)', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: '#E8A365', fontSize: 9, fontWeight: '700' }}>ADMIN</Text>
                </View>
              </View>
              <Text style={{ color: '#9CA3AF', fontSize: 12 }}>密钥管理 · 套餐控制 · 数据统计</Text>
            </View>
            <Text style={{ color: '#9B8EC4', fontSize: 22 }}>›</Text>
          </Pressable>
        )}

        {/* ── 会员服务条款入口（协议末尾）── */}
        <View className="rounded-2xl overflow-hidden mb-5"
          style={{
            borderWidth: 1,
            borderColor: 'rgba(124,111,205,0.25)',
            backgroundColor: 'rgba(124,111,205,0.05)',
          }}>
          <View className="px-4 pt-4 pb-3 border-b border-border/50">
            <View className="flex-row items-center gap-2 mb-1">
              <Crown size={16} color="#7C6FCD" />
              <Text className="text-foreground font-bold text-sm">9. 会员服务条款</Text>
            </View>
            <Text className="text-muted-foreground text-xs leading-5">
              微光心愈提供三级会员套餐（体验版 / 心愈版 / AI工作台版），通过官方渠道颁发的兑换码激活。会员权益以激活时套餐说明为准，到期后自动降级至体验版，已使用的功能数据不受影响。
            </Text>
          </View>
          <View className="px-4 py-3">
            <Text className="text-muted-foreground text-xs leading-5 mb-3">
              • 兑换码一经激活不可退款，请妥善保管{'\n'}
              • 同一账号兑换高级套餐将覆盖现有套餐{'\n'}
              • 套餐功能可能随版本更新调整，调整前将提前通知{'\n'}
              • 如有套餐争议，请通过官方渠道联系客服
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/subscription' as any)}
              className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
              style={{ backgroundColor: '#7C6FCD' }}>
              <Gift size={16} color="#fff" />
              <Text className="text-white font-bold text-sm">查看套餐 · 输入兑换码</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
