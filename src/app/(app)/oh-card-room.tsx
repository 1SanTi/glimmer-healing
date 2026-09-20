import React from 'react';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Layers, Move, Pin, Sparkles } from 'lucide-react-native';

// 特性数据（不含 JSX，图标在组件内渲染）
const FEATURES = [
  { iconName: 'Layers',   iconColor: '#C8A46A', title: '投射性卡牌',  desc: '178张OH卡（图像卡+文字卡），没有对错之分，跟随直觉选取' },
  { iconName: 'Move',     iconColor: '#7CAEC8', title: '自由布局桌面', desc: '将卡牌拖拽到桌面任意位置，翻转·叠放，构建你的牌阵' },
  { iconName: 'Pin',      iconColor: '#E8A365', title: '图钉锁定',    desc: '锁定摆好的卡牌，防止误触移位，专注创作你的布局' },
  { iconName: 'Sparkles', iconColor: '#C86B8A', title: 'AI 牌阵解读', desc: '布局完成后，AI以投射心理学角度温和解读你的牌阵意象' },
];

// 使用步骤
const STEPS = [
  { num: '01', title: '进入桌面',   desc: '选择心仪的投射桌面，进入安全的内心空间' },
  { num: '02', title: '打开卡牌库', desc: '浏览 178 张 OH 卡，跟随直觉选择吸引你的牌' },
  { num: '03', title: '布置牌阵',   desc: '将卡牌拖到桌面，翻开·旋转·叠放，自由创作' },
  { num: '04', title: 'AI 解读',    desc: '完成布局，AI 以温和心理学视角解读你的牌阵' },
];

function FeatureIcon({ name, color }: { name: string; color: string }) {
  const s = 20;
  if (name === 'Layers')   return <Layers   size={s} color={color} />;
  if (name === 'Move')     return <Move     size={s} color={color} />;
  if (name === 'Pin')      return <Pin      size={s} color={color} />;
  if (name === 'Sparkles') return <Sparkles size={s} color={color} />;
  return null;
}

export default function OhCardRoomScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F2EE' }}>
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.08)' }],
          }}
        >
          <ArrowLeft size={18} color="#4A4040" />
        </Pressable>
        <Text style={{ marginLeft: 12, fontSize: 17, fontWeight: '700', color: '#2A2020' }}>
          O卡疗愈室
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Hero */}
        <View style={{
          marginHorizontal: 16, borderRadius: 24, backgroundColor: '#EDE6D8',
          marginBottom: 16, padding: 28, alignItems: 'center',
        }}>
          {/* 叠放卡牌装饰 */}
          <View style={{ width: 160, height: 100, marginBottom: 20, position: 'relative' }}>
            {([
              { rot: '-14deg', left: 2,  bg: '#D4C4A8', z: 1 },
              { rot:  '10deg', left: 52, bg: '#C8B090', z: 2 },
              { rot:  '-2deg', left: 28, bg: '#F5ECD7', z: 3 },
            ] as { rot: string; left: number; bg: string; z: number }[]).map((c, i) => (
              <View key={i} style={{
                position: 'absolute', width: 68, height: 90,
                borderRadius: 9, backgroundColor: c.bg, left: c.left, top: 0, zIndex: c.z,
                transform: [{ rotate: c.rot }],
                boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(0,0,0,0.12)' }],
                alignItems: 'center', justifyContent: 'center',
              }}>
                {i === 2 && <Text style={{ fontSize: 28 }}>🃏</Text>}
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#2A1F0E', marginBottom: 6 }}>
            O卡投射疗愈
          </Text>
          <Text style={{ fontSize: 13, color: '#7A6A55', lineHeight: 20, textAlign: 'center' }}>
            178张图像与文字，无对错之分{'\n'}让卡牌映射你内心深处的风景
          </Text>
        </View>

        {/* 什么是OH卡 */}
        <View style={{
          marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20,
          padding: 18, marginBottom: 14,
          boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.06)' }],
        }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2A1F0E', marginBottom: 8 }}>
            什么是 OH 卡？
          </Text>
          <Text style={{ fontSize: 13, color: '#6A5A48', lineHeight: 22 }}>
            OH卡由德国艺术家 Ely Raman 创作，是一套经典的投射性卡牌工具。
            图像卡与文字卡各 88 张，使用时无需解读"正确答案"——你对卡牌的直觉感受，本身就是通往内心的线索。
          </Text>
        </View>

        {/* 功能特性 */}
        <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2A1F0E', marginBottom: 10 }}>本次体验包含</Text>
          <View style={{ gap: 10 }}>
            {FEATURES.map((f, i) => (
              <View key={i} style={{
                backgroundColor: '#fff', borderRadius: 16, padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }],
              }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: f.iconColor + '18',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <FeatureIcon name={f.iconName} color={f.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2A1F0E', marginBottom: 2 }}>{f.title}</Text>
                  <Text style={{ fontSize: 12, color: '#8A7A68', lineHeight: 18 }}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 使用步骤 */}
        <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2A1F0E', marginBottom: 12 }}>如何使用</Text>
          {STEPS.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
              <View style={{ alignItems: 'center', marginRight: 14 }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: '#C8A46A', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{s.num}</Text>
                </View>
                {i < STEPS.length - 1 && (
                  <View style={{ width: 1.5, height: 18, backgroundColor: '#D4C4A8', marginTop: 3 }} />
                )}
              </View>
              <View style={{ flex: 1, paddingTop: 5 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#2A1F0E', marginBottom: 2 }}>{s.title}</Text>
                <Text style={{ fontSize: 12, color: '#8A7A68', lineHeight: 18 }}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 温馨提示 */}
        <View style={{
          marginHorizontal: 16, borderRadius: 16, padding: 14,
          backgroundColor: '#FDF8F0', borderLeftWidth: 3, borderLeftColor: '#C8A46A',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#8A6A3A', marginBottom: 4 }}>💛 使用提示</Text>
          <Text style={{ fontSize: 12, color: '#9A8A72', lineHeight: 19 }}>
            OH卡无对错之分，跟随直觉即可。完成后可结合自身情绪进行反思，也可截图后与心理咨询师一起探讨你的内心图景。
          </Text>
        </View>
      </ScrollView>

      {/* 底部按钮 */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12,
        backgroundColor: 'rgba(245,242,238,0.97)',
        borderTopWidth: 1, borderTopColor: '#EDE6D8',
      }}>
        <Pressable
          style={{
            borderRadius: 20, paddingVertical: 15, alignItems: 'center',
            backgroundColor: '#C8A46A',
            boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(200,164,106,0.35)' }],
          }}
          onPress={() => router.push('/(app)/oh-card-game' as RelativePathString)}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 }}>
            进入 O 卡疗愈
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
