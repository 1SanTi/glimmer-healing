import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Phone } from 'lucide-react-native';

const HOTLINES = [
  { name: '全国心理援助热线', number: '12356', desc: '24小时服务' },
  { name: '全国心理援助热线', number: '400-161-9995', desc: '24小时免费服务' },
  { name: '北京心理危机研究与干预中心', number: '010-82951332', desc: '24小时服务' },
  { name: '上海心理援助热线', number: '021-12320-5', desc: '24小时服务' },
  { name: '广州心理援助热线', number: '020-12320-5', desc: '工作时间服务' },
];

const SECTIONS = [
  {
    emoji: '🚨',
    title: '识别危机信号',
    color: '#E88A7D',
    items: [
      '持续两周以上的情绪低落、兴趣丧失',
      '出现「不想活了」「死了算了」等念头',
      '频繁哭泣、无法正常工作学习',
      '失眠或过度睡眠、食欲明显变化',
      '感到极度绝望、无助、没有价值',
      '开始整理遗物或告别行为',
    ],
  },
  {
    emoji: '🤝',
    title: '如何帮助他人',
    color: '#7A9D8C',
    items: [
      '认真倾听，不评判、不质疑对方的感受',
      '直接询问：「你有没有想过伤害自己？」',
      '陪伴在身边，不要留对方单独面对危机',
      '帮助联系专业人员或拨打援助热线',
      '移除可能用于自伤的物品',
      '告知家人或亲近朋友共同关注',
    ],
  },
  {
    emoji: '🌱',
    title: '自我急救技术',
    color: '#E8A365',
    items: [
      '保险箱技术：想象把痛苦的念头放进保险箱锁起来',
      '着陆练习：说出5种颜色、4种触感、3种声音',
      '4-7-8呼吸：吸气4秒、屏息7秒、呼气8秒',
      '冷水刺激：将脸浸入冷水10-15秒，激活潜水反射',
      '写下三件今天还好的事情',
      '立刻联系一位信任的人倾诉',
    ],
  },
  {
    emoji: '😰',
    title: '应对急性焦虑恐慌',
    color: '#9B8EC4',
    items: [
      '提醒自己：恐慌发作不会致命，它会在20分钟内消退',
      '用腹式深呼吸减慢呼吸节律',
      '5-4-3-2-1感官着陆：视觉5/触觉4/听觉3/嗅觉2/味觉1',
      '缓慢说「我很安全，这会过去的」',
      '寻找一个安静的地方，减少刺激输入',
    ],
  },
  {
    emoji: '💤',
    title: '情绪急救快速工具',
    color: '#5B9BD5',
    items: [
      '运动发泄：快走20分钟能显著降低皮质醇',
      '正念冥想：用微光心愈呼吸冥想练习5分钟',
      '写情绪日记：将情绪命名并写出来',
      '与宠物或大自然接触',
      '听自己最喜欢的音乐',
      '给一位朋友发消息表达感谢',
    ],
  },
];

export default function FirstAidScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="flex-row items-center px-4 pt-14 pb-4">
        <Pressable onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center mr-3">
          <ArrowLeft size={18} color="#6B7280" />
        </Pressable>
        <Text className="text-foreground font-bold text-lg">心理急救手册 🩺</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {/* 紧急求助 */}
        <View className="bg-destructive/10 rounded-3xl p-4 mb-5 border border-destructive/20">
          <Text className="text-destructive font-bold text-base mb-3">🆘 紧急求助热线</Text>
          <View className="gap-2">
            {HOTLINES.map(h => (
              <Pressable key={h.number}
                className="flex-row items-center bg-white rounded-2xl px-4 py-3"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] }}
                onPress={() => Linking.openURL(`tel:${h.number}`)}>
                <View className="w-8 h-8 rounded-full bg-destructive/10 items-center justify-center mr-3">
                  <Phone size={14} color="#EF4444" />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground text-xs font-medium">{h.name}</Text>
                  <Text className="text-muted-foreground text-xs">{h.desc}</Text>
                </View>
                <Text className="text-destructive font-bold text-sm">{h.number}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 各章节 */}
        {SECTIONS.map(section => (
          <View key={section.title} className="mb-5">
            <View className="flex-row items-center gap-2 mb-3">
              <Text style={{ fontSize: 20 }}>{section.emoji}</Text>
              <Text className="text-foreground font-bold text-sm">{section.title}</Text>
            </View>
            <View className="bg-card rounded-2xl p-4 gap-2"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.04)' }] }}>
              {section.items.map((item, i) => (
                <View key={i} className="flex-row items-start gap-2">
                  <View className="w-5 h-5 rounded-full items-center justify-center mt-0.5 flex-shrink-0"
                    style={{ backgroundColor: section.color + '20' }}>
                    <Text style={{ fontSize: 10, color: section.color, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text className="text-muted-foreground text-xs leading-5 flex-1">{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* 底部提示 */}
        <View className="bg-amber-50 rounded-2xl p-4">
          <Text className="text-amber-800 font-semibold text-sm mb-1">💛 记住</Text>
          <Text className="text-amber-700 text-xs leading-5">
            寻求帮助是勇敢的行为，不是软弱的表现。你不需要一个人面对。微光心愈的AI专家随时在这里陪伴你，同时我们也鼓励你联系真实的专业支持。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
