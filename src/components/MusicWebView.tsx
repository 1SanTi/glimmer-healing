/**
 * MusicWebView.tsx
 * Web 平台 — 使用 blob: URL iframe 加载 Three.js HTML 场景
 *
 * 关键修复：srcDoc 的 iframe origin 是 null，导致 CDN ESM importmap 被 CORS 拦截。
 * 改用 URL.createObjectURL(Blob) 生成 blob: URL，iframe 有正常 origin，
 * CDN 脚本可以正常跨域加载。
 */
import { forwardRef, useRef, useImperativeHandle, useEffect, useState } from 'react';

export type MusicWebViewRef = {
  postMessage: (json: string) => void;
};

type Props = {
  html: string;
  onMessage?: (event: MessageEvent) => void;
};

const MusicWebView = forwardRef<MusicWebViewRef, Props>(
  ({ html, onMessage }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [blobUrl, setBlobUrl] = useState<string>('');

    // 把 HTML 字符串转为 blob: URL，赋予 iframe 正常 origin
    useEffect(() => {
      const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }, [html]);

    useImperativeHandle(ref, () => ({
      postMessage: (json: string) => {
        iframeRef.current?.contentWindow?.postMessage(json, '*');
      },
    }));

    // 监听 iframe → 父页面消息
    useEffect(() => {
      if (!onMessage) return;
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [onMessage]);

    if (!blobUrl) return null;

    return (
      // 绝对定位铺满：避免 iframe flex:1/height:100% 在 Web 中需要父链高度的问题
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        <iframe
          ref={iframeRef}
          src={blobUrl}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          // Web Audio API + CDN ESM importmap
          allow="autoplay; microphone"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
        />
      </div>
    );
  },
);

MusicWebView.displayName = 'MusicWebView';
export default MusicWebView;
