import { supabase } from '@/client/supabase';
import type {
  Profile, MoodCheckin, MoodType, HappinessLog, EventType,
  TreeHolePost, TreeHoleCategory, ReactionType,
  ChatSession, ExpertType, ChatMessage,
  TestResult, TestType, PositiveTask, Article, ArticleCategory,
  HeronSession, HeronMessage, HeronMemory, HeronAuditLog, HeronScheduledTask,
} from '@/types/types';

// ============ 档案 ============
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<void> {
  await supabase.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', userId);
}

// ============ 心情打卡 ============
// 本地日期（非 UTC），避免 UTC+8 用户零点前8小时仍读到昨天数据
function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getTodayMood(userId: string): Promise<MoodCheckin | null> {
  const today = localDateStr();
  const { data } = await supabase
    .from('mood_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('checked_at', today)
    .maybeSingle();
  return data;
}

export async function checkInMood(userId: string, mood: string, note?: string): Promise<void> {
  const today = localDateStr();
  await supabase.from('mood_checkins').upsert({
    user_id: userId, mood, note: note ?? null, checked_at: today,
  }, { onConflict: 'user_id,checked_at' });
}

export async function getMoodHistory(userId: string, days = 30): Promise<MoodCheckin[]> {
  const { data } = await supabase
    .from('mood_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('checked_at', { ascending: false })
    .limit(days);
  return Array.isArray(data) ? data : [];
}

// ============ 幸福度日志 ============
export async function addHappinessLog(
  userId: string, event_type: EventType, event_desc: string, score: number
): Promise<void> {
  await supabase.from('happiness_logs').insert({
    user_id: userId, event_type, event_desc, score,
    log_date: localDateStr(), // 使用本地日期，避免 UTC+8 用户零点前8小时写入昨天日期
  });
}

export async function getHappinessLogs(userId: string, days = 30): Promise<HappinessLog[]> {
  const { data } = await supabase
    .from('happiness_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(days);
  return Array.isArray(data) ? data : [];
}

// ============ 树洞 ============
export async function getPublicPosts(category?: TreeHoleCategory, limit = 20): Promise<TreeHolePost[]> {
  let query = supabase
    .from('tree_hole_posts')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (category) query = query.eq('category', category);
  const { data } = await query;
  return Array.isArray(data) ? data : [];
}

export async function getMyPosts(userId: string): Promise<TreeHolePost[]> {
  const { data } = await supabase
    .from('tree_hole_posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return Array.isArray(data) ? data : [];
}

export async function createPost(
  userId: string, content: string, category: TreeHoleCategory, isPublic: boolean
): Promise<void> {
  await supabase.from('tree_hole_posts').insert({
    user_id: userId, content, category, is_public: isPublic,
  });
}

export async function deletePost(postId: string): Promise<void> {
  await supabase.from('tree_hole_posts').delete().eq('id', postId);
}

export async function addReaction(
  userId: string, postId: string, reactionType: ReactionType
): Promise<void> {
  // 单选覆盖：同一用户对同一帖子只保留一种互动态度
  await supabase.from('tree_hole_reactions').upsert(
    { user_id: userId, post_id: postId, reaction_type: reactionType },
    { onConflict: 'post_id,user_id' }
  );
}

/** 批量获取多个帖子的各类型互动计数 */
export async function getBatchReactionCounts(
  postIds: string[]
): Promise<Record<string, { hug: number; empathy: number; brave: number }>> {
  if (!postIds.length) return {};
  const { data } = await supabase
    .from('tree_hole_reactions')
    .select('post_id, reaction_type')
    .in('post_id', postIds);
  const result: Record<string, { hug: number; empathy: number; brave: number }> = {};
  postIds.forEach(id => { result[id] = { hug: 0, empathy: 0, brave: 0 }; });
  (data ?? []).forEach(r => {
    if (result[r.post_id]) {
      const k = r.reaction_type as keyof typeof result[string];
      if (k in result[r.post_id]) result[r.post_id][k]++;
    }
  });
  return result;
}

/** 批量获取当前用户对多个帖子的互动状态 */
export async function getUserReactionsForPosts(
  userId: string, postIds: string[]
): Promise<Record<string, ReactionType | null>> {
  if (!postIds.length) return {};
  const { data } = await supabase
    .from('tree_hole_reactions')
    .select('post_id, reaction_type')
    .eq('user_id', userId)
    .in('post_id', postIds);
  const result: Record<string, ReactionType | null> = {};
  postIds.forEach(id => { result[id] = null; });
  (data ?? []).forEach(r => { result[r.post_id] = r.reaction_type as ReactionType; });
  return result;
}

export async function getPostReactions(postId: string): Promise<{ reaction_type: string; count: number }[]> {
  const { data } = await supabase
    .from('tree_hole_reactions')
    .select('reaction_type')
    .eq('post_id', postId);
  if (!data) return [];
  const counts: Record<string, number> = {};
  data.forEach(r => { counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1; });
  return Object.entries(counts).map(([reaction_type, count]) => ({ reaction_type, count }));
}

// ============ AI对话 ============
export async function createChatSession(userId: string, expert: ExpertType): Promise<ChatSession | null> {
  const { data } = await supabase
    .from('chat_sessions')
    .insert({ user_id: userId, expert, messages: [] })
    .select()
    .maybeSingle();
  return data;
}

export async function updateChatSession(
  sessionId: string,
  updates: { messages?: ChatMessage[]; summary?: string; homework?: string; is_completed?: boolean; title?: string }
): Promise<void> {
  await supabase
    .from('chat_sessions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

export async function getMyChatSessions(userId: string): Promise<ChatSession[]> {
  const { data } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);
  return Array.isArray(data) ? data : [];
}

// ============ 测试记录 ============
export async function saveTestResult(
  userId: string, testType: TestType, resultData: Record<string, unknown>, _score: number, summary?: string
): Promise<void> {
  await supabase.from('test_results').insert({
    user_id: userId, test_type: testType,
    result_data: { ...resultData, _score },
    summary: summary ?? null,
  });
}

export async function getTestResults(userId: string, testType?: TestType): Promise<TestResult[]> {
  let query = supabase
    .from('test_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (testType) query = query.eq('test_type', testType);
  const { data } = await query;
  return Array.isArray(data) ? data : [];
}

// 获取梦的解析记录（dream_records 表）
export async function getDreamRecords(userId: string): Promise<{
  id: string; title: string; content: string; ai_analysis: string | null; created_at: string;
}[]> {
  const { data } = await supabase
    .from('dream_records')
    .select('id, title, content, ai_analysis, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return Array.isArray(data) ? data : [];
}

// ============ 积极任务 ============
export async function getMyTasks(userId: string): Promise<PositiveTask[]> {
  const { data } = await supabase
    .from('positive_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  return Array.isArray(data) ? data : [];
}

export async function createTask(userId: string, taskType: string, taskTitle: string): Promise<void> {
  await supabase.from('positive_tasks').insert({ user_id: userId, task_type: taskType, task_title: taskTitle });
}

export async function completeTask(taskId: string): Promise<void> {
  await supabase.from('positive_tasks').update({
    is_completed: true, completed_at: new Date().toISOString(),
  }).eq('id', taskId);
}

// ============ 科普文章 ============
export async function getFeaturedArticles(limit = 6): Promise<Article[]> {
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getArticlesByCategory(category: ArticleCategory, limit = 20): Promise<Article[]> {
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getAllArticles(limit = 30): Promise<Article[]> {
  const { data } = await supabase
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getArticleById(id: string): Promise<Article | null> {
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  // 增加阅读量
  if (data) {
    await supabase.from('articles').update({ read_count: (data.read_count ?? 0) + 1 }).eq('id', id);
  }
  return data;
}

// ============ 树洞评论 ============
export async function getPostComments(postId: string): Promise<import('@/types/types').TreeHoleComment[]> {
  const { data } = await supabase
    .from('tree_hole_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100);
  return Array.isArray(data) ? data : [];
}

export async function addComment(userId: string, postId: string, content: string): Promise<void> {
  await supabase.from('tree_hole_comments').insert({ user_id: userId, post_id: postId, content });
}

export async function deleteComment(commentId: string): Promise<void> {
  await supabase.from('tree_hole_comments').delete().eq('id', commentId);
}


export async function getPostById(id: string): Promise<TreeHolePost | null> {
  const { data } = await supabase
    .from('tree_hole_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data;
}

// ============ 希望叶片 ============
export interface HopeLeaf {
  id: string;
  user_id: string | null;
  will_power: string;
  way_power: string | null;
  leaf_color: string;
  created_at: string;
}

export async function getHopeLeaves(limit = 40): Promise<HopeLeaf[]> {
  const { data } = await supabase
    .from('hope_leaves')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function addHopeLeaf(
  userId: string | null,
  willPower: string,
  wayPower: string,
  leafColor: string,
): Promise<void> {
  await supabase.from('hope_leaves').insert({
    user_id: userId,
    will_power: willPower,
    way_power: wayPower || null,
    leaf_color: leafColor,
  });
}

export async function updateHopeLeaf(
  id: string,
  willPower: string,
  wayPower: string,
): Promise<void> {
  await supabase.from('hope_leaves').update({
    will_power: willPower,
    way_power: wayPower || null,
  }).eq('id', id);
}

export async function deleteHopeLeaf(id: string): Promise<void> {
  await supabase.from('hope_leaves').delete().eq('id', id);
}

// ════════════════════════════════════════════════════════════════════
//  愈心手记 — 文件夹 CRUD
// ════════════════════════════════════════════════════════════════════
import type { NoteFolder, Note, NoteAttachment, NoteBlock } from '@/types/types';

export async function getNoteFolders(userId: string): Promise<NoteFolder[]> {
  const { data } = await supabase
    .from('note_folders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  const flat: NoteFolder[] = Array.isArray(data) ? data : [];
  // 聚合每个文件夹的笔记数
  const { data: counts } = await supabase
    .from('notes')
    .select('folder_id')
    .eq('user_id', userId)
    .not('folder_id', 'is', null);
  const countMap: Record<string, number> = {};
  if (Array.isArray(counts)) {
    counts.forEach((r: { folder_id: string }) => {
      if (r.folder_id) countMap[r.folder_id] = (countMap[r.folder_id] || 0) + 1;
    });
  }
  return flat.map(f => ({ ...f, note_count: countMap[f.id] || 0 }));
}

export async function createNoteFolder(
  userId: string, name: string, color = '#F9C784', parentId?: string | null,
): Promise<NoteFolder | null> {
  const payload: Record<string, unknown> = { user_id: userId, name: name.trim(), color };
  if (parentId) payload.parent_id = parentId;
  const { data, error } = await supabase
    .from('note_folders')
    .insert(payload)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateNoteFolder(id: string, name: string, color?: string): Promise<void> {
  const payload: Record<string, string> = { name: name.trim() };
  if (color) payload.color = color;
  const { error } = await supabase.from('note_folders').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteNoteFolder(id: string): Promise<void> {
  // notes.folder_id ON DELETE SET NULL — 文件夹删除后笔记保留
  await supabase.from('note_folders').delete().eq('id', id);
}

// ════════════════════════════════════════════════════════════════════
//  愈心手记 — 笔记 CRUD
// ════════════════════════════════════════════════════════════════════

/** 从块数组提取纯文本（用于全文搜索索引） */
function blocksToPlainText(blocks: NoteBlock[]): string {
  return blocks
    .filter(b => b.type !== 'image' && b.type !== 'attachment')
    .map(b => b.content)
    .join(' ')
    .trim();
}

export async function getNotes(
  userId: string,
  folderId?: string | null,
  limit = 50,
): Promise<Note[]> {
  let q = supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (folderId !== undefined) {
    q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null);
  }
  const { data } = await q;
  return Array.isArray(data) ? data : [];
}

export async function getNoteById(id: string): Promise<Note | null> {
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function createNote(
  userId: string,
  title: string,
  blocks: NoteBlock[],
  folderId?: string | null,
): Promise<Note | null> {
  const { data } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      folder_id: folderId || null,
      title: title.trim() || '无标题',
      blocks: blocks as unknown as Record<string, unknown>[],
      plain_text: blocksToPlainText(blocks),
    })
    .select()
    .maybeSingle();
  return data;
}

export async function updateNote(
  id: string,
  title: string,
  blocks: NoteBlock[],
  folderId?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    title: title.trim() || '无标题',
    blocks: blocks as unknown as Record<string, unknown>[],
    plain_text: blocksToPlainText(blocks),
  };
  if (folderId !== undefined) payload.folder_id = folderId || null;
  await supabase.from('notes').update(payload).eq('id', id);
}

export async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
  await supabase.from('notes').update({ folder_id: folderId }).eq('id', noteId);
}

export async function deleteNote(id: string): Promise<void> {
  await supabase.from('notes').delete().eq('id', id);
}

export async function searchNotes(userId: string, keyword: string, limit = 30): Promise<Note[]> {
  if (!keyword.trim()) return [];
  const q = keyword.trim().toLowerCase();
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .or(`title.ilike.%${q}%,plain_text.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getNoteStats(userId: string): Promise<{ total: number; thisWeek: number }> {
  const [{ count: total }, { count: thisWeek }] = await Promise.all([
    supabase.from('notes').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('notes').select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);
  return { total: total || 0, thisWeek: thisWeek || 0 };
}

// ════════════════════════════════════════════════════════════════════
//  愈心手记 — 附件 CRUD
// ════════════════════════════════════════════════════════════════════

export async function getNoteAttachments(noteId: string): Promise<NoteAttachment[]> {
  const { data } = await supabase
    .from('note_attachments')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true });
  return Array.isArray(data) ? data : [];
}

export async function createNoteAttachment(payload: Omit<NoteAttachment, 'id' | 'created_at'>): Promise<NoteAttachment | null> {
  const { data } = await supabase
    .from('note_attachments')
    .insert(payload)
    .select()
    .maybeSingle();
  return data;
}

export async function deleteNoteAttachment(id: string, storagePath: string): Promise<void> {
  await Promise.all([
    supabase.from('note_attachments').delete().eq('id', id),
    supabase.storage.from('note-attachments').remove([storagePath]),
  ]);
}

// ════════════════════════════════════════════════════════════════════
//  苍鹭医生 — 会话历史
// ════════════════════════════════════════════════════════════════════

export async function getHeronSessions(userId: string): Promise<HeronSession[]> {
  const { data } = await supabase
    .from('heron_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  return Array.isArray(data) ? data : [];
}

export async function getHeronSession(id: string): Promise<HeronSession | null> {
  const { data } = await supabase.from('heron_sessions').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function createHeronSession(
  userId: string, title: string, messages: HeronMessage[]
): Promise<HeronSession | null> {
  const { data } = await supabase
    .from('heron_sessions')
    .insert({ user_id: userId, title, messages })
    .select()
    .maybeSingle();
  return data;
}

export async function updateHeronSession(
  id: string, title: string, messages: HeronMessage[]
): Promise<void> {
  await supabase.from('heron_sessions').update({ title, messages, updated_at: new Date().toISOString() }).eq('id', id);
}

// ════════════════════════════════════════════════════════════════════
//  苍鹭医生 — 长期记忆
// ════════════════════════════════════════════════════════════════════

export async function getHeronMemories(userId: string): Promise<HeronMemory[]> {
  const { data } = await supabase
    .from('heron_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  return Array.isArray(data) ? data : [];
}

export async function addHeronMemory(
  userId: string,
  content: string,
  category: 'preference' | 'task' | 'summary' = 'preference',
): Promise<void> {
  await supabase.from('heron_memories').insert({ user_id: userId, content, category });
}

export async function toggleHeronMemoryChecked(id: string, checked: boolean): Promise<void> {
  await supabase.from('heron_memories').update({ checked }).eq('id', id);
}

export async function updateHeronMemoryContent(id: string, content: string): Promise<void> {
  await supabase.from('heron_memories').update({ content }).eq('id', id);
}

export async function deleteHeronMemory(id: string): Promise<void> {
  await supabase.from('heron_memories').delete().eq('id', id);
}

// ════════════════════════════════════════════════════════════════════
//  苍鹭医生 — 审计日志
// ════════════════════════════════════════════════════════════════════

export async function addHeronAuditLog(
  userId: string, action: string, detail: Record<string, unknown>
): Promise<void> {
  await supabase.from('heron_audit_logs').insert({ user_id: userId, action, detail });
}

// ════════════════════════════════════════════════════════════════════
//  苍鹭医生 — 定时任务
// ════════════════════════════════════════════════════════════════════

export async function getHeronScheduledTasks(userId: string): Promise<HeronScheduledTask[]> {
  const { data } = await supabase
    .from('heron_scheduled_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('next_run_at', { ascending: true })
    .limit(50);
  return Array.isArray(data) ? data : [];
}

export async function createHeronScheduledTask(
  userId: string, cron: string, skill: string, prompt: string, nextRunAt: string
): Promise<void> {
  await supabase.from('heron_scheduled_tasks').insert({
    user_id: userId, cron, skill, prompt, next_run_at: nextRunAt,
  });
}

export async function updateHeronScheduledTask(id: string, patch: Partial<HeronScheduledTask>): Promise<void> {
  await supabase.from('heron_scheduled_tasks').update(patch).eq('id', id);
}
