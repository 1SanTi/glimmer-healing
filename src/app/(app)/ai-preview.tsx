/**
 * ai-preview.tsx — HTML 应用全屏预览页
 *
 * 通过 ai-workbench.tsx 中导出的 previewHtmlStore 模块变量获取 HTML，
 * 避免路由参数 URL 长度限制问题。
 * 支持 iOS/Android（WebView）和 Web（iframe）。
 */

import { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ArrowLeft, RefreshCw, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { previewHtmlStore } from './ai-workbench';

export default function AiPreview() {
  const router = useRouter();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0); // 用于强制刷新 WebView
  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    // 从模块变量中读取 HTML
    setHtml(previewHtmlStore);
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(html);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const handleRefresh = () => {
    setLoading(true);
    setKey(k => k + 1);
  };

  // ── Web 平台（iframe）────────────────────────────────────────────
  if (process.env.EXPO_OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F0F1A' }}>
        <StatusBar style="light" />
        <SafeAreaView edges={['top']} style={{ backgroundColor: '#0F0F1A' }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: 'rgba(155,142,196,0.2)',
            gap: 12,
          }}>
            <Pressable
              onPress={() => router.back()}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(155,142,196,0.15)', alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowLeft size={18} color="#9B8EC4" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#E0D9FF', fontWeight: '700', fontSize: 15 }}>预览运行</Text>
              <Text style={{ color: '#4B5563', fontSize: 11 }}>HTML 应用沙箱运行中</Text>
            </View>
            {/* 复制按钮 */}
            <Pressable
              onPress={handleCopy}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Copy size={16} color="#9B8EC4" />
            </Pressable>
            {/* 在线指示 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(29,185,84,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#1DB954' }} />
              <Text style={{ color: '#1DB954', fontSize: 11, fontWeight: '600' }}>运行中</Text>
            </View>
          </View>
        </SafeAreaView>

        {/* Web iframe */}
        {html ? (
          // @ts-ignore — iframe only on web
          <iframe
            key={key}
            srcDoc={html}
            style={{ flex: 1, border: 'none', width: '100%', height: '100%', backgroundColor: '#ffffff' }}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={{ color: '#9B8EC4', fontSize: 15, fontWeight: '600' }}>暂无预览内容</Text>
            <Text style={{ color: '#4B5563', fontSize: 13 }}>请先在工作台生成HTML代码</Text>
            <Pressable
              onPress={() => router.back()}
              style={{ marginTop: 8, backgroundColor: '#9B8EC4', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>返回工作台</Text>
            </Pressable>
          </View>
        )}

        {copyToast && (
          <View style={{ position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(29,185,84,0.9)', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>✓ 代码已复制</Text>
          </View>
        )}
      </View>
    );
  }

  // ── iOS / Android（WebView）─────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#0F0F1A' }}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#0F0F1A' }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: 'rgba(155,142,196,0.2)',
          gap: 12,
        }}>
          {/* 返回按钮 */}
          <Pressable
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(155,142,196,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={18} color="#9B8EC4" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: '#E0D9FF', fontWeight: '700', fontSize: 15 }}>预览运行</Text>
            <Text style={{ color: '#4B5563', fontSize: 11 }}>HTML 应用沙箱运行中</Text>
          </View>

          {/* loading 指示 */}
          {loading && <ActivityIndicator size="small" color="#9B8EC4" />}

          {/* 刷新按钮 */}
          <Pressable
            onPress={handleRefresh}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center' }}
          >
            <RefreshCw size={15} color="#9B8EC4" />
          </Pressable>

          {/* 复制按钮 */}
          <Pressable
            onPress={handleCopy}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(155,142,196,0.12)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Copy size={15} color="#9B8EC4" />
          </Pressable>

          {/* 运行状态 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(29,185,84,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#1DB954' }} />
            <Text style={{ color: '#1DB954', fontSize: 11, fontWeight: '600' }}>运行中</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* 无内容状态 */}
      {!html ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ fontSize: 40 }}>📭</Text>
          <Text style={{ color: '#9B8EC4', fontSize: 15, fontWeight: '600' }}>暂无预览内容</Text>
          <Text style={{ color: '#4B5563', fontSize: 13 }}>请先在工作台生成HTML代码</Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 8, backgroundColor: '#9B8EC4', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>返回工作台</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <WebView
            key={key}
            source={{ html, baseUrl: '' }}
            style={{ flex: 1 }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => setLoading(false)}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
          />
          {/* 加载遮罩 */}
          {loading && (
            <View style={{
              position: 'absolute', top: 70, left: 0, right: 0, bottom: 0,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(15,15,26,0.88)',
            }}>
              <ActivityIndicator size="large" color="#9B8EC4" />
              <Text style={{ color: '#9B8EC4', marginTop: 14, fontSize: 14 }}>应用启动中…</Text>
            </View>
          )}
        </>
      )}

      {/* 安全区底部 */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#0F0F1A' }} />

      {/* 复制 Toast */}
      {copyToast && (
        <View style={{
          position: 'absolute', bottom: 60, alignSelf: 'center',
          backgroundColor: 'rgba(29,185,84,0.9)', borderRadius: 20,
          paddingHorizontal: 20, paddingVertical: 8,
        }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>✓ 代码已复制到剪贴板</Text>
        </View>
      )}
    </View>
  );
}
