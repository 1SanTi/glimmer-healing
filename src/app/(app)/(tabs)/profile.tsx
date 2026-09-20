import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line, Text as SvgText, ClipPath, Rect } from 'react-native-svg';
import { useSession } from '@/ctx';
import { getProfile, getTestResults, getHappinessLogs } from '@/db/api';
import type { Profile, TestResult, HappinessLog } from '@/types/types';
import { supabase } from '@/client/supabase';
import { Crown, Zap, Sparkles, Shield, Eye, EyeOff, Lock } from 'lucide-react-native';
import { useSubscription } from '@/hooks/useSubscription';
import UpgradeModal from '@/components/UpgradeModal';
import { AiQuotaCard } from '@/components/AiQuotaCard';
import { ADMIN_PHONE, ADMIN_PASSWORD, isAdminLoginEnabled } from '@/lib/adminConfig';

// ── 近14天能量趋势曲线（与academy风格一致）──────────────────────────
const CHART_W = 320;
const CHART_H = 130;
const PAD_L = 28;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 28;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function HappinessCurve({ logs }: { logs: HappinessLog[] }) {
  if (logs.length === 0) {
    return (
      <View className="bg-card rounded-2xl p-4"
        style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}>
        <Text className="text-foreground font-bold text-base mb-3">📈 近14天能量趋势</Text>
        <View style={{ height: CHART_H }} className="items-center justify-center">
          <Text className="text-3xl mb-2">📊</Text>
          <Text className="text-muted-foreground text-xs text-center">在学苑记录事件后{'\n'}生成你的专属趋势曲线</Text>
        </View>
      </View>
    );
  }

  // 按天聚合：累计分值（好事+3，难事-2）
  const today = new Date();
  const dayMap: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().split('T')[0]] = 0;
  }
  logs.forEach(l => {
    const key = l.log_date ?? l.created_at?.split('T')[0];
    if (key && key in dayMap) {
      dayMap[key] += l.event_type === 'positive' ? 3 : -2;
    }
  });

  const days = Object.keys(dayMap).sort();
  const scores = days.map(d => dayMap[d]);
  const n = days.length;

  const maxS = Math.max(0, ...scores);
  const minS = Math.min(0, ...scores);
  const yRange = Math.max(6, maxS - minS + 2);
  const yMid = (maxS + minS) / 2;

  const toX = (i: number) => PAD_L + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const toY = (s: number) => PAD_T + ((yMid + yRange / 2 - s) / yRange) * PLOT_H;
  const zeroY = toY(0);

  // Catmull-Rom → Cubic Bezier 平滑
  const tension = 0.35;
  let smoothPath = `M ${toX(0).toFixed(1)} ${toY(scores[0]).toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = toX(i), y0 = toY(scores[i]);
    const x1 = toX(i + 1), y1 = toY(scores[i + 1]);
    const xp = i > 0 ? toX(i - 1) : x0;
    const yp = i > 0 ? toY(scores[i - 1]) : y0;
    const xn = i + 2 < n ? toX(i + 2) : x1;
    const yn = i + 2 < n ? toY(scores[i + 2]) : y1;
    smoothPath += ` C ${(x0 + (x1 - xp) * tension).toFixed(1)} ${(y0 + (y1 - yp) * tension).toFixed(1)},`
      + ` ${(x1 - (xn - x0) * tension).toFixed(1)} ${(y1 - (yn - y0) * tension).toFixed(1)},`
      + ` ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const fillPath = `${smoothPath} L ${toX(n - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${toX(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  // 日期标签（首、中、末）
  const fmtDay = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const totalScore = scores.reduce((a, b) => a + b, 0);

  return (
    <View className="bg-card rounded-2xl p-4"
      style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-foreground font-bold text-base">📈 近14天能量趋势</Text>
        <Text style={{ fontSize: 11, color: totalScore >= 0 ? '#7A9D8C' : '#E88A7D', fontWeight: '700' }}>
          累计 {totalScore >= 0 ? '+' : ''}{totalScore}
        </Text>
      </View>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        <Defs>
          <LinearGradient id="pGradPos" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#7A9D8C" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#7A9D8C" stopOpacity="0.02" />
          </LinearGradient>
          <LinearGradient id="pGradNeg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E88A7D" stopOpacity="0.02" />
            <Stop offset="1" stopColor="#E88A7D" stopOpacity="0.28" />
          </LinearGradient>
          <ClipPath id="pClipAbove">
            <Rect x={0} y={0} width={CHART_W} height={zeroY} />
          </ClipPath>
          <ClipPath id="pClipBelow">
            <Rect x={0} y={zeroY} width={CHART_W} height={CHART_H - zeroY} />
          </ClipPath>
        </Defs>

        {/* 零线 */}
        <Line x1={PAD_L} y1={zeroY} x2={CHART_W - PAD_R} y2={zeroY}
          stroke="#D1D5DB" strokeWidth="1" strokeDasharray="5,4" />
        <SvgText x={PAD_L - 4} y={zeroY + 3} fontSize="7.5" fill="#C0C4CC" textAnchor="end">0</SvgText>
        {maxS > 0 && <SvgText x={PAD_L - 4} y={toY(maxS) + 3} fontSize="7.5" fill="#7A9D8C" textAnchor="end">+{maxS}</SvgText>}
        {minS < 0 && <SvgText x={PAD_L - 4} y={toY(minS) + 3} fontSize="7.5" fill="#E88A7D" textAnchor="end">{minS}</SvgText>}

        {/* X轴竖格线 */}
        {[0, Math.floor((n - 1) / 2), n - 1].map(i => (
          <Line key={i} x1={toX(i)} y1={PAD_T} x2={toX(i)} y2={CHART_H - PAD_B + 4}
            stroke="#F3F4F6" strokeWidth="0.8" />
        ))}

        {/* 正/负面积填充 */}
        <Path d={fillPath} fill="url(#pGradPos)" clipPath="url(#pClipAbove)" />
        <Path d={fillPath} fill="url(#pGradNeg)" clipPath="url(#pClipBelow)" />

        {/* 主曲线 */}
        <Path d={smoothPath} fill="none" stroke="#E8A365" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* 有记录的日期数据点 */}
        {scores.map((s, i) => {
          if (s === 0) return null;
          const dotColor = s > 0 ? '#7A9D8C' : '#E88A7D';
          return <Circle key={i} cx={toX(i)} cy={toY(s)} r="3.5"
            fill="white" stroke={dotColor} strokeWidth="2" />;
        })}

        {/* 日期标签（首/中/末）*/}
        {[0, Math.floor((n - 1) / 2), n - 1].map(i => (
          <SvgText key={i} x={toX(i)} y={CHART_H - 4}
            fontSize="8" fill="#94A3B8" textAnchor="middle">
            {i === n - 1 ? '今天' : fmtDay(days[i])}
          </SvgText>
        ))}
      </Svg>

      {/* 图例 */}
      <View className="flex-row justify-between mt-1 px-1">
        <View className="flex-row items-center gap-1">
          <View className="w-2 h-2 rounded-full" style={{ backgroundColor: '#7A9D8C' }} />
          <Text className="text-muted-foreground" style={{ fontSize: 10 }}>好事 +3</Text>
        </View>
        <Text className="text-muted-foreground" style={{ fontSize: 10 }}>🌊 日能量波动</Text>
        <View className="flex-row items-center gap-1">
          <View className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E88A7D' }} />
          <Text className="text-muted-foreground" style={{ fontSize: 10 }}>难事 -2</Text>
        </View>
      </View>
    </View>
  );
}

// ── 更新日志数据 ─────────────────────────────────────────────────
const CHANGELOG = [
  {
    version: 'v177',
    date: '2026-06-29',
    tag: '交互优化',
    tagColor: '#34D399',
    items: [
      'OH卡疗愈室·旋转手柄移位：旋转拖拽按钮从右下角移至右上角，避免与底部操作栏重叠',
      'OH卡疗愈室·层级调整：底部操作栏新增「上移一层」↑ 和「下移一层」↓ 按钮，可精确调整多张卡片的叠放顺序',
      'OH卡疗愈室·固定按钮重新布局：固定按钮移至卡片左上角，始终可见可点击，固定时高亮为琥珀色',
    ],
  },
  {
    version: 'v176',
    date: '2026-06-29',
    tag: '功能升级',
    tagColor: '#7BBFE8',
    items: [
      'OH卡疗愈室·翻牌3D动画：点击「翻开/背面」时卡片以 420ms 水平3D翻转动画切换正背面，视觉更真实',
      'OH卡疗愈室·旋转拖拽手柄：选中卡片后右下角显示紫色旋转按钮，用手指拖拽可精确控制卡片角度，Web/App 双端均可用',
      'OH卡疗愈室·PDF背景导入：从疗愈图集 PDF 提取11页图片，全部加入桌面主题库（疗愈图1-11），桌面主题总数扩充至22款',
    ],
  },
  {
    version: 'v175',
    date: '2026-06-29',
    tag: '功能升级',
    tagColor: '#5B8FD4',
    items: [
      'OH卡疗愈室·抽牌面板修复：文字卡/图像卡切换按钮现已正常生效，不再保持图像卡不切换',
      'OH卡疗愈室·两指旋转支持：Pan手势限定单指，双指专用于旋转，在原生 iOS/Android 设备上可用双指自由调整卡片角度',
      'OH卡疗愈室·入场动画：从抽牌面板或卡牌库放置卡片时，卡片以弹簧动画（scale 0.3→1 + opacity 0→1）飞入桌面',
      'OH卡疗愈室·全新桌面背景库：新增 4 张 AI 高级版生成背景（深海星空、神圣森林、宇宙曼陀罗、月光之湖）',
      'OH卡疗愈室·用户原图导入：从已上传文件中提取 4 张暗色疗愈背景（紫境冥想、暗夜静室、墨色禅意、夜语），共 11 款桌面主题',
    ],
  },
  {
    version: 'v174',
    date: '2026-06-29',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      'OH卡疗愈室·卡牌交互重构：单击选中卡片显示操作面板（翻面/固定/放大/删除），点击空白区域取消选中，彻底移除误操作频繁的点触翻转',
      'OH卡疗愈室·双击放大保留：双击仍可放大/还原卡片，放大后操作按钮同样遵循新选中逻辑',
      'OH卡疗愈室·初始卡片调大：卡片默认尺寸从 90×120 调整至 135×180（约1.5倍），摆放时视觉更清晰',
      'OH卡疗愈室·AI桌面背景：从 PDF 参考图提取风格，通过图生图生成 3 张「疗愈光晕/星光投射/金色圣所」专属桌面背景',
      'OH卡疗愈室·抽牌功能：底部新增「抽牌」按钮，展开横向卡牌滑动面板（洗牌后随机顺序），点击即放置到桌面，已抽卡片灰显，支持一键洗牌重排',
    ],
  },
  {
    version: 'v173',
    date: '2026-06-28',
    tag: '体验优化',
    tagColor: '#9B8EC4',
    items: [
      'OH卡疗愈室彻底修复：移除导致 Web 崩溃的 Sentry 模块，现已可正常进入',
      '粒子音乐：调参面板默认收起，不再遮挡上传按钮；通过 RN 侧曲库加载音乐后自动启动场景与音频分析',
      '沉浸式睡眠：时间选择器改为 +/- 步进按钮，跨 Web / App 双端均可正常调整时间',
      '梦境解析：AI 精神分析解读默认完整展开，无需手动点击"查看完整解析"',
      '测评档案：解读详情 ScrollView 修复 flex 布局，内容不再截断；图片档案支持直接预览原图并保存到相册',
      '更新日志同步更新至最新版本',
    ],
  },
  {
    version: 'v112',
    date: '2026-06-19',
    tag: '问题修复',
    tagColor: '#E8A365',
    items: [
      '修复文件夹重命名点击「保存」无响应的问题（API 错误不再被静默吞掉）',
      '修复颜色选择后保存仍恢复旧颜色的问题，现可正确持久化所选颜色',
      '修复新建文件夹失败后弹窗消失却未显示错误原因的问题',
      '两个文件夹弹窗新增 KeyboardAvoidingView，键盘弹起不再遮挡「保存 / 创建」按钮',
      '输入框边框在出错时变为红色，并显示具体错误提示文字',
      '颜色圆点尺寸由 30→32，选中状态边框更清晰',
    ],
  },
  {
    version: 'v110',
    date: '2026-06-19',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '工具栏新增光标感知：光标移动时实时检测所在位置的格式状态',
      '加粗、斜体、删除线、引用、各级标题按钮根据光标位置自动高亮激活',
      '格式按钮改为切换逻辑：已有格式时再次点击可一键移除对应 Markdown 标记',
      '修复点击工具栏按钮时光标丢失、格式无法正确应用的问题',
    ],
  },
  {
    version: 'v109',
    date: '2026-06-19',
    tag: '问题修复',
    tagColor: '#E8A365',
    items: [
      '修复格式按钮操作忽略光标位置的根本问题（过去所有格式均插入到文本末尾）',
      '新增 selectionRef，通过 onSelectionChange 实时记录光标/选区坐标',
      '重写 wrapSelection：有选区时包裹所选文字，无选区时在光标处插入标记对',
      '重写 insertAtCursor：在当前行行首插入格式前缀，二次点击可取消',
      '修复 Web 端点击工具栏后 TextInput 失焦导致光标坐标丢失的问题',
    ],
  },
  {
    version: 'v108',
    date: '2026-06-19',
    tag: '问题修复',
    tagColor: '#E8A365',
    items: [
      '修复双平台分支 ternary 的 Native 支路缺少 )} 闭合符导致 SyntaxError',
      '修复 Babel 解析器因未结束表达式抛出 "expected \',\'" 的启动崩溃',
    ],
  },
  {
    version: 'v107',
    date: '2026-06-19',
    tag: '问题修复',
    tagColor: '#E8A365',
    items: [
      '修复 Web 端长文本无法上下滑动的根本原因（textarea 拦截所有 wheel/touch 事件）',
      'Web 端改为 textarea 自身开启 scrollEnabled + overflowY: auto 进行内部滚动',
      '原生端（iOS/Android）保持 scrollEnabled=false + 父级 ScrollView 最佳实践',
      '双平台均可流畅浏览超长笔记内容',
    ],
  },
  {
    version: 'v106',
    date: '2026-06-19',
    tag: '体验优化',
    tagColor: '#9B8EC4',
    items: [
      '消除 Web 端 textarea 黑色方框边框（清除 outline/border/boxShadow/WebkitAppearance）',
      'TextInput 背景色设为透明，与页面底色完全融合',
      'minHeight 提升至屏幕高度 60%，内容少时编辑区仍铺满页面',
      '关闭 ScrollView 滚动条视觉干扰',
    ],
  },
  {
    version: 'v105',
    date: '2026-06-19',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '修复笔记编辑器长文本上下滑动失效（KeyboardAvoidingView + ScrollView 布局重构）',
      '工具栏主行新增左对齐、居中、右对齐三个按钮，实时改变全文对齐方式',
      '新增内联颜色选择器（8 种预设色圆点），字体颜色即点即用',
      '待办事项从纯文本 [ ] 标记升级为独立复选框卡片，点击方框切换完成状态并显示删除线',
    ],
  },
  {
    version: 'v111',
    date: '2026-06-19',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '笔记编辑器工具栏全面重构：双行布局，分组清晰，支持横向滑动',
      '新增撤销 / 重做（最多 100 步历史），操作失误可随时回滚',
      '新增下划线（<u>）、高亮（==）两种行内格式，可一键切换',
      '标题支持 H1–H4 + P 五级，行首前缀二次点击自动取消',
      '新增「清除格式」按钮，一键移除选区内所有 Markdown 标记',
      '新增代码块（```）、链接模板、Markdown 表格一键插入',
      '工具栏按钮激活时金色高亮，禁用时降低透明度，状态一目了然',
    ],
  },
  {
    version: 'v78',
    date: '2026-06-18',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '9 位咨询师配备专属 TTS 音色（独立语速 / 音调 / 音色），体验更沉浸',
      '咨询对话支持「语音模式」——按住说话，松手自动识别并发送',
      'AI 回复自动语音播报，含波形进度条，支持点击定位播放位置',
      '输入栏新增「语音播报」开关，可一键切换静默 / 朗读模式',
      '部署 tts-minimax 与 short-speech-recognition 后端服务',
    ],
  },
  {
    version: 'v77',
    date: '2026-06-18',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '沉浸式睡眠新增「开始睡眠」按钮与全屏锁定运行界面',
      '睡眠运行态显示动态计时（HH:MM:SS）、已入睡时长与计划起床时间',
      '长按 2 秒气泡按钮可安全结束睡眠，防止误触',
      '运行中持续推送锁屏通知（每分钟更新），系统任务栏常驻',
      '睡眠期间背景音乐持续播放，不受锁屏影响',
    ],
  },
  {
    version: 'v69',
    date: '2026-06-18',
    tag: '问题修复',
    tagColor: '#E8A365',
    items: [
      '修复底部 Tab 字体加载超时导致 App 崩溃的问题',
      '图标库从 @expo/vector-icons 迁移至 lucide-react-native',
      '树洞分类标签过大问题修复，恢复紧凑小标签样式',
      '沉浸式睡眠时间数字颜色由深灰改为白色，深色背景下清晰可见',
    ],
  },
  {
    version: 'v67',
    date: '2026-06-18',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '游戏舱新增「梦境解析」——基于弗洛伊德精神分析，支持手写 / Word 上传与 AI 一键解读',
      '游戏舱新增「沉浸式睡眠」——自定义入睡 / 起床时间、系统通知提醒与专属睡眠背景音',
      '音频库新增「沉浸式睡眠背景音」用途标签，与睡眠模块联动',
      '梦境记录支持时间轴归档与卡片式管理',
    ],
  },
  {
    version: 'v60',
    date: '2026-06-14',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '公开广场新增完整留言功能，支持展开 / 收起留言列表',
      '长按自己的留言可复制或删除，删除前有二次确认',
      '修复公开广场分类标签与帖子卡片布局重叠问题',
    ],
  },
  {
    version: 'v46',
    date: '2025-06-14',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '心灵档案新增「更新日志」板块',
      '修复应用启动时背景音乐自动播放的问题',
      '学苑心理科普内容大幅扩充，新增可折叠知识卡片',
      '备课中心支持文件在线预览（WPS/Google Docs）',
      '测评档案补全全部量表类型与房树人专家推荐',
      '危机词汇检测能力显著增强，新增伤害他人等关键词',
      '树洞「我的树洞」支持删除自己的帖子',
    ],
  },
  {
    version: 'v45',
    date: '2025-05-28',
    tag: '问题修复',
    tagColor: '#E8A365',
    items: [
      '修复幸福度曲线日期重置问题',
      '实现音频库背景音乐跨页面持续播放',
      '近期记录支持收纳/展开交互',
    ],
  },
  {
    version: 'v44',
    date: '2025-05-10',
    tag: '功能升级',
    tagColor: '#7A9D8C',
    items: [
      '新增教师备课中心与资源共享平台',
      '新增房树人（HTP）心理投射测验',
      '新增希望树共建互动游戏',
      '学苑板块新增萨提亚沟通姿态科普卡片',
    ],
  },
  {
    version: 'v43',
    date: '2025-04-18',
    tag: '体验优化',
    tagColor: '#9B8EC4',
    items: [
      '音频库支持本地导入背景音乐',
      '心情打卡新增情绪联动推荐功能',
      '幸福度日志新增幸福曲线可视化图表',
    ],
  },
  {
    version: 'v42',
    date: '2025-03-25',
    tag: '新功能',
    tagColor: '#5B9BD5',
    items: [
      '新增匿名树洞公开广场与我的树洞分栏',
      '新增五位流派AI心理专家对话（CBT/人本/存在/格式塔/萨提亚）',
      '测玩中心新增实验舱模块',
    ],
  },
  {
    version: 'v41',
    date: '2025-03-01',
    tag: '基础版本',
    tagColor: '#C4856A',
    items: [
      '微光心愈正式上线',
      '心情打卡、幸福度日志基础功能完成',
      'SCL-90、MBTI、VIA品格优势测评接入',
    ],
  },
];

// ── 更新日志组件 ─────────────────────────────────────────────────
function ChangelogSection() {
  const [expanded, setExpanded] = useState(false);
  const [openVersions, setOpenVersions] = useState<Set<string>>(new Set(['v46']));

  const toggleVersion = (v: string) => {
    setOpenVersions(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  const visibleLogs = expanded ? CHANGELOG : CHANGELOG.slice(0, 2);

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-foreground font-bold text-base">📋 更新日志</Text>
        <Pressable onPress={() => setExpanded(e => !e)}
          className="bg-muted rounded-full px-3 py-1">
          <Text className="text-muted-foreground text-xs font-medium">
            {expanded ? '收起' : '查看全部'}
          </Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {visibleLogs.map(log => {
          const isOpen = openVersions.has(log.version);
          return (
            <View key={log.version} className="bg-card rounded-2xl overflow-hidden"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}>
              <Pressable
                className="flex-row items-center px-4 py-3"
                onPress={() => toggleVersion(log.version)}
              >
                {/* 版本圆点 */}
                <View className="w-2 h-2 rounded-full mr-3 mt-0.5 flex-shrink-0"
                  style={{ backgroundColor: log.tagColor }} />
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-foreground font-bold text-sm">{log.version}</Text>
                    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: log.tagColor + '20' }}>
                      <Text className="text-xs font-medium" style={{ color: log.tagColor }}>{log.tag}</Text>
                    </View>
                  </View>
                  <Text className="text-muted-foreground text-xs mt-0.5">{log.date}</Text>
                </View>
                <Text className="text-muted-foreground text-base">{isOpen ? '∧' : '∨'}</Text>
              </Pressable>
              {isOpen && (
                <View className="px-4 pb-3 border-t border-border">
                  {log.items.map((item, i) => (
                    <View key={i} className="flex-row items-start gap-2 mt-2">
                      <View className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: log.tagColor }} />
                      <Text className="text-foreground text-xs leading-5 flex-1">{item}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [happinessLogs, setHappinessLogs] = useState<HappinessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPlanId, setUserPlanId] = useState<string>('free');
  const [isAdmin, setIsAdmin] = useState(false);

  // ── 测评档案 AI工作台 付费升级提示 ────────────────────────────
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const { level: subLevel } = useSubscription();

  // ── 管理员验证弹窗状态 ────────────────────────────────────────
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPhone, setAdminPhone]         = useState('');
  const [adminPass, setAdminPass]           = useState('');
  const [showPass, setShowPass]             = useState(false);
  const [adminErr, setAdminErr]             = useState('');

  const handleAdminLogin = async () => {
    if (isAdminLoginEnabled && adminPhone === ADMIN_PHONE && adminPass === ADMIN_PASSWORD) {
      // 验证通过后，将当前登录用户标记为管理员（写入 admin_users 表）
      // 这样即使 session.user.phone 与管理员手机号不一致，也能进入管理后台
      if (session?.user?.id) {
        try {
          const { error: adminInsertErr } = await supabase
            .from('admin_users')
            .upsert({ id: session.user.id }, { onConflict: 'id', ignoreDuplicates: true });
          if (adminInsertErr) {
            console.error('标记管理员失败:', adminInsertErr);
            // 继续跳转，但需要说明：如果插入失败，后台生成密钥仍会被 RLS 拒绝
          }
        } catch (err) {
          console.warn('标记管理员异常:', err);
        }
      }
      setShowAdminModal(false);
      setAdminPhone('');
      setAdminPass('');
      setAdminErr('');
      router.push('/(app)/admin-dashboard' as any);
    } else {
      setAdminErr('账号或密码错误，请重试');
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      (async () => {
        setLoading(true);
        const [p, tr, hl, subRes] = await Promise.all([
          getProfile(session.user.id),
          getTestResults(session.user.id),
          getHappinessLogs(session.user.id, 14),
          supabase.from('user_subscriptions')
            .select('plan_id, status, expires_at')
            .eq('user_id', session.user.id)
            .maybeSingle(),
        ]);
        setProfile(p);
        setTestResults(tr);
        setHappinessLogs(hl);
        const isSubActive = subRes.data?.status === 'active' && (!subRes.data?.expires_at || new Date(subRes.data.expires_at) > new Date());
        const planId = (isSubActive ? subRes.data?.plan_id : null) ?? 'free';
        setUserPlanId(planId);
        // 管理员判断：phone 字段
        setIsAdmin(isAdminLoginEnabled && session.user.phone === ADMIN_PHONE);
        setLoading(false);
      })();
    }, [session])
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const avgScore = happinessLogs.length > 0
    ? (happinessLogs.reduce((s, l) => s + l.score, 0) / happinessLogs.length).toFixed(1)
    : '--';

  const TEST_LABEL: Record<string, string> = {
    scl90: 'SCL-90', mht: 'MHT', mbti: 'MBTI', via: 'VIA品格优势',
    stress: '压力测试', confidence: '自信度测试', htp: '房树人', happiness_age: '心理年龄',
  };

  if (!session) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-5xl mb-4">🔆</Text>
        <Text className="text-foreground font-bold text-xl mb-2">登录解锁心灵档案</Text>
        <Text className="text-muted-foreground text-sm text-center mb-6">
          登录后可保存所有测试结果、对话历史和树洞内容
        </Text>
        <Pressable
          className="bg-primary rounded-2xl px-8 py-3.5 w-full items-center"
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text className="text-primary-foreground font-bold">登录 / 注册</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#E8A365" />
      </View>
    );
  }

  const username = session.user.email?.replace('@miaoda.com', '') ?? '用户';

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        {/* 用户信息头部 */}
        <View className="px-5 pt-14 pb-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-foreground">心灵档案 🗂️</Text>
            <Pressable
              className="bg-destructive/10 rounded-xl px-3 py-2"
              onPress={handleSignOut}
            >
              <Text className="text-destructive text-xs font-medium">退出登录</Text>
            </Pressable>
          </View>
          <View className="bg-card rounded-3xl p-5 mt-4 flex-row items-center"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.06)' }] }}>
            <View className="w-16 h-16 rounded-full bg-primary/20 items-center justify-center mr-4">
              <Text className="text-3xl">🌱</Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-lg">@{username}</Text>
              <Text className="text-muted-foreground text-sm mt-0.5">
                {profile?.created_at ? `加入于 ${new Date(profile.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}` : ''}
              </Text>
              <View className="flex-row gap-4 mt-2">
                <View className="items-center">
                  <Text className="text-primary font-bold text-base">{testResults.length}</Text>
                  <Text className="text-muted-foreground text-xs">次测评</Text>
                </View>
                <View className="w-px bg-border" />
                <View className="items-center">
                  <Text className="text-primary font-bold text-base">{happinessLogs.length}</Text>
                  <Text className="text-muted-foreground text-xs">条记录</Text>
                </View>
                <View className="w-px bg-border" />
                <View className="items-center">
                  <Text className="text-primary font-bold text-base">{avgScore}</Text>
                  <Text className="text-muted-foreground text-xs">幸福均值</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="px-5 gap-4 pb-24">
          {/* ── 会员套餐入口（位于用户信息卡片下方） ── */}
          {(() => {
            const PLAN_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
              free:  { label: '体验版（免费）', color: '#6B7280', icon: <Sparkles size={16} color="#6B7280" /> },
              basic: { label: '心愈版',         color: '#7C6FCD', icon: <Crown    size={16} color="#7C6FCD" /> },
              pro:   { label: 'AI工作台版',      color: '#E8A365', icon: <Zap      size={16} color="#E8A365" /> },
            };
            const meta = PLAN_META[userPlanId] ?? PLAN_META.free;
            return (
              <Pressable
                onPress={() => router.push('/(app)/subscription' as any)}
                className="bg-card rounded-2xl overflow-hidden flex-row items-center px-4 py-4"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.04)' }] as any }}>
                <View className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: meta.color + '18' }}>
                  {meta.icon}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-foreground">会员套餐</Text>
                    <View className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: meta.color + '18' }}>
                      <Text className="text-xs font-medium" style={{ color: meta.color }}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {userPlanId === 'free' ? '升级解锁全部心愈功能 · 输入兑换码激活' : '查看套餐权益 · 兑换更高级别'}
                  </Text>
                </View>
                <Text className="text-muted-foreground text-lg">›</Text>
              </Pressable>
            );
          })()}

          {/* ── 今日 AI 额度积分卡片（位于会员套餐正下方） ── */}
          <AiQuotaCard />

          {/* 幸福曲线 SVG折线图 */}
          <HappinessCurve logs={happinessLogs} />

          {/* 测评档案 */}
          <View>
            <View className="flex-row items-center gap-2 mb-3">
              <Text className="text-foreground font-bold text-base">🧪 测评档案</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF3E8', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: '#D4845A', fontWeight: '800' }}>⚡ AI工作台</Text>
              </View>
            </View>
            {testResults.length === 0 ? (
              <Pressable
                className="bg-card rounded-2xl p-6 items-center"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
                onPress={() => {
                  if (subLevel < 2) { setUpgradeVisible(true); return; }
                  router.push('/(app)/(tabs)/play');
                }}
              >
                <Text className="text-3xl mb-2">📊</Text>
                <Text className="text-muted-foreground text-sm text-center">还没有测评记录，去测玩中心探索吧</Text>
                <View className="bg-primary rounded-xl px-5 py-2.5 mt-3">
                  <Text className="text-primary-foreground text-sm font-semibold">前往测玩</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  if (subLevel < 2) { setUpgradeVisible(true); return; }
                  router.push('/(app)/test-records' as any);
                }}
                className="bg-card rounded-2xl overflow-hidden"
                style={{ opacity: subLevel < 2 ? 0.72 : 1, boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.05)' }] }}
              >
                {/* 统计概览行 */}
                <View className="flex-row items-center px-4 py-3.5 border-b border-border">
                  <View className="flex-1">
                    <Text className="text-foreground font-semibold text-sm">查看全部记录</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      共 {testResults.length} 条测评记录
                    </Text>
                  </View>
                  <Text className="text-muted-foreground text-xl">›</Text>
                </View>
                {/* 最近 3 条预览 */}
                {testResults.slice(0, 3).map((r, idx, arr) => {
                  const emoji = r.test_type === 'scl90' ? '📊'
                    : r.test_type === 'mbti' ? '🎭'
                    : r.test_type === 'via'  ? '⭐'
                    : r.test_type === 'htp'  ? '🏠'
                    : r.test_type === 'confidence' ? '💪'
                    : '🧪';
                  return (
                    <View
                      key={r.id}
                      className={`flex-row items-center px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center mr-3">
                        <Text className="text-sm">{emoji}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground text-sm font-medium">
                          {TEST_LABEL[r.test_type] ?? r.test_type}
                        </Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          {new Date(r.created_at).toLocaleDateString('zh-CN')}
                        </Text>
                      </View>
                      {r.summary && (
                        <Text className="text-muted-foreground text-xs max-w-24" numberOfLines={1}>
                          {r.summary}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </Pressable>
            )}
            {/* 测试记录详情页：若点击卡片被锁定，提供统一升级弹窗 */}
            <UpgradeModal
              visible={upgradeVisible}
              onClose={() => setUpgradeVisible(false)}
              requiredLevel={2}
              featureName="测评档案"
              featureDesc="查看完整测评记录、历史趋势分析与AI综合解读，需要 AI工作台版 解锁"
            />
          </View>

          {/* 更新日志 */}
          <ChangelogSection />

          {/* 设置入口 */}
          <View className="bg-card rounded-2xl overflow-hidden"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.04)' }] }}>
            {[
              { label: '关于微光心愈', emoji: '🔆', route: '/(app)/about' },
              { label: '心理急救手册', emoji: '📘', route: '/(app)/firstaid' },
              { label: '隐私政策', emoji: '🔒', route: '/(app)/privacy' },
              { label: '用户协议', emoji: '📄', route: '/(app)/agreement' },
            ].map((item, idx, arr) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.route as any)}
                className={`flex-row items-center px-4 py-4 ${idx < arr.length - 1 ? 'border-b border-border' : 'border-b border-border'}`}
              >
                <Text className="mr-3 text-lg">{item.emoji}</Text>
                <Text className="flex-1 text-foreground text-sm">{item.label}</Text>
                <Text className="text-muted-foreground text-lg">›</Text>
              </Pressable>
            ))}
            {/* 管理员后台入口 — 用户协议下方，点击弹出验证 */}
            <Pressable
              onPress={() => { setAdminErr(''); setAdminPhone(''); setAdminPass(''); setShowAdminModal(true); }}
              className="flex-row items-center px-4 py-4"
              style={{ backgroundColor: 'rgba(124,111,205,0.06)' }}
            >
              <View className="w-6 h-6 rounded-lg items-center justify-center mr-3"
                style={{ backgroundColor: 'rgba(124,111,205,0.18)' }}>
                <Shield size={14} color="#7C6FCD" />
              </View>
              <Text className="flex-1 text-sm font-semibold" style={{ color: '#7C6FCD' }}>
                管理员后台
              </Text>
              <View className="rounded-full px-2 py-0.5 mr-2"
                style={{ backgroundColor: 'rgba(232,163,101,0.18)' }}>
                <Text style={{ fontSize: 9, color: '#E8A365', fontWeight: '700' }}>ADMIN</Text>
              </View>
              <Text style={{ color: '#7C6FCD', fontSize: 18 }}>›</Text>
            </Pressable>
          </View>

          {/* 音频库入口 */}
          <Pressable
            onPress={() => router.push('/(app)/audio-library')}
            className="bg-card rounded-2xl overflow-hidden flex-row items-center px-4 py-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.04)' }] }}
          >
            <View
              className="w-9 h-9 rounded-xl items-center justify-center mr-3"
              style={{ backgroundColor: 'rgba(232,163,101,0.12)' }}
            >
              <Text className="text-lg">🎵</Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">音频库</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                为冥想、测评、呼吸训练添加本地背景音乐
              </Text>
            </View>
            <Text className="text-muted-foreground text-lg">›</Text>
          </Pressable>

          {/* 心理资源浏览器 */}
          <Pressable
            onPress={() => router.push('/(app)/browser' as any)}
            className="bg-card rounded-2xl overflow-hidden flex-row items-center px-4 py-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.04)' }] }}
          >
            <View
              className="w-9 h-9 rounded-xl items-center justify-center mr-3"
              style={{ backgroundColor: 'rgba(155,142,196,0.12)' }}
            >
              <Text className="text-lg">🌐</Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">心理资源浏览器</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                访问心理健康网站、科普资源与求助热线
              </Text>
            </View>
            <Text className="text-muted-foreground text-lg">›</Text>
          </Pressable>

          <Text className="text-muted-foreground text-xs text-center">
            微光心愈 · v177{'\n'}所有心理功能仅供辅助参考，不替代专业医疗诊断
          </Text>
        </View>
      </ScrollView>

      {/* ── 管理员身份验证弹窗 ── */}
      <Modal visible={showAdminModal} transparent animationType="fade">
        <KeyboardAvoidingView
          className="flex-1 justify-center items-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable onPress={() => setShowAdminModal(false)} className="absolute inset-0" />
          <View className="bg-card w-full rounded-3xl px-6 py-6"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,0,0,0.18)' }] as any }}>

            {/* 头部 */}
            <View className="items-center mb-5">
              <View className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: 'rgba(124,111,205,0.12)' }}>
                <Lock size={28} color="#7C6FCD" />
              </View>
              <Text className="text-foreground font-bold text-base">管理员验证</Text>
              <Text className="text-muted-foreground text-xs mt-1">请输入管理员账号和密码</Text>
            </View>

            {/* 账号输入 */}
            <Text className="text-foreground text-xs font-semibold mb-1.5">手机号</Text>
            <TextInput
              value={adminPhone}
              onChangeText={v => { setAdminPhone(v); setAdminErr(''); }}
              placeholder="请输入管理员手机号"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              returnKeyType="next"
              className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm mb-4"
            />

            {/* 密码输入 */}
            <Text className="text-foreground text-xs font-semibold mb-1.5">密码</Text>
            <View className="bg-muted rounded-xl flex-row items-center px-4 mb-4">
              <TextInput
                value={adminPass}
                onChangeText={v => { setAdminPass(v); setAdminErr(''); }}
                placeholder="请输入管理员密码"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={handleAdminLogin}
                className="flex-1 py-3 text-foreground text-sm"
              />
              <Pressable onPress={() => setShowPass(p => !p)} className="pl-2 py-3">
                {showPass
                  ? <EyeOff size={16} color="#9CA3AF" />
                  : <Eye    size={16} color="#9CA3AF" />}
              </Pressable>
            </View>

            {/* 错误提示 */}
            {adminErr !== '' && (
              <Text className="text-xs mb-3 text-center" style={{ color: '#EF4444' }}>{adminErr}</Text>
            )}

            {/* 按钮组 */}
            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowAdminModal(false)}
                className="flex-1 py-3 rounded-xl items-center bg-muted">
                <Text className="text-foreground font-medium text-sm">取消</Text>
              </Pressable>
              <Pressable onPress={handleAdminLogin}
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: '#7C6FCD' }}>
                <Text className="text-white font-bold text-sm">进入后台</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
