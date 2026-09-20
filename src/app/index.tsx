import { Redirect } from 'expo-router';
import { useSession } from '@/ctx';
import { ActivityIndicator, View, Text, Image } from 'react-native';
import { useEffect, useState } from 'react';

const SPLASH_DURATION = 2800; // ms — 让用户能完整看清启动画面

function SplashScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F3EE' }}>
      <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: '#E8A365', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        shadowColor: '#E8A365', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 10 }}>
        <Text style={{ fontSize: 44 }}>🌟</Text>
      </View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: '#1A1A2E', letterSpacing: 1.5 }}>微光心愈</Text>
      <Text style={{ fontSize: 13, color: '#9B8EC4', marginTop: 6, letterSpacing: 2 }}>Glimmer Healing</Text>
      <Text style={{ fontSize: 12, color: '#C4B5A5', marginTop: 32 }}>温柔陪伴 · 看见你的光</Text>
      <ActivityIndicator size="small" color="#E8A365" style={{ marginTop: 40 }} />
    </View>
  );
}

export default function Index() {
  const { session, isLoading } = useSession();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), SPLASH_DURATION);
    return () => clearTimeout(t);
  }, []);

  // 启动动画期间始终显示 SplashScreen
  if (!splashDone || isLoading) return <SplashScreen />;

  if (session) return <Redirect href="/(app)/(tabs)/home" />;
  return <Redirect href="/(auth)/sign-in" />;
}
