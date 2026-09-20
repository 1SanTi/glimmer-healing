import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, type RelativePathString } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSession } from '@/ctx';
import {
  FileText, Heart, TreePine, Smile, Search, Image as ImageIcon,
  Sparkles, BookOpen, ExternalLink, TrendingUp,
  Download, Share2, Globe, Database, FileSearch, FileOutput,
} from 'lucide-react-native';
import type { HeronCard } from '@/types/types';

interface Props {
  card: HeronCard;
}

const TYPE_META: Record<string, { icon: typeof FileText; emoji: string; tag: string }> = {
  web: { icon: Sparkles, emoji: '🌐', tag: 'AI 小应用' },
  image: { icon: ImageIcon, emoji: '🎨', tag: '心绘作品' },
  note: { icon: FileText, emoji: '📝', tag: '愈心手记' },
  checkin: { icon: Smile, emoji: '🌤️', tag: '情绪打卡' },
  tree: { icon: TreePine, emoji: '🌳', tag: '匿名树洞' },
  happiness: { icon: Heart, emoji: '💖', tag: '幸福度' },
  knowledge: { icon: BookOpen, emoji: '📚', tag: '知识检索' },
  file: { icon: Search, emoji: '📄', tag: '文件解读' },
  'skill-created': { icon: Sparkles, emoji: '✨', tag: '新技能' },
  'pdf-export': { icon: FileOutput, emoji: '📕', tag: 'PDF 导出' },
  ima: { icon: Database, emoji: '🗄️', tag: 'ima 知识库' },
  'doc-convert': { icon: FileText, emoji: '🔄', tag: '文档转换' },
  'pdf-parse': { icon: FileSearch, emoji: '🔍', tag: 'PDF 解析' },
  'web-reader': { icon: Globe, emoji: '🔗', tag: '网页解析' },
};

export function ResultCard({ card }: Props) {
  const router = useRouter();
  const { session } = useSession();
  const meta = TYPE_META[card.type] ?? TYPE_META.knowledge;
  const Icon = meta.icon;

  const openNote = () => {
    if (card.noteId) router.push((`/(app)/notes/note-editor?noteId=${card.noteId}`) as RelativePathString);
  };
  const openWeb = () => {
    const html = card.htmlContent;
    if (!html) return;
    if (process.env.EXPO_OS === 'web') {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } else {
      const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      WebBrowser.openBrowserAsync(dataUri);
    }
  };

  // 下载/分享 PDF（base64 写入本地临时文件）
  const downloadPdf = async () => {
    if (!card.pdfBase64) return;
    try {
      const fileUri = `${FileSystem.cacheDirectory}${Date.now()}_${card.title || 'export'}.pdf`;
      if (process.env.EXPO_OS === 'web') {
        const bin = atob(card.pdfBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = card.title || 'export.pdf'; a.click();
        URL.revokeObjectURL(url);
        return;
      }
      await FileSystem.writeAsStringAsync(fileUri, card.pdfBase64, { encoding: 'base64' });
      await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: card.title || 'PDF 文件' });
    } catch { /* ignore */ }
  };
  const sharePdf = async () => {
    if (!card.pdfBase64) return;
    try {
      if (process.env.EXPO_OS === 'web') { downloadPdf(); return; }
      const fileUri = `${FileSystem.cacheDirectory}${Date.now()}_${card.title || 'export'}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, card.pdfBase64, { encoding: 'base64' });
      await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: card.title || 'PDF 文件' });
    } catch { /* ignore */ }
  };
  const openLink = () => {
    if (card.link) WebBrowser.openBrowserAsync(card.link);
  };
  const saveAsNote = async () => {
    const { createNote } = await import('@/db/api');
    const content = card.meta?.full || card.summary || '';
    await createNote(session?.user?.id ?? '', card.title || '解析结果', [{ id: `b_${Date.now()}`, type: 'paragraph', content }], null);
  };

  const renderPrimaryBtn = (onPress: () => void, icon: typeof Download, label: string) => (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, backgroundColor: '#7A9D8C', borderRadius: 12, paddingVertical: 9,
      }}
    >
      {icon === Download ? <Download size={15} color="#fff" /> : icon === Share2 ? <Share2 size={15} color="#fff" /> : <ExternalLink size={15} color="#fff" />}
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View
      style={{
        marginTop: 8, borderRadius: 18, backgroundColor: '#F5F0E8',
        borderWidth: 1.5, borderColor: 'rgba(122,157,140,0.25)',
        padding: 14, borderCurve: 'continuous',
        shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }}
    >
      {/* 标签行 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{
          width: 30, height: 30, borderRadius: 15,
          backgroundColor: '#E88D6720', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color="#E88D67" />
        </View>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#E88D67', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {meta.tag}
        </Text>
        <Text style={{ fontSize: 14 }}>{meta.emoji}</Text>
      </View>

      {/* 分隔线 */}
      <View style={{ height: 1, backgroundColor: 'rgba(122,157,140,0.15)', marginBottom: 8 }} />

      {/* 标题 */}
      <Text className="text-base font-bold text-heron-ink" numberOfLines={2}>{card.title}</Text>

      {/* 图片 */}
      {card.type === 'image' && card.imageUrl ? (
        <Image
          source={{ uri: card.imageUrl }}
          style={{ width: '100%', height: 160, marginTop: 10, borderRadius: 12 }}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      {/* 幸福度趋势 */}
      {card.type === 'happiness' && card.trend && card.trend.length > 0 ? (
        <HappinessBars trend={card.trend} score={card.score ?? 0} />
      ) : null}

      {/* 摘要：knowledge 卡不限行数，让内容完整展示 */}
      {card.summary ? (
        <Text className="mt-2 text-sm leading-5 text-muted-foreground" numberOfLines={card.type === 'knowledge' ? undefined : 3}>{card.summary}</Text>
      ) : null}

      {/* 要点（knowledge 卡不用 points，避免与来源区重复） */}
      {card.points && card.points.length > 0 && card.type !== 'knowledge' ? (
        <View style={{ marginTop: 8, gap: 4 }}>
          {card.points.slice(0, 5).map((p, i) => (
            <View key={`${i}-${p.slice(0, 8)}`} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#7A9D8C', marginTop: 5 }} />
              <Text className="flex-1 text-xs leading-5 text-muted-foreground" numberOfLines={2}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 联网搜索来源链接（knowledge 卡片专用） */}
      {card.type === 'knowledge' && card.meta?.sources ? (() => {
        try {
          const srcs: Array<{ title?: string; url: string }> = JSON.parse(card.meta.sources);
          if (!srcs.length) return null;
          return (
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <View style={{ height: 1, flex: 1, backgroundColor: 'rgba(122,157,140,0.2)' }} />
                <Text style={{ fontSize: 10, color: '#7A9D8C', fontWeight: '700', letterSpacing: 0.5 }}>📎 参考来源</Text>
                <View style={{ height: 1, flex: 1, backgroundColor: 'rgba(122,157,140,0.2)' }} />
              </View>
              <View style={{ gap: 5 }}>
                {srcs.map((s, i) => (
                  <Pressable
                    key={`src-${i}`}
                    onPress={() => WebBrowser.openBrowserAsync(s.url)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}
                  >
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(122,157,140,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Text style={{ fontSize: 9, color: '#7A9D8C', fontWeight: '700' }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 11, color: '#7A9D8C', textDecorationLine: 'underline', lineHeight: 16 }} numberOfLines={2}>
                      {s.title || s.url}
                    </Text>
                    <ExternalLink size={11} color="#7A9D8C" />
                  </Pressable>
                ))}
              </View>
            </View>
          );
        } catch { return null; }
      })() : null}

      {/* 操作按钮 */}
      {card.type === 'web' && (card.htmlContent || card.imageUrl) ? (
        <Pressable
          onPress={openWeb}
          style={{
            marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 6, backgroundColor: '#7A9D8C', borderRadius: 12, paddingVertical: 9,
          }}
        >
          <ExternalLink size={15} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>预览网页</Text>
        </Pressable>
      ) : null}
      {card.type === 'note' && card.noteId ? (
        <Pressable
          onPress={openNote}
          style={{
            marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 6, backgroundColor: '#7A9D8C', borderRadius: 12, paddingVertical: 9,
          }}
        >
          <FileText size={15} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>打开手记</Text>
        </Pressable>
      ) : null}

      {/* PDF 导出：下载 + 分享 */}
      {card.type === 'pdf-export' && card.pdfBase64 ? (
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={downloadPdf} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7A9D8C', borderRadius: 12, paddingVertical: 9 }}>
            <Download size={15} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>下载</Text>
          </Pressable>
          <Pressable onPress={sharePdf} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E88D67', borderRadius: 12, paddingVertical: 9 }}>
            <Share2 size={15} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>分享</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ima / 文档转换：打开链接 */}
      {['ima', 'doc-convert'].includes(card.type) && card.link ? (
        <Pressable onPress={openLink} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7A9D8C', borderRadius: 12, paddingVertical: 9 }}>
          <ExternalLink size={15} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>{card.type === 'ima' ? '查看知识库' : '下载文件'}</Text>
        </Pressable>
      ) : null}

      {/* PDF 解析 / 网页解析：存为笔记 */}
      {['pdf-parse', 'web-reader'].includes(card.type) ? (
        <Pressable onPress={saveAsNote} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7A9D8C', borderRadius: 12, paddingVertical: 9 }}>
          <FileText size={15} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>存为笔记</Text>
        </Pressable>
      ) : null}
      {card.type === 'web-reader' && card.link ? (
        <Pressable onPress={openLink} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(122,157,140,0.12)', borderRadius: 12, paddingVertical: 9 }}>
          <Globe size={15} color="#7A9D8C" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#7A9D8C' }}>打开原文</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function HappinessBars({ trend, score }: { trend: number[]; score: number }) {
  const max = Math.max(100, ...trend);
  return (
    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 52 }}>
      {trend.map((v, i) => (
        <View key={i} style={{ flex: 1, justifyContent: 'flex-end', height: '100%' }}>
          <View
            style={{
              borderRadius: 4, height: `${Math.max(10, (v / max) * 100)}%`,
              backgroundColor: i === trend.length - 1 ? '#7A9D8C' : '#7A9D8C60',
            }}
          />
        </View>
      ))}
      <View style={{ marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <TrendingUp size={13} color="#7A9D8C" />
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#7A9D8C' }}>{score}</Text>
      </View>
    </View>
  );
}