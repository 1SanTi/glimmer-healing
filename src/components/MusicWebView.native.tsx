/**
 * MusicWebView.native.tsx
 * 原生平台（iOS/Android）— 使用 react-native-webview
 * 通过 useImperativeHandle 暴露统一的 postMessage 接口
 */
import { forwardRef, useRef, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export type MusicWebViewRef = {
  postMessage: (json: string) => void;
};

type Props = {
  html: string;
  onMessage?: (event: any) => void;
};

const MusicWebView = forwardRef<MusicWebViewRef, Props>(
  ({ html, onMessage }, ref) => {
    const webViewRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      postMessage: (json: string) => {
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(json)}})); true;`,
        );
      },
    }));

    return (
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        originWhitelist={['*']}
        onMessage={onMessage}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mixedContentMode="always"
      />
    );
  },
);

MusicWebView.displayName = 'MusicWebView';
export default MusicWebView;
