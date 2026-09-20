/**
 * love-lab.tsx — 亲密关系研究室主入口
 * 四大功能模块：关系网络图 / 理论科普 / 关系日历 / 关系定位地图
 */
import { useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';

// 四大模块配置
const MODULES = [
  {
    id: 'network',
    path: '/(app)/love-network',
    emoji: '🕸️',
    title: '关系网络图',
    subtitle: '绘制你的亲密关系社交地图',
    desc: '添加重要他人，用节点图可视化你与他们的心理距离和关系质量，AI为你生成深度关系洞察。',
    color: '#DE6B35',
    iconBg: '#FFF3EB',
    tag: '社会支持网络',
  },
  {
    id: 'theory',
    path: '/(app)/love-theory',
    emoji: '📚',
    title: '关系理论科普',
    subtitle: '有趣的心理学知识卡片',
    desc: '爱情三角理论、依恋类型、戈特曼末日四骑士、萨提亚沟通姿态……用有趣的卡片带你了解关系心理学。',
    color: '#7C6FCD',
    iconBg: '#F3F0FF',
    tag: '知识卡片',
  },
  {
    id: 'calendar',
    path: '/(app)/love-calendar',
    emoji: '📅',
    title: '关系日历',
    subtitle: '记录关系中的每一个时刻',
    desc: '用日历记录与亲密对象的美好或困难时刻，标记纪念日，在时间线中回顾你们共同经历的故事。',
    color: '#D97706',
    iconBg: '#FEF3C7',
    tag: '私密日记',
  },
  {
    id: 'map',
    path: '/(app)/love-map',
    emoji: '🗺️',
    title: '关系定位地图',
    subtitle: '物理距离 × 心理距离可视化',
    desc: '在地图上标记亲密对象的位置，拖动心理距离滑块，AI根据物理/心理距离反差给出关系维护建议。',
    color: '#3B82F6',
    iconBg: '#EFF6FF',
    tag: '地理关系',
  },
];

// 关联咨询师
const EXPERTS = [
  { id: 'satir',     name: '萨提亚', emoji: '🌸', desc: '探索内在冰山，学习一致性沟通', color: '#DE6B35' },
  { id: 'rosenberg', name: '卢森堡', emoji: '🕊️', desc: '非暴力沟通四要素，重构关系表达', color: '#3B82F6' },
  { id: 'rogers',    name: '罗杰斯', emoji: '🌻', desc: '无条件接纳，深度共情陪伴', color: '#7C6FCD' },
];

export default function LoveLabScreen() {
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;

  // 顶部封面视差收缩：高度从 116 → 56，紧凑不留空白
  const headerH = scrollY.interpolate({ inputRange: [0, 80], outputRange: [116, 56], extrapolate: 'clamp' });
  const coverOpacity = scrollY.interpolate({ inputRange: [0, 50], outputRange: [1, 0], extrapolate: 'clamp' });
  const miniTitleOpacity = scrollY.interpolate({ inputRange: [40, 70], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F6F2' }}>
      <StatusBar style="dark" />

      {/* 收缩顶部封面 */}
      <Animated.View style={{
        height: headerH, overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1, borderBottomColor: '#EFECE6',
      }}>
        {/* ── 固定导航行：返回按钮（始终可见） ── */}
        <View style={{
          position: 'absolute', top: 12, left: 16, right: 16,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          height: 36,
        }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: '#F3EFE9',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={20} color="#4A4540" />
          </Pressable>

          {/* 收缩后淡入的小标题，与返回按钮平行 */}
          <Animated.Text
            numberOfLines={1}
            style={{
              fontSize: 16, fontWeight: '700', color: '#2B2826',
              opacity: miniTitleOpacity, flex: 1,
            }}
          >
            亲密关系研究室 💑
          </Animated.Text>
        </View>

        {/* ── 展开时底部大标题（单行，滚动淡出） ── */}
        <Animated.View style={{
          position: 'absolute', bottom: 12, left: 16, right: 16,
          opacity: coverOpacity,
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <Text style={{ fontSize: 24 }}>💑</Text>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 19, fontWeight: '800', color: '#2B2826', letterSpacing: 0.2 }}
            >
              亲密关系研究室
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: '#7C7670', marginTop: 1 }}>
              用科学的眼光，温柔地看见爱
            </Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* 主内容 */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 40 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        {/* 氛围导语卡片 */}
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: '#EFECE6',
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.03)' }],
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <Text style={{ fontSize: 24, marginTop: 2 }}>🌹</Text>
            <Text style={{ flex: 1, fontSize: 13, color: '#4A4540', lineHeight: 22 }}>
              亲密关系是人类最深刻的需求之一。这里融合了心理学前沿研究，帮你看见关系的模式、理解彼此的内心，找到更有爱的相处方式。
            </Text>
          </View>
        </View>

        {/* 四大模块 */}
        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#2B2826', marginBottom: 12 }}>
            ✨ 功能模块
          </Text>
          <View style={{ gap: 12 }}>
            {MODULES.map(mod => (
              <Pressable
                key={mod.id}
                onPress={() => router.push(mod.path as RelativePathString)}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: '#EFECE6',
                  padding: 16,
                  boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.04)' }],
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                  {/* 大图标 */}
                  <View style={{
                    width: 52, height: 52, borderRadius: 16,
                    backgroundColor: mod.iconBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 26 }}>{mod.emoji}</Text>
                  </View>
                  {/* 文字 */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#2B2826' }}>{mod.title}</Text>
                      <View style={{
                        backgroundColor: mod.iconBg, borderRadius: 99,
                        paddingHorizontal: 8, paddingVertical: 2,
                        borderWidth: 1, borderColor: mod.color + '25',
                      }}>
                        <Text style={{ fontSize: 10, color: mod.color, fontWeight: '700' }}>{mod.tag}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: mod.color, fontWeight: '600', marginBottom: 4 }}>
                      {mod.subtitle}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#7C7670', lineHeight: 18 }}>
                      {mod.desc}
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#A09B94" style={{ marginTop: 4 }} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 关联咨询师 */}
        <View style={{ marginHorizontal: 16, marginTop: 24 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#2B2826', marginBottom: 12 }}>
            💬 推荐咨询师
          </Text>
          <View style={{ gap: 10 }}>
            {EXPERTS.map(exp => (
              <Pressable
                key={exp.id}
                onPress={() => router.push(`/(app)/chat/${exp.id}` as RelativePathString)}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: '#EFECE6',
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.03)' }],
                }}
              >
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: exp.color + '12',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 22 }}>{exp.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#2B2826' }}>
                    {exp.name}咨询师
                  </Text>
                  <Text style={{ fontSize: 12, color: '#7C7670', marginTop: 2 }}>{exp.desc}</Text>
                </View>
                <View style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  backgroundColor: '#F3EFE9', borderRadius: 20,
                }}>
                  <Text style={{ fontSize: 12, color: '#4A4540', fontWeight: '700' }}>对话</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 底部温馨提示 */}
        <View style={{ marginHorizontal: 16, marginTop: 24, padding: 14, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#EFECE6' }}>
          <Text style={{ fontSize: 11, color: '#A09B94', lineHeight: 18, textAlign: 'center' }}>
            🔒 所有关系数据均仅存储在你的账号中，不会被分享或用于社交比较
          </Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}
