/**
 * 沙盘游戏室 — 介绍页
 */
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Layers, Move3d, Archive, Camera, Brain } from 'lucide-react-native';

const FEATURES = [
  {
    icon: <Layers size={22} color="#C8A46A" />,
    title: '3D 沉浸沙盘',
    desc: '逼真木质边框沙盘，颗粒感沙粒质感，支持双指缩放与自由旋转视角',
  },
  {
    icon: <Move3d size={22} color="#7A9D8C" />,
    title: '自由摆放物件',
    desc: '从物件库中选取房子、树木、人物等模型，触摸拖拽在沙盘内自由布置',
  },
  {
    icon: <Archive size={22} color="#9B8EC4" />,
    title: '物件收纳管理',
    desc: '一键收纳物件，清空沙盘后在侧边卡片中随时取回，灵活调整布局',
  },
  {
    icon: <Camera size={22} color="#5B9BD5" />,
    title: '保存沙盘画面',
    desc: '随时截取当前视角，保存图片至相册，留存你的心灵创作',
  },
  {
    icon: <Brain size={22} color="#E88FAA" />,
    title: 'AI 心理解读',
    desc: '完成沙盘后，AI 自动分析布局意象，生成专业的沙盘疗愈心理解读报告',
  },
];

export default function SandboxIntroScreen() {
  const router = useRouter();
  const { returnExpertId } = useLocalSearchParams<{ returnExpertId?: string }>();

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View className="flex-row items-center px-4 pt-14 pb-3">
        <Pressable onPress={() => router.back()} className="p-2 mr-2">
          <ArrowLeft size={22} color="#2C2C2C" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground">沙盘游戏室</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* 封面 Hero */}
        <View
          className="mx-5 rounded-3xl overflow-hidden items-center justify-center py-14 mb-6"
          style={{ backgroundColor: '#F5ECD7' }}
        >
          <Text style={{ fontSize: 72 }}>🏖</Text>
          <Text className="text-foreground font-bold text-xl mt-3">3D 心灵沙盘</Text>
          <Text className="text-muted-foreground text-sm mt-1 px-8 text-center leading-5">
            在沙粒与模型之间，触摸你内心深处的风景
          </Text>
        </View>

        {/* 关于沙盘疗愈 */}
        <View className="mx-5 bg-card rounded-2xl p-5 mb-4"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
          <Text className="text-foreground font-bold text-base mb-2">什么是沙盘疗愈？</Text>
          <Text className="text-muted-foreground text-sm leading-6">
            沙盘游戏（Sandplay Therapy）由卡尔夫创立，是心理分析领域的重要工具。
            来访者在沙盘中摆放微型模型，无需言语便能将潜意识内容具象化，
            帮助心理咨询师和来访者共同探索内心世界、促进心理整合与疗愈。
          </Text>
        </View>

        {/* 功能特性列表 */}
        <View className="mx-5 mb-4">
          <Text className="text-foreground font-bold text-base mb-3">本次体验包含</Text>
          <View className="gap-3">
            {FEATURES.map((f, i) => (
              <View key={i} className="bg-card rounded-2xl p-4 flex-row items-start gap-4"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}>
                <View className="w-10 h-10 rounded-xl items-center justify-center"
                  style={{ backgroundColor: '#F5ECD7' }}>
                  {f.icon}
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-semibold text-sm mb-0.5">{f.title}</Text>
                  <Text className="text-muted-foreground text-xs leading-5">{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 温馨提示 */}
        <View className="mx-5 rounded-2xl p-4"
          style={{ backgroundColor: '#EEF6FF' }}>
          <Text className="text-sm font-semibold mb-1" style={{ color: '#3A6CB8' }}>💡 使用提示</Text>
          <Text className="text-xs leading-5" style={{ color: '#4A7AC8' }}>
            沙盘摆放无对错之分，跟随直觉即可。摆放完成后可对照自己的情感状态
            进行反思，也可截图保存后与心理咨询师讨论。
          </Text>
        </View>
      </ScrollView>

      {/* 底部按钮 */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pb-10 pt-4"
        style={{ backgroundColor: 'rgba(255,255,255,0.95)' }}>
        <Pressable
          className="rounded-2xl py-4 items-center"
          style={{ backgroundColor: '#C8A46A' }}
          onPress={() => router.push(`/(app)/sandbox${returnExpertId ? `?returnExpertId=${returnExpertId}` : ''}` as RelativePathString)}
        >
          <Text className="text-white font-bold text-base">开始进行沙盘疗愈</Text>
        </Pressable>
      </View>
    </View>
  );
}
