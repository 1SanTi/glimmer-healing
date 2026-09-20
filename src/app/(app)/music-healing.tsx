import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

// ── 开始按钮（用 useState 追踪 pressed，规避 NativeWind v4 函数式 style 限制）──
function StartButton({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        backgroundColor: pressed ? '#5B21B6' : '#7C3AED',
        borderRadius: 18,
        paddingVertical: 18,
        alignItems: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 }}>
        🎇  开始音乐疗愈
      </Text>
    </Pressable>
  );
}

// 功能特色列表
const FEATURES = [
  { icon: '🎵', title: '10万粒子系统', desc: '超高密度粒子群，随音乐实时律动' },
  { icon: '🔮', title: '10种数学形态', desc: '球体、心形、烟花、DNA等艺术模型' },
  { icon: '🌈', title: '低音色彩渐变', desc: '低频能量驱动粒子从深蓝向红紫渐变' },
  { icon: '💥', title: '高音冲击波', desc: 'Z轴爆炸效果，捕捉每一个瞬态峰值' },
  { icon: '🎛️', title: '实时调参面板', desc: '粒子大小、灵敏度、爆炸强度随心调' },
  { icon: '📸', title: '画面导出', desc: '一键保存当前粒子艺术画面' },
];

export default function MusicHealingIntroScreen() {
  const router = useRouter();

  // 呼吸动画（粒子图标缩放）
  const breathScale = useSharedValue(1);
  const breathOpacity = useSharedValue(0.6);

  useEffect(() => {
    breathScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    breathOpacity.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
    opacity: breathOpacity.value,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#050814' }}>
      <StatusBar style="light" />

      {/* 返回按钮 */}
      <Pressable
        onPress={() => router.back()}
        style={{ position: 'absolute', top: 56, left: 20, zIndex: 10, padding: 8 }}
      >
        <Text style={{ color: '#94A3B8', fontSize: 16 }}>‹ 返回</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 顶部英雄区 */}
        <View style={{ alignItems: 'center', paddingTop: 100, paddingBottom: 32, paddingHorizontal: 24 }}>
          {/* 粒子图标（呼吸动画）*/}
          <Reanimated.View style={[{
            width: 120, height: 120, borderRadius: 60,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)',
          }, iconStyle]}>
            <Text style={{ fontSize: 52 }}>🎇</Text>
          </Reanimated.View>

          {/* 光晕装饰 */}
          <View style={{
            position: 'absolute', top: 80, width: 160, height: 160,
            borderRadius: 80,
            backgroundColor: 'rgba(99, 102, 241, 0.06)',
          }} />

          <Text style={{ color: '#F8FAFC', fontSize: 28, fontWeight: '700', marginTop: 20, textAlign: 'center' }}>
            音乐粒子疗愈室
          </Text>
          <Text style={{ color: '#94A3B8', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
            上传一段音乐，10万粒子随你的旋律{'\n'}在三维空间中绽放、共鸣、疗愈
          </Text>

          {/* 标签 */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {['沉浸体验', '音频响应', '艺术创作'].map(tag => (
              <View key={tag} style={{
                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
                borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.25)',
              }}>
                <Text style={{ color: '#A78BFA', fontSize: 12 }}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 分割线 */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 24, marginBottom: 28 }} />

        {/* 功能特色网格 */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 16, letterSpacing: 1 }}>
            ✦  核心体验
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {FEATURES.map((f) => (
              <View
                key={f.title}
                style={{
                  width: '47%',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Text style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</Text>
                <Text style={{ color: '#F1F5F9', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>
                  {f.title}
                </Text>
                <Text style={{ color: '#64748B', fontSize: 11, lineHeight: 16 }}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 使用提示 */}
        <View style={{
          marginHorizontal: 20, marginTop: 28,
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.2)',
        }}>
          <Text style={{ color: '#818CF8', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>💡 使用说明</Text>
          <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 20 }}>
            进入房间后选择 MP3 或 WAV 格式音乐文件。{'\n'}
            双指捏合可缩放场景，拖动可旋转视角。{'\n'}
            点击右上角 GUI 面板可实时调节粒子参数。
          </Text>
        </View>
      </ScrollView>

      {/* 底部开始按钮（固定） */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16,
        backgroundColor: 'rgba(5,8,20,0.9)',
      }}>
        <StartButton onPress={() => router.push('/(app)/music-healing-room' as RelativePathString)} />
      </View>
    </View>
  );
}
