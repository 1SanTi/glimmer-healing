import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

// expo-sqlite/localStorage/install 在 Vite sandbox（Web 预览）中崩溃：
//   该文件内部使用 process.env.EXPO_OS 判断平台，而 Vite 不替换该变量（值为 undefined），
//   导致误判为原生环境，尝试加载 wa-sqlite 原生模块，整个模块加载失败，App 显示 Unmatched Route。
// 修复：Web 上使用 window.localStorage，原生上使用 AsyncStorage（Supabase v2 支持异步 storage）

const supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

// Web：window.localStorage（浏览器原生）
// 原生（iOS/Android）：AsyncStorage（Supabase v2 支持异步 storage）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authStorage: any = Platform.OS === 'web'
  ? (typeof window !== 'undefined' ? window.localStorage : undefined)
  : AsyncStorage

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
