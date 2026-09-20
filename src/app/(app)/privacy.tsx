import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { PRIVACY_CONTACT_EMAIL } from '@/lib/contact';

const SECTIONS = [
  {
    title: '1. 信息收集',
    content: `我们收集以下类型的用户信息以提供服务：

• 账号信息：注册时提供的电子邮箱地址
• 使用数据：心情打卡记录、心理测评结果、幸福度日志
• 互动内容：树洞发帖内容、AI对话记录
• 设备信息：设备类型、操作系统版本（用于技术支持）

我们不会在未经授权的情况下收集敏感个人信息（如身份证号、银行账户等）。`,
  },
  {
    title: '2. 信息使用',
    content: `收集的信息仅用于以下目的：

• 提供个性化的心理健康服务
• 改进应用功能与用户体验
• 保障账号安全与防止滥用
• 生成匿名化统计数据以优化产品

我们不会将个人信息用于广告定向或出售给第三方。`,
  },
  {
    title: '3. 信息保护',
    content: `我们采取以下措施保护您的数据安全：

• 数据传输：使用 TLS/SSL 加密所有数据传输
• 数据存储：用户数据存储于经过安全认证的云服务器（Supabase）
• 访问控制：严格限制内部员工对用户数据的访问权限
• 定期安全审计：定期对系统进行安全漏洞检测与修复`,
  },
  {
    title: '4. 信息共享',
    content: `我们承诺不会将您的个人信息出售、出租或以任何方式提供给第三方，以下情况除外：

• 经您明确授权同意
• 依法履行法律义务或响应政府机构要求
• 为保护微光心愈、其用户或公众的合法权益

AI对话功能使用第三方AI服务（MiniMax），对话内容以脱敏方式传输，不包含可识别个人身份的信息。`,
  },
  {
    title: '5. 用户权利',
    content: `您对自己的个人数据享有以下权利：

• 查看权：随时查看您在应用中存储的个人数据
• 修改权：更新您的账号信息与个人资料
• 删除权：申请删除您的账号及所有相关数据
• 导出权：申请导出您的心理测评记录与日志数据

如需行使上述权利，请通过「我的→联系我们」渠道提交申请，我们将在15个工作日内响应。`,
  },
  {
    title: '6. 儿童隐私',
    content: `微光心愈不面向13岁以下儿童提供服务。如我们发现收集了儿童个人信息，将立即删除相关数据。如果您认为我们可能收集了您孩子的信息，请立即联系我们。`,
  },
  {
    title: '7. 隐私政策更新',
    content: `本隐私政策可能不时更新。重大变更将通过应用内通知或电子邮件提前告知用户。继续使用应用即表示您接受更新后的政策。

本政策最后更新日期：2024年1月1日`,
  },
  {
    title: '8. 联系方式',
    content: `如您对本隐私政策有任何疑问，请联系我们：

邮箱：${PRIVACY_CONTACT_EMAIL}
地址：中国（具体地址请通过邮件咨询）`,
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="flex-row items-center px-4 pt-14 pb-4">
        <Pressable onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center mr-3">
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="text-foreground font-bold text-lg">隐私政策</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View className="bg-primary/8 rounded-2xl p-4 mb-5">
          <Text className="text-foreground font-semibold text-sm mb-1">🔒 您的隐私我们认真对待</Text>
          <Text className="text-muted-foreground text-xs leading-5">
            本隐私政策适用于微光心愈（Glimmer Healing）应用程序。请仔细阅读以了解我们如何收集、使用和保护您的个人信息。
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
      </ScrollView>
    </View>
  );
}
