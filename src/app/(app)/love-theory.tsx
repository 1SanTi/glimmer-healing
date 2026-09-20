/**
 * love-theory.tsx — 亲密关系心理理论科普
 * 手绘卡片形式呈现关系心理学理论，支持折叠展开
 */
import { useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react-native';

interface TheoryCard {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
  source: string;        // 来源著作
  summary: string;       // 一句话简介
  detail: string;        // 详细说明
  keyPoints: string[];   // 核心要点
  lifeApp: string;       // 生活应用
  expertId?: string;     // 关联咨询师
  expertName?: string;
  expertEmoji?: string;
}

const THEORIES: TheoryCard[] = [
  {
    id: 'triangle',
    title: '爱情三角理论',
    subtitle: '斯滕伯格 · 1986',
    emoji: '🔺',
    color: '#E06A8C',
    bg: '#FFF0F5',
    border: '#F5C8D8',
    source: '《爱情心理学》',
    summary: '爱情由亲密、激情、承诺三种成分构成，缺一不可。',
    detail: '心理学家斯滕伯格认为，完整的爱（consummate love）需要三个维度共同发展：\n\n① **亲密**（Intimacy）——情感上的连接、温暖与亲近感\n② **激情**（Passion）——生理吸引与强烈的渴望\n③ **承诺**（Commitment）——对关系的长期投入与决定',
    keyPoints: [
      '只有亲密 → 喜欢之爱（友谊）',
      '只有激情 → 迷恋之爱（痴迷）',
      '只有承诺 → 空洞之爱（没有情感的婚姻）',
      '三者皆有 → 完整之爱',
    ],
    lifeApp: '定期审视关系：哪个维度最需要培养？一起做新鲜事可以激活激情；深度对话可以增加亲密；共同规划未来可以强化承诺。',
    expertId: 'rosenberg',
    expertName: '卢森堡',
    expertEmoji: '🕊️',
  },
  {
    id: 'attachment',
    title: '依恋理论',
    subtitle: '鲍尔比 & 安斯沃思',
    emoji: '🤝',
    color: '#9B8EC4',
    bg: '#F5F0FF',
    border: '#D4C8F5',
    source: '《依恋》三部曲',
    summary: '童年与照料者的依恋模式，会延续影响成年后的亲密关系。',
    detail: '依恋理论由约翰·鲍尔比提出，玛丽·安斯沃思通过陌生情境实验（Strange Situation）发展了四种依恋风格：\n\n🕊️ **安全型**——对亲密感到自在，能独立也能依赖\n🌊 **焦虑-矛盾型**——渴望亲密但害怕被抛弃，情绪敏感\n🏔️ **回避型**——不舒适于亲密，倾向情感独立\n⚡ **混乱型**——对亲密既渴望又恐惧，源于早期创伤',
    keyPoints: [
      '依恋风格不是固定不变的',
      '安全型依恋可以在后天习得',
      '了解伴侣的依恋风格有助于理解其行为',
      '治疗性关系本身就能提供修复体验',
    ],
    lifeApp: '当伴侣显得"粘人"或"冷漠"时，尝试用依恋的视角理解：这不是对你的评价，而是ta应对不安全感的方式。',
    expertId: 'satir',
    expertName: '萨提亚',
    expertEmoji: '🌸',
  },
  {
    id: 'gottman',
    title: '末日四骑士',
    subtitle: '戈特曼 · 关系杀手',
    emoji: '⚡',
    color: '#C4856A',
    bg: '#FFF5EE',
    border: '#F0D8C0',
    source: '《爱的博弈》',
    summary: '戈特曼研究发现四种沟通模式能以93%的准确率预测离婚。',
    detail: '约翰·戈特曼通过40年研究，发现了预测关系破裂的"末日四骑士"：\n\n🧨 **批评**（Criticism）——攻击伴侣的人格，而非行为\n🛡️ **蔑视**（Contempt）——嘲讽、翻白眼、贬低——最具破坏力\n🧱 **防御**（Defensiveness）——为自己辩解，拒绝承担责任\n🧊 **冷战**（Stonewalling）——情感上完全关闭、退出对话',
    keyPoints: [
      '蔑视是最危险的骑士',
      '每次负面互动需5次正面互动来抵消（5:1法则）',
      '修复尝试（Repair Attempt）是健康关系的关键',
      '了解对方的"爱之梦"是解开冲突的钥匙',
    ],
    lifeApp: '当你发现自己在批评（"你总是……"）时，尝试用"我"陈述替代："当……发生时，我感到……我希望……"',
    expertId: 'rosenberg',
    expertName: '卢森堡',
    expertEmoji: '🕊️',
  },
  {
    id: 'satir',
    title: '萨提亚沟通姿态',
    subtitle: '维吉尼亚·萨提亚',
    emoji: '🌸',
    color: '#E06A8C',
    bg: '#FFF0F5',
    border: '#F5C8D8',
    source: '《新家庭如何塑造人》',
    summary: '在压力下，人会采用四种"防御性"沟通姿态来保护自我价值感。',
    detail: '萨提亚发现，当人感到自我价值受威胁时，会采用四种求生存姿态：\n\n😔 **讨好**——忽略自我，只顾他人与情境（"都是我的错"）\n😤 **指责**——忽略他人，只顾自我与情境（"都是你的错"）\n🤖 **超理智**——忽略自我与他人，只剩规则与逻辑\n🎭 **打岔**——忽略自我、他人与情境，回避真实',
    keyPoints: [
      '每种姿态都有其正向资源',
      '目标不是消除，而是"添加"新觉察',
      '一致性沟通同时关照自我、他人、情境',
      '自我价值感越高，越能采用一致性表达',
    ],
    lifeApp: '留意自己在冲突中习惯哪种姿态？不评判，只好奇：这种姿态在过去保护了什么？现在它还需要吗？',
    expertId: 'satir',
    expertName: '萨提亚',
    expertEmoji: '🌸',
  },
  {
    id: 'nvc',
    title: '非暴力沟通四步法',
    subtitle: '马歇尔·卢森堡',
    emoji: '🕊️',
    color: '#5B9BD5',
    bg: '#F0F7FF',
    border: '#B8D8F5',
    source: '《非暴力沟通》',
    summary: '用观察、感受、需要、请求四要素，消解语言中的暴力。',
    detail: '马歇尔·卢森堡发展的非暴力沟通（NVC），帮助我们从"评判语言"转向"联结语言"：\n\n👁️ **观察**——描述具体、客观可见的事实（不带评判）\n💙 **感受**——表达真实情绪词（而非"感觉被忽视"这样的想法）\n🌱 **需要**——识别感受背后未被满足的普世需求\n🤲 **请求**——提出具体、积极、可行的行动请求',
    keyPoints: [
      '"你总是迟到"是评论，"今天你晚了20分钟"是观察',
      '感受的根源在于自身的需要，而非他人的行为',
      '愤怒的背后往往藏着未被满足的渴望',
      '请求不等于要求——允许对方说"不"',
    ],
    lifeApp: '下次想说"你怎么总是这样"时，先停一秒：我观察到什么？我现在感到什么？我需要什么？我可以怎么请求？',
    expertId: 'rosenberg',
    expertName: '卢森堡',
    expertEmoji: '🕊️',
  },
  {
    id: 'exchange',
    title: '社会交换理论',
    subtitle: '霍曼斯 · 布劳',
    emoji: '⚖️',
    color: '#7A9D8C',
    bg: '#F0FAF5',
    border: '#B8E8D4',
    source: '《社会行为：基本形式》',
    summary: '人们在关系中像在交易，追求收益最大化和成本最小化。',
    detail: '社会交换理论认为，人际关系中存在一种隐性的"经济逻辑"：\n\n• **收益**（Rewards）——愉悦、陪伴、安全感、物质帮助\n• **成本**（Costs）——时间、精力、情绪消耗、妥协\n• **比较水平**（CL）——你期望关系应该有多好\n• **替代比较水平**（CLalt）——你觉得有没有更好的选择',
    keyPoints: [
      '满意度 = 收益 - 成本',
      '当实际体验 > 期望水平时，关系满意',
      '公平（equity）比平等（equality）更重要',
      '感知到不公平时会产生愤恨或内疚',
    ],
    lifeApp: '思考：你在这段关系中的付出与收获是否让你感到公平？如果不平衡，是哪里出了问题？',
  },
  {
    id: 'proximity',
    title: '邻近性原则',
    subtitle: '费斯廷格 · 1950年代',
    emoji: '📍',
    color: '#E8A365',
    bg: '#FFF8EE',
    border: '#F5E0C0',
    source: '《社会压力》',
    summary: '物理距离越近，越容易发展亲密关系——但心理距离更重要。',
    detail: '费斯廷格的研究发现，宿舍楼里，住得越近的人越容易成为朋友。这背后有两个机制：\n\n• **曝光效应**（Mere Exposure Effect）——重复接触会增加好感\n• **功能距离**（Functional Distance）——交叉路径的频率比实际距离更重要\n\n但在现代，"异地恋"挑战了这一理论——心理距离（情感亲密度）可以弥补物理距离。',
    keyPoints: [
      '高频深度的沟通能维持跨越距离的亲密',
      '视频通话比文字更能维持情感连接',
      '共同仪式感（如每晚通话）对异地关系至关重要',
      '物理重聚的质量比频率更影响关系满意度',
    ],
    lifeApp: '如果你正在维持异地关系：把精力放在"深度沟通"而非"高频联系"上，共同体验（远程看同一部电影）比单纯汇报生活更有效。',
    expertId: 'satir',
    expertName: '萨提亚',
    expertEmoji: '🌸',
  },
];

const THEME = {
  bg: '#FFF8FB',
  header: '#FFF0F5',
  headerBorder: '#F5C8D8',
  primary: '#E06A8C',
  text: '#3D1020',
  sub: '#A05878',
};

function TheoryCardItem({ card, onExpertPress }: { card: TheoryCard; onExpertPress: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    setExpanded(e => {
      Animated.spring(animation, { toValue: e ? 0 : 1, useNativeDriver: true, tension: 60, friction: 10 }).start();
      return !e;
    });
  };

  const rotate = animation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={{
      backgroundColor: card.bg, borderRadius: 20, borderWidth: 1.5, borderColor: card.border,
      marginBottom: 14, overflow: 'hidden',
    }}>
      {/* 卡片头部 */}
      <Pressable onPress={toggle} style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{
            width: 50, height: 50, borderRadius: 16, backgroundColor: card.color + '20',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 26 }}>{card.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: THEME.text }}>{card.title}</Text>
            </View>
            <Text style={{ fontSize: 11, color: card.color, fontWeight: '600', marginBottom: 4 }}>
              {card.subtitle} · {card.source}
            </Text>
            <Text style={{ fontSize: 12, color: THEME.sub, lineHeight: 18 }}>{card.summary}</Text>
          </View>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <ChevronDown size={20} color={card.color} />
          </Animated.View>
        </View>
      </Pressable>

      {/* 展开内容 */}
      {expanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View style={{ height: 1, backgroundColor: card.border, marginBottom: 14 }} />

          {/* 详细说明 */}
          <Text style={{ fontSize: 13, color: THEME.text, lineHeight: 23, marginBottom: 14 }}>
            {card.detail.replace(/\*\*/g, '').replace(/\n\n/g, '\n\n')}
          </Text>

          {/* 核心要点 */}
          <View style={{
            backgroundColor: card.color + '10', borderRadius: 14, padding: 12, marginBottom: 12,
            borderWidth: 1, borderColor: card.color + '30',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: card.color, marginBottom: 8 }}>💡 核心要点</Text>
            {card.keyPoints.map((pt, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 5 }}>
                <Text style={{ fontSize: 12, color: card.color, fontWeight: '700', width: 16 }}>•</Text>
                <Text style={{ flex: 1, fontSize: 12, color: THEME.text, lineHeight: 19 }}>{pt}</Text>
              </View>
            ))}
          </View>

          {/* 生活应用 */}
          <View style={{
            backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 12,
            borderWidth: 1, borderColor: card.border,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: THEME.primary, marginBottom: 6 }}>🌱 生活应用</Text>
            <Text style={{ fontSize: 12, color: THEME.sub, lineHeight: 19 }}>{card.lifeApp}</Text>
          </View>

          {/* 关联咨询师 */}
          {card.expertId && (
            <Pressable onPress={() => onExpertPress(card.expertId!)} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: card.color + '12', borderRadius: 14, padding: 12,
              borderWidth: 1.5, borderColor: card.color + '40',
            }}>
              <Text style={{ fontSize: 20 }}>{card.expertEmoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: card.color }}>
                  与{card.expertName}咨询师深入探讨
                </Text>
                <Text style={{ fontSize: 11, color: THEME.sub, marginTop: 2 }}>
                  将这个理论应用到你的关系实践中
                </Text>
              </View>
              <ExternalLink size={14} color={card.color} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export default function LoveTheoryScreen() {
  const router = useRouter();
  const [filterColor, setFilterColor] = useState<string | null>(null);

  const colors = [...new Set(THEORIES.map(t => t.color))];

  const filtered = filterColor ? THEORIES.filter(t => t.color === filterColor) : THEORIES;

  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg }}>
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View style={{
        backgroundColor: THEME.header, borderBottomWidth: 1, borderBottomColor: THEME.headerBorder,
        paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <Pressable onPress={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(224,106,140,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowLeft size={20} color={THEME.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: THEME.text }}>📚 关系理论科普</Text>
          <Text style={{ fontSize: 12, color: THEME.sub, marginTop: 1 }}>
            {THEORIES.length} 张知识卡片 · 点击展开详情
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* 导语 */}
        <View style={{ margin: 16, padding: 14, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: THEME.headerBorder }}>
          <Text style={{ fontSize: 13, color: THEME.sub, lineHeight: 21 }}>
            💌 这些理论来自心理学大师的毕生研究。它们不是评判你的标准，而是帮你理解自己和伴侣的「地图」。带着好奇心来探索吧～
          </Text>
        </View>

        {/* 理论卡片 */}
        <View style={{ marginHorizontal: 16 }}>
          {filtered.map(card => (
            <TheoryCardItem
              key={card.id}
              card={card}
              onExpertPress={(id) => router.push(`/(app)/chat/${id}` as RelativePathString)}
            />
          ))}
        </View>

        {/* 底部推荐 */}
        <View style={{ marginHorizontal: 16, marginTop: 8 }}>
          <View style={{ padding: 16, backgroundColor: '#FFF0F5', borderRadius: 20, borderWidth: 1.5, borderColor: THEME.headerBorder }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.primary, marginBottom: 8 }}>
              🌹 想将理论用于实践？
            </Text>
            <Text style={{ fontSize: 12, color: THEME.sub, lineHeight: 20, marginBottom: 12 }}>
              与萨提亚或卢森堡咨询师深入对话，他们会帮你把这些理论变成真实关系中的改变。
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => router.push('/(app)/chat/satir' as RelativePathString)}
                style={{ flex: 1, backgroundColor: THEME.primary, borderRadius: 14, paddingVertical: 11, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>🌸 萨提亚</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/(app)/chat/rosenberg' as RelativePathString)}
                style={{ flex: 1, backgroundColor: '#5B9BD5', borderRadius: 14, paddingVertical: 11, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>🕊️ 卢森堡</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
