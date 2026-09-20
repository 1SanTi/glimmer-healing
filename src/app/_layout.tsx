import React from 'react';
import { Stack } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';

import { SessionProvider, useSession } from '@/ctx';
import { CrisisProvider } from '@/components/CrisisProvider';
import { BgMusicProvider } from '@/lib/bgMusicContext';
import { HeronProvider } from '@/components/heron/HeronProvider';
import "../global.css";

// ⚠️ 重要：@sentry/react-native 不能静态 import 到此文件。
//
// 根本原因：@sentry/react-native 的模块依赖链（rnlibraries.js）在顶层包含：
//   require('react-native/Libraries/Promise')
//   require('react-native/Libraries/Core/Devtools/parseErrorStack')
// 这些 CommonJS require() 在模块加载阶段（import 时）同步执行，
// 在 Vite/Web sandbox 中无法解析，导致 _layout.tsx 模块加载失败，
// expo-router 找不到根布局组件，所有路径显示 "Unmatched Route"。
//
// try-catch 包裹 Sentry.init() 无法防止这个问题，因为崩溃发生在 import 阶段，
// 早于任何 JS 代码执行。
//
// 如需在原生 App 上启用 Sentry，应在原生专属文件（_layout.native.tsx）中处理，
// 不在共享的 _layout.tsx 中静态 import @sentry/react-native。

function RootLayoutNav() {
  const { isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F5F0' }}>
        <ActivityIndicator size="large" color="#E8A365" />
      </View>
    );
  }

  // 所有路由全部注册，由 index.tsx 和 (app)/_layout.tsx 各自负责守卫逻辑
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <BgMusicProvider>
          <CrisisProvider>
            <HeronProvider>
              <RootLayoutNav />
              <PortalHost />
            </HeronProvider>
          </CrisisProvider>
        </BgMusicProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
