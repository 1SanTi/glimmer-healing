import { supabase } from '@/client/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import {
  createNote, checkInMood, createPost,
  addHappinessLog, getHappinessLogs,
} from '@/db/api';
import type { Skill, SkillContext, SkillResult } from './types';
import type { NoteBlock, MoodType } from '@/types/types';

function uid(prefix = 'b'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 读取附件为 base64（跨平台：原生用 expo-file-system，Web 用 FileReader） */
async function readAttachmentBase64(uri: string): Promise<string> {
  if (!uri) return '';
  if (process.env.EXPO_OS === 'web') {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]+;base64,/, ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
}

function textToBlocks(text: string): NoteBlock[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out: NoteBlock[] = lines.map(l => ({ id: uid(), type: 'paragraph' as const, content: l }));
  return out.length ? out : [{ id: uid(), type: 'paragraph', content: text }];
}

const MOOD_MAP: Record<string, MoodType> = {
  开心: 'happy', 快乐: 'happy', 兴奋: 'excited', 感恩: 'grateful',
  平静: 'calm', 平和: 'peaceful', 希望: 'hopeful',
  低落: 'sad', 难过: 'sad', 疲惫: 'tired', 孤独: 'lonely',
  焦虑: 'anxious', 迷茫: 'confused', 愤怒: 'angry', 抑郁: 'depressed',
};

const noteWriter: Skill = {
  name: 'note-writer',
  displayName: '愈心手记',
  description: '创建或追加一条治愈手记，永久保存到你的笔记本。',
  fullInstructions: '当用户想记录、写下、保存某段文字、心情或事件时使用。从用户消息中提取标题(title)与正文(content)。',
  triggerKeywords: ['笔记', '记录', '写下来', '保存', '手记', '备忘', '记一下', '日记'],
  permission: 'craft',
  returns: 'note',
  tier: 'balanced',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const title = String(ctx.params.title || '').trim() || '愈心手记';
    let content = String(ctx.params.content || '').trim();

    // 若 content 是一句请求/指令而非实际正文，先用 LLM 生成完整手记内容再保存
    const looksLikeRequest = content.length < 40 || /^(帮我|请你|请帮|给我|生成|写|记录一下|记一下)/.test(content);
    if (looksLikeRequest) {
      try {
        content = await ctx.llm([{
          role: 'system',
          content: '你是苍鹭医生，治愈系手记写手。请根据用户的请求，写一篇温暖、治愈的手记正文（纯文字，不加标题，200-350字）。',
        }, {
          role: 'user',
          content: content || ctx.params.query as string || '帮我写一篇今日心情手记',
        }]);
      } catch { /* 保持原始 content，继续保存 */ }
    }

    // 直接保存，无需用户手动点击"保存"
    const note = await createNote(ctx.userId, title, textToBlocks(content), null);
    return {
      summary: `已经帮你把「${title}」写好并存进愈心手记啦，随时可以回看～`,
      card: { type: 'note', title, summary: content.slice(0, 80), noteId: note?.id },
    };
  },
};

const moodCheckin: Skill = {
  name: 'mood-checkin',
  displayName: '情绪打卡',
  description: '记录此刻的心情与分数，沉淀每日情绪轨迹。',
  fullInstructions: '当用户表达当前心情、情绪状态或想打卡时使用。提取心情标签(mood_label)、分数(mood_score 1-10)、备注(note)。',
  triggerKeywords: ['心情', '情绪', '打卡', '今天', '感觉', '开心', '难过', '焦虑', '平静'],
  permission: 'craft',
  returns: 'checkin',
  tier: 'lightweight',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const label = String(ctx.params.mood_label || '平静');
    const score = Number(ctx.params.mood_score ?? 5);
    const note = ctx.params.note ? String(ctx.params.note) : undefined;
    const mood = MOOD_MAP[label] || 'calm';
    await checkInMood(ctx.userId, mood, note);
    return {
      summary: `今天的心情「${label}」已经记上啦，${score}分，苍鹭陪你～`,
      card: { type: 'checkin', title: label, summary: note || '已记录今日心情', score, meta: { mood } },
    };
  },
};

const anonymousTree: Skill = {
  name: 'anonymous-tree',
  displayName: '匿名树洞',
  description: '把心事悄悄投进树洞，全程匿名、无人知晓。',
  fullInstructions: '当用户想倾诉、吐槽、发泄、匿名表达时使用。提取要倾诉的内容(content)。',
  triggerKeywords: ['树洞', '匿名', '倾诉', '吐槽', '发泄', '说说', '心事', '憋屈'],
  permission: 'craft',
  returns: 'tree',
  tier: 'lightweight',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const content = String(ctx.params.content || '');
    await createPost(ctx.userId, content, 'emotion', true);
    return {
      summary: '已经悄悄投进树洞了，放心，没人知道是你～',
      card: { type: 'tree', title: '匿名树洞', summary: content.slice(0, 80) },
    };
  },
};

const happinessTracker: Skill = {
  name: 'happiness-tracker',
  displayName: '幸福度追踪',
  description: '记录或查看幸福度变化，生成趋势曲线。',
  fullInstructions: '当用户想记录幸福度(write)或查看趋势(read)时使用。action 取 read/write；write 时提取分数(score 0-100)、事件(event_desc)。',
  triggerKeywords: ['幸福度', '幸福', '开心指数', '趋势', '曲线', '记录幸福'],
  permission: 'craft',
  returns: 'happiness',
  tier: 'balanced',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const action = String(ctx.params.action || 'read');
    if (action === 'write') {
      const score = Number(ctx.params.score ?? 50);
      const eventDesc = String(ctx.params.event_desc || '记录幸福时刻');
      await addHappinessLog(ctx.userId, 'positive', eventDesc, score);
      return {
        summary: `幸福度 ${score} 分已经记下啦，愿你常有这样的时刻～`,
        card: { type: 'happiness', title: '幸福度', score, summary: eventDesc },
      };
    }
    const logs = await getHappinessLogs(ctx.userId, 7);
    const trend = logs.slice().reverse().map(l => l.score);
    const cur = trend.length ? trend[trend.length - 1] : 0;
    return {
      summary: trend.length ? '这是你最近的幸福度曲线，整体在向上走呢～' : '还没有幸福度记录，先记一条试试吧～',
      card: { type: 'happiness', title: '幸福度', score: cur, trend, summary: `近 ${logs.length} 条记录` },
    };
  },
};

const webSearch: Skill = {
  name: 'web-search',
  displayName: '联网搜索',
  description: '实时检索全网资料，给出带来源的总结。',
  fullInstructions: '当用户需要实时信息、新闻、查资料时使用。提取搜索关键词(query)。',
  triggerKeywords: ['搜索', '查一下', '查询', '最新', '新闻', '帮我查', '是什么', '怎么样'],
  permission: 'auto',
  returns: 'knowledge',
  tier: 'balanced',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const query = String(ctx.params.query || '');
    const { data, error } = await supabase.functions.invoke('heron-web-search', { body: { query } });
    if (error || !data) return { summary: '联网搜索暂时不可用，请稍后再试～' };
    const summary: string = data.summary || '';
    const sources: Array<{ title: string; url: string }> = Array.isArray(data.sources) ? data.sources : [];
    // 去除 Markdown 标记，避免卡片中出现 ###、**、- 等符号
    const cleanSummary = summary
      .replace(/#{1,6}\s+/g, '')                        // 去掉标题标记 ###
      .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')        // 去掉 **加粗** / *斜体*
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')           // 去掉 [链接](url)
      .replace(/^[\s]*[-*+]\s+/gm, '')                   // 去掉列表标记 "- " "* "
      .replace(/^\s*\d+\.\s+/gm, '')                     // 去掉有序列表 "1. "
      .replace(/\n{3,}/g, '\n\n')                        // 折叠多余空行
      .replace(/\s*\.{3}\s*$/, '')                       // 去掉结尾 " ..."
      .replace(/\s*…\s*$/, '')                           // 去掉结尾 "…"
      .trim();
    // 不限制字数：返回完整搜索结果，不截断或省略任何信息
    const finalSummary = cleanSummary;
    return {
      summary: finalSummary || '已为你查到相关资料～',
      card: {
        type: 'knowledge',
        title: query,
        summary: finalSummary,
        // knowledge 卡片不使用 points（来源已在 meta.sources 中，避免重复）
        meta: {
          sourceCount: String(sources.length),
          // 完整来源（含 URL）序列化存储，供 ResultCard 渲染可点链接
          sources: JSON.stringify(sources),
        },
      },
    };
  },
};

const fileReader: Skill = {
  name: 'file-reader',
  displayName: '文件解读',
  description: '解读图片或文档内容，给出要点与回答。',
  fullInstructions: '当用户上传图片或文件并提问时使用。file_type 取 image/file；提取 user_question。',
  triggerKeywords: ['解读', '识别', '看看', '分析图片', '这个文件', '图片', '文档', '截图'],
  permission: 'auto',
  returns: 'file',
  tier: 'balanced',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const fileType = String(ctx.params.file_type || 'file');
    const userQuestion = ctx.params.user_question ? String(ctx.params.user_question) : '';
    const img = ctx.attachments.find(a => a.kind === 'image');
    if (fileType === 'image' && img?.uri) {
      const content = await ctx.llm(
        [{ role: 'user', content: [
          { type: 'text', text: userQuestion ? `请解读这张图片并回答：${userQuestion}` : '请解读这张图片的内容与情绪。' },
          { type: 'image_url', image_url: { url: img.uri } },
        ] }],
        'kimi-k3',
      );
      return {
        summary: content,
        card: { type: 'file', title: img.name || '图片解读', summary: content.slice(0, 120) },
      };
    }
    const fileContent = String(ctx.params.file_content || '');
    const text = fileContent || '（无法提取文件文本内容）';
    const prompt = userQuestion
      ? `请根据以下文件内容回答问题：${userQuestion}\n\n文件内容：\n${text.slice(0, 4000)}`
      : `请总结以下文件内容的要点（分条输出）：\n\n${text.slice(0, 4000)}`;
    const content = await ctx.llm([{ role: 'user', content: prompt }]);
    const points = content.split('\n').filter(l => /^\s*([1-9一二三四五][、.．)]|[-•*])/.test(l)).slice(0, 5);
    return {
      summary: content,
      card: { type: 'file', title: ctx.attachments[0]?.name || '文件解读', summary: content.slice(0, 120), points },
    };
  },
};

const paintingHouse: Skill = {
  name: 'painting-house',
  displayName: '心绘小屋',
  description: '根据描述生成一幅治愈系画作。',
  fullInstructions: '当用户想画画、生成图片、创作画作时使用。提取画面描述(prompt)、风格(style)。',
  triggerKeywords: ['画画', '画一幅', '生成图', '画图', '创作', '画一个', '插画'],
  permission: 'craft',
  returns: 'image',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const prompt = String(ctx.params.prompt || '');
    const style = String(ctx.params.style || '治愈水彩');
    const { data: row } = await supabase.from('painting_house_works').insert({
      user_id: ctx.userId, title: prompt.slice(0, 20) || '心绘作品',
      mode: 'simple', style, prompt, status: 'pending',
    }).select().maybeSingle();
    if (!row) return { summary: '绘画创建失败，请重试～' };
    await supabase.functions.invoke('paint-generate', {
      body: { work_id: row.id, prompt, style, user_id: ctx.userId, mode: 'simple', size: '1024x1024', gen_model: 'gpt' },
    });
    const deadline = Date.now() + 120000;
    let work: Record<string, unknown> = row;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const { data } = await supabase.from('painting_house_works').select('*').eq('id', row.id).maybeSingle();
      if (!data) continue;
      work = data as Record<string, unknown>;
      if (work.status === 'done') break;
      if (work.status === 'error') return { summary: (work.error_msg as string) || '绘画生成失败，请重试～' };
    }
    const url = (work.image_url as string) || ((work.image_urls as string[]) || [])[0];
    if (!url) return { summary: '绘画生成超时，请稍后再试～' };
    return {
      summary: '画好啦，看看这幅治愈小图～',
      card: { type: 'image', title: prompt.slice(0, 20) || '心绘作品', imageUrl: url },
    };
  },
};

const aiDevWorkbench: Skill = {
  name: 'ai-dev-workbench',
  displayName: 'AI 工作台',
  description: '一句话生成可预览的小应用网页。',
  fullInstructions: '当用户想生成网页、小应用、小工具时使用。提取需求描述(description)。',
  triggerKeywords: ['做网页', '生成应用', '生成网页', '做个工具', '小应用', '网页', '工具'],
  permission: 'craft',
  returns: 'web',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const description = String(ctx.params.description || '');
    const html = await ctx.llm(
      [
        { role: 'system', content: '你是资深前端工程师。根据用户需求生成一个完整、可直接在浏览器运行的单文件 HTML 应用，使用纯内联 CSS 和原生 JS，不依赖任何外部 CDN 或库，界面温暖治愈风格。只输出 HTML 代码本身，不要用代码块包裹，不要任何解释。' },
        { role: 'user', content: description },
      ],
      'kimi-k3',
    );
    const code = html.replace(/```html|```/gi, '').trim();
    if (!code) return { summary: '网页生成失败，请重试～' };
    // 不上传到 Storage（Supabase Storage 会以 text/plain 返回 .html，导致浏览器显示源码）
    // 改为将 HTML 内容存在 card.htmlContent，预览时由前端用 Blob URL / data URI 渲染
    return {
      summary: '小应用已经生成好啦，点击卡片即可预览～',
      card: {
        type: 'web',
        title: description.slice(0, 20) || 'AI 小应用',
        summary: '已生成可预览网页',
        htmlContent: code,
      },
    };
  },
};

const courseKnowledge: Skill = {
  name: 'course-knowledge',
  displayName: '课程知识检索',
  description: '检索课程笔记与知识，给出结构化回答。',
  fullInstructions: '当用户询问课程内容、知识点、学习资料时使用。提取查询(query)、操作(action read)。',
  triggerKeywords: ['课程', '知识点', '学习', '资料', '笔记', '这个知识点', '怎么学'],
  permission: 'auto',
  returns: 'knowledge',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const query = String(ctx.params.query || '');
    const { data: notes } = await supabase.from('notes').select('id,title,plain_text').eq('user_id', ctx.userId).limit(50);
    const list = Array.isArray(notes) ? notes : [];
    const q = query.toLowerCase();
    const matched = list.filter(n => (n.title || '').toLowerCase().includes(q) || (n.plain_text || '').toLowerCase().includes(q));
    const top = (matched.length ? matched : list).slice(0, 3);
    const context = top.map(n => `《${n.title}》：${(n.plain_text || '').slice(0, 300)}`).join('\n\n');
    const answer = await ctx.llm(
      [
        { role: 'system', content: '你是课程知识助手，根据用户笔记内容回答问题，分条给出要点。若笔记中没有相关内容，请诚实说明并给出通用建议。' },
        { role: 'user', content: `问题：${query}\n\n相关笔记：\n${context || '（暂无相关笔记）'}` },
      ],
    );
    return {
      summary: answer,
      card: {
        type: 'knowledge', title: query || '课程知识', summary: answer.slice(0, 120),
        points: top.map(n => `《${n.title}》`),
        noteId: top[0]?.id,
      },
    };
  },
};

const skillCreator: Skill = {
  name: 'skill-creator',
  displayName: '技能创建',
  description: '为苍鹭医生创建一个新的自定义技能。',
  fullInstructions: '当用户想创建、新增技能时使用。提取技能名称(name)、显示名(displayName)、描述(description)、完整指令(fullInstructions)、触发关键词数组(triggerKeywords)。',
  triggerKeywords: ['创建技能', '新增技能', '加个技能', '做一个技能', '自定义技能'],
  permission: 'ask',
  returns: 'skill-created',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const name = String(ctx.params.name || '').trim().toLowerCase().replace(/\s+/g, '-');
    const displayName = String(ctx.params.displayName || name || '自定义技能');
    const description = String(ctx.params.description || '');
    const fullInstructions = String(ctx.params.fullInstructions || '');
    const triggerKeywords = Array.isArray(ctx.params.triggerKeywords)
      ? ctx.params.triggerKeywords.map(String)
      : String(ctx.params.triggerKeywords || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (!name) return { summary: '技能名称不能为空，请告诉我技能叫什么～' };
    registerCustomSkill({
      name, displayName, description, fullInstructions, triggerKeywords,
      permission: 'ask', returns: 'knowledge', tier: 'balanced',
      handler: async () => ({ summary: `「${displayName}」技能已就绪，你可以通过 @${name} 调用它。` }),
    });
    return {
      summary: `已经为苍鹭医生创建好「${displayName}」技能啦，用 @${name} 就能调用～`,
      card: { type: 'skill-created', title: displayName, summary: description, points: triggerKeywords, meta: { name } },
    };
  },
};

const webReader: Skill = {
  name: 'web-reader',
  displayName: '网页解析',
  description: '解析任意网页 URL，返回干净的 Markdown 文本，用于阅读、总结、翻译。',
  fullInstructions: '当用户分享网页链接、想读取/总结/解析网页内容时使用。提取网页地址(url)。',
  triggerKeywords: ['解析网页', '读取网页', '总结网页', '网页内容', '这个链接', '网页', 'URL', '网址'],
  permission: 'auto',
  returns: 'web-reader',
  tier: 'balanced',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const url = String(ctx.params.url || '');
    if (!url) return { summary: '❌ 请提供要解析的网页链接～' };
    const { data, error } = await supabase.functions.invoke('heron-web-reader', { body: { url, withLinksSummary: true } });
    if (error || !data?.content) return { summary: '❌ 网页解析暂时不可用，请检查链接或稍后再试～' };
    const content: string = String(data.content);
    const titleMatch = content.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : url;
    const md = content.replace(/^Title:.*$/m, '').replace(/^URL Source:.*$/m, '').replace(/^Markdown Content:/m, '').trim();
    return {
      summary: md.slice(0, 400),
      card: { type: 'web-reader', title, summary: md.slice(0, 500), link: url, meta: { full: md } },
    };
  },
};

const pdfParse: Skill = {
  name: 'pdf-parse',
  displayName: 'PDF 解析',
  description: '解析 PDF 文档内容，提取文本与结构，支持总结要点。',
  fullInstructions: '当用户上传 PDF 并想解析、提取、读取其内容时使用。提取用户问题(user_question，可选)。',
  triggerKeywords: ['解析PDF', '提取PDF', '读取PDF', 'PDF内容', 'PDF', '解析文档'],
  permission: 'auto',
  returns: 'pdf-parse',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const file = ctx.attachments.find(a => a.kind === 'file' && /\.pdf$/i.test(a.name || ''));
    if (!file?.uri) return { summary: '❌ 请上传一个 PDF 文件让我解析～' };
    const base64 = await readAttachmentBase64(file.uri);
    if (!base64) return { summary: '❌ 无法读取 PDF 内容，请重新上传～' };
    const { data, error } = await supabase.functions.invoke('heron-pdf-parse', { body: { base64, filename: file.name } });
    if (error || !data) return { summary: '❌ PDF 解析失败，请重试～' };
    const text: string = String(data.text || '');
    const pageCount = Number(data.pageCount || 0);
    const userQuestion = ctx.params.user_question ? String(ctx.params.user_question) : '';
    let summary = text;
    if (userQuestion) {
      summary = await ctx.llm([
        { role: 'system', content: '你是文档分析助手，根据 PDF 文本回答用户问题，分条给出要点。' },
        { role: 'user', content: `问题：${userQuestion}\n\nPDF 内容：\n${text.slice(0, 6000)}` },
      ]);
    } else {
      summary = await ctx.llm([
        { role: 'system', content: '你是文档分析助手，请用中文分条总结以下 PDF 内容的要点。' },
        { role: 'user', content: text.slice(0, 6000) || '（未提取到文本，可能是扫描件）' },
      ]);
    }
    return {
      summary,
      card: {
        type: 'pdf-parse', title: file.name || 'PDF 解析', summary: summary.slice(0, 300),
        points: [`共 ${pageCount} 页`], meta: { full: text.slice(0, 8000) },
      },
    };
  },
};

const pdfExporter: Skill = {
  name: 'pdf-exporter',
  displayName: 'PDF 导出',
  description: '将文本资料排版后导出为 PDF 文件，支持标题、段落、列表等排版。',
  fullInstructions: '当用户想把文本/资料/笔记导出为 PDF 时使用。提取标题(title)与正文(content)。',
  triggerKeywords: ['导出PDF', '生成PDF', '保存为PDF', '转PDF', '导出', 'PDF'],
  permission: 'craft',
  returns: 'pdf-export',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    let title = String(ctx.params.title || '').trim();
    let content = String(ctx.params.content || '').trim();
    if (!content) return { summary: '❌ 内容为空，无法导出 PDF～' };
    // 若 content 是请求而非正文，先用 LLM 生成完整内容
    if (content.length < 40 || /^(帮我|请你|请帮|给我|生成|写|导出)/.test(content)) {
      try {
        content = await ctx.llm([
          { role: 'system', content: '你是苍鹭医生，请根据用户请求生成结构清晰、排版良好的中文正文（使用 Markdown：# 标题、- 列表、段落），用于导出 PDF。' },
          { role: 'user', content: content || ctx.params.query as string || '帮我生成一份资料' },
        ]);
      } catch { /* 保持原文 */ }
    }
    if (!title) title = String(ctx.params.query || '资料导出');
    const { data, error } = await supabase.functions.invoke('heron-pdf-export', { body: { title, content } });
    if (error || !data?.base64) return { summary: '❌ PDF 排版失败，请重试～' };
    return {
      summary: `已经把「${title}」排版导出为 PDF 啦，点击卡片即可下载或分享～`,
      card: {
        type: 'pdf-export', title: `${title}.pdf`, summary: `共 ${data.pageCount} 页`,
        pdfBase64: String(data.base64), points: [title],
      },
    };
  },
};


const imaKnowledge: Skill = {
  name: 'ima-knowledge',
  displayName: 'ima 知识库',
  description: '接入腾讯 ima 知识库，支持列出/搜索知识库、搜索知识内容、导入网页、导出原文。',
  fullInstructions: '当用户想操作 ima 知识库时使用。action 取 list(列出知识库)/search(搜索内容)/import(导入网页)。提取知识库名称(kbName，可选)、搜索词(query)、网页地址(urls，import 时)。',
  triggerKeywords: ['ima', '知识库', '导入到ima', '从ima导出', '搜索知识库', '调用知识库', 'ima知识库'],
  permission: 'craft',
  returns: 'ima',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const action = String(ctx.params.action || 'list');
    const kbName = String(ctx.params.kbName || '');
    const query = String(ctx.params.query || '');
    if (action === 'import') {
      const urls = Array.isArray(ctx.params.urls) ? ctx.params.urls.map(String) : String(ctx.params.urls || '').split(/[,，\s]+/).filter(Boolean);
      if (!urls.length) return { summary: '❌ 请提供要导入到 ima 知识库的网页地址～' };
      const { data, error } = await supabase.functions.invoke('heron-ima', { body: { action: 'import_url', kbName, urls } });
      if (error || !data?.success) return { summary: '❌ 导入到 ima 知识库失败，请稍后再试～' };
      return { summary: `已把网页导入到 ima 知识库「${kbName || '默认'}」啦～`, card: { type: 'ima', title: '导入成功', summary: `已导入 ${urls.length} 个网页到知识库`, link: 'https://ima.qq.com' } };
    }
    if (action === 'search') {
      if (!query) return { summary: '❌ 请告诉我要在知识库里搜索什么内容～' };
      const { data, error } = await supabase.functions.invoke('heron-ima', { body: { action: 'search_knowledge', kbName, query } });
      if (error) return { summary: `❌ ima 知识库搜索失败，请稍后再试～` };
      const list = Array.isArray(data?.list) ? data.list : [];
      if (!list.length) return { summary: '在 ima 知识库中没有找到相关内容～', card: { type: 'ima', title: '未找到结果', summary: '知识库中暂无匹配内容', link: 'https://ima.qq.com' } };
      const top = list.slice(0, 5);
      return {
        summary: top.map((k: { title: string; summary: string }) => `《${k.title}》：${k.summary.slice(0, 60)}`).join('\n'),
        card: { type: 'ima', title: `ima 知识库检索`, summary: `找到 ${list.length} 条相关内容`, points: top.map((k: { title: string }) => k.title), link: 'https://ima.qq.com' },
      };
    }
    // list
    const { data, error } = await supabase.functions.invoke('heron-ima', { body: { action: 'list_kb' } });
    if (error) return { summary: `❌ ima 知识库连接失败，请检查配置或稍后再试～` };
    const list = Array.isArray(data?.list) ? data.list : [];
    if (!list.length) return { summary: '你的 ima 知识库还是空的，先去 ima 创建一个吧～', card: { type: 'ima', title: '暂无知识库', summary: '请前往 ima.qq.com 创建知识库', link: 'https://ima.qq.com' } };
    return {
      summary: list.map((k: { name: string; description: string }) => `📚 ${k.name}${k.description ? ' — ' + k.description : ''}`).join('\n'),
      card: { type: 'ima', title: '你的 ima 知识库', summary: `共 ${list.length} 个知识库`, points: list.map((k: { name: string }) => k.name), link: 'https://ima.qq.com' },
    };
  },
};

const docConvert: Skill = {
  name: 'document-format-conversion',
  displayName: '文档转换',
  description: '将图片或 PDF 转换为 Word/Excel，保留原版式（异步处理，自动等待结果）。',
  fullInstructions: '当用户想把图片或 PDF 转换为 Word/Excel 时使用。提取目标格式(target: word/excel)。需用户上传图片或 PDF。',
  triggerKeywords: ['转换为Word', '转换为Excel', '转Word', '转Excel', '图片转Word', 'PDF转Excel', '文档转换'],
  permission: 'craft',
  returns: 'doc-convert',
  tier: 'flagship',
  async handler(ctx: SkillContext): Promise<SkillResult> {
    const file = ctx.attachments.find(a => a.kind === 'file');
    if (!file?.uri) return { summary: '❌ 请上传图片或 PDF 文件再进行转换～' };
    const isPdf = /\.pdf$/i.test(file.name || '');
    const base64 = await readAttachmentBase64(file.uri);
    if (!base64) return { summary: '❌ 无法读取文件内容，请重新上传～' };
    const { data: submitData, error: submitErr } = await supabase.functions.invoke('doc-convert-submit', { body: { base64, fileType: isPdf ? 'pdf' : 'image' } });
    if (submitErr || !submitData?.taskId) return { summary: '❌ 文档转换提交失败，请重试～' };
    const taskId = String(submitData.taskId);
    // 轮询查询结果（最多约 90 秒）
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
      const { data: qData, error: qErr } = await supabase.functions.invoke('doc-convert-query', { body: { taskId } });
      if (qErr || !qData) continue;
      if (qData.status === 'succeed') {
        const word = String(qData.word || '');
        const excel = String(qData.excel || '');
        const link = word || excel;
        if (!link) return { summary: '转换完成，但未获取到下载链接～', card: { type: 'doc-convert', title: file.name, summary: '转换完成' } };
        return {
          summary: `已将「${file.name}」转换为文档，点击卡片下载～`,
          card: { type: 'doc-convert', title: file.name.replace(/\.[^.]+$/, '') + (word ? '.docx' : '.xlsx'), summary: '转换完成，可下载', link },
        };
      }
    }
    return { summary: '转换仍在处理中，请稍后重试～', card: { type: 'doc-convert', title: file.name, summary: '转换处理中，请稍候' } };
  },
};

export const BUILTIN_SKILLS: Skill[] = [
  noteWriter, moodCheckin, anonymousTree, happinessTracker,
  webSearch, fileReader, paintingHouse, aiDevWorkbench,
  courseKnowledge, skillCreator,
  webReader, pdfParse, pdfExporter, imaKnowledge, docConvert,
];

// 用户自定义技能（运行时注册，仅当前会话有效）
const customSkills = new Map<string, Skill>();

export function registerCustomSkill(skill: Skill): void {
  customSkills.set(skill.name, skill);
}

export function getAllSkills(): Skill[] {
  return [...BUILTIN_SKILLS, ...Array.from(customSkills.values())];
}

export function findSkill(name: string | null | undefined): Skill | undefined {
  if (!name) return undefined;
  return getAllSkills().find(s => s.name === name);
}