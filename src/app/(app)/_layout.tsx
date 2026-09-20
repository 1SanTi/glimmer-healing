import { Stack, Redirect } from 'expo-router';
import { useSession } from '@/ctx';
import { ActivityIndicator, View } from 'react-native';

export default function AppLayout() {
  const { session, isLoading } = useSession();

  // 加载中时显示空白，等待 session 确认
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F5F0' }}>
        <ActivityIndicator size="large" color="#E8A365" />
      </View>
    );
  }

  // 未登录则跳回登录页，兼容 Web URL 直接访问 (app) 下的路由
  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[expert]" />
      <Stack.Screen name="test/[type]" />
      <Stack.Screen name="htp" />
      <Stack.Screen name="article/[id]" />
      <Stack.Screen name="post/[id]" />
      <Stack.Screen name="breath" />
      <Stack.Screen name="about" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="agreement" />
      <Stack.Screen name="firstaid" />
      <Stack.Screen name="audio-library" />
      <Stack.Screen name="test-records" />
      <Stack.Screen name="attachment" />
      <Stack.Screen name="browser" />
      <Stack.Screen name="hope-tree" />
      <Stack.Screen name="lesson-center" />
      <Stack.Screen name="sandbox-intro" />
      <Stack.Screen name="sandbox" />
      <Stack.Screen name="music-healing" />
      <Stack.Screen name="music-healing-room" />
      <Stack.Screen name="oh-card-room" />
      <Stack.Screen name="oh-card-game" />
      <Stack.Screen name="sandbox-result" />
      <Stack.Screen name="sketch" />
      <Stack.Screen name="dream-analysis" />
      <Stack.Screen name="immersive-sleep" />
      <Stack.Screen name="ai-workbench" />
      <Stack.Screen name="ai-preview" />
      <Stack.Screen name="iceberg-analyzer" />
      <Stack.Screen name="nvc-translator" />
      <Stack.Screen name="love-lab" />
      <Stack.Screen name="love-network" />
      <Stack.Screen name="love-theory" />
      <Stack.Screen name="love-calendar" />
      <Stack.Screen name="love-map" />
      <Stack.Screen name="painting-house" />
      <Stack.Screen name="heron-memory" />
    </Stack>
  );
}
