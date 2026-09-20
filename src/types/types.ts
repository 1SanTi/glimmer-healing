// ============ 苍鹭医生 宠物智能体 ============
export type PetState = 'idle' | 'thinking' | 'tool-using' | 'working';
export type SkillPermission = 'ask' | 'craft' | 'auto';

export interface HeronAttachment {
  id: string;
  kind: 'image' | 'file' | 'note';
  name: string;
  size?: number;
  uri?: string;        // 图片/文件本地或远程地址
  content?: string;    // 文本类内容（笔记正文 / 提取文本）
}

export type HeronCardType =
  | 'web' | 'image' | 'note' | 'checkin'
  | 'tree' | 'happiness' | 'knowledge' | 'file' | 'skill-created'
  | 'pdf-export' | 'ima' | 'doc-convert' | 'pdf-parse' | 'web-reader';

export interface HeronCard {
  type: HeronCardType;
  title: string;
  summary?: string;
  points?: string[];
  imageUrl?: string;
  /** AI 工作台生成的原始 HTML 内容，用于本地 Blob/data URI 预览，避免 Storage Content-Type 问题 */
  htmlContent?: string;
  noteId?: string;
  score?: number;
  trend?: number[];
  meta?: Record<string, string>;
  /** PDF 导出：base64 内容，供前端写入本地文件 */
  pdfBase64?: string;
  /** 通用：可点击的外部链接（GitHub 仓库、转换结果、网页原文等） */
  link?: string;
}

/** 单个子任务的执行状态 */
export interface HeronTask {
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

// ReAct 推理链中的单个思考步骤（可展开查看详情）
export interface HeronStep {
  id: string;
  label: string;          // 步骤名称，如「理解需求」「工具调用」
  detail?: string;        // 完整思考过程描述
  tool?: string;          // 使用的工具名称
  params?: string;        // 调用参数（格式化后）
  result?: string;        // 工具返回结果摘要
  durationMs?: number;    // 执行时长（毫秒）
  status?: 'running' | 'done' | 'failed';
}

export interface HeronMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: HeronAttachment[];
  card?: HeronCard;
  state?: PetState;
  steps?: HeronStep[];   // ReAct 推理链节点，用于可视化思考过程
  tasks?: HeronTask[]; // 多步任务清单（任务分解后记录，用于进度看板）
}

export interface HeronSession {
  id: string;
  user_id: string;
  title: string;
  messages: HeronMessage[];
  created_at: string;
  updated_at: string;
}

export interface HeronMemory {
  id: string;
  user_id: string;
  content: string;
  category: 'preference' | 'task' | 'summary'; // 偏好 | 重要事项 | 历史摘要
  checked: boolean; // 仅 task 类型有效
  created_at: string;
}

export interface HeronAuditLog {
  id: string;
  user_id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface HeronScheduledTask {
  id: string;
  user_id: string;
  cron: string;
  skill: string;
  prompt: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
}

// ============ 用户相关 ============
export type UserRole = 'user' | 'admin';

export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// ============ 心情打卡 ============
export type MoodType =
  // 原有基础10种
  | 'happy' | 'calm' | 'sad' | 'anxious' | 'angry' | 'tired'
  | 'grateful' | 'excited' | 'confused' | 'depressed'
  // PDF《生活中的情绪心理学》新增12种
  | 'disappointed' | 'hopeful' | 'shy' | 'humorous' | 'brave' | 'awe'
  | 'jealous' | 'regretful' | 'lonely' | 'fearful' | 'bored' | 'peaceful';

export interface MoodCheckin {
  id: string;
  user_id: string;
  mood: MoodType;
  note: string | null;
  checked_at: string;
  created_at: string;
}

// ============ 幸福度日志 ============
export type EventType = 'positive' | 'negative';

export interface HappinessLog {
  id: string;
  user_id: string;
  event_type: EventType;
  event_desc: string;
  score: number;
  log_date: string;
  created_at: string;
}

// ============ 树洞 ============
export type TreeHoleCategory = 'academic' | 'interpersonal' | 'workplace' | 'emotion' | 'general';
export type ReactionType = 'hug' | 'empathy' | 'brave';

export interface TreeHolePost {
  id: string;
  user_id: string;
  content: string;
  category: TreeHoleCategory;
  is_public: boolean;
  is_crisis: boolean;
  created_at: string;
}

export interface TreeHoleReaction {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

// ============ AI对话 ============
export type ExpertType = 'rogers' | 'beck' | 'perls' | 'wolpe' | 'freud' | 'white' | 'deshazer' | 'hayes' | 'frankl' | 'satir' | 'rosenberg';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  technique?: string;  // AI使用的技术标记
  audio_url?: string;  // TTS 生成的音频 URL（持久化）
  audio_length?: number; // TTS 音频时长（秒）
  timestamp: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  expert: ExpertType;
  title: string | null;
  messages: ChatMessage[];
  summary: string | null;
  homework: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

// ============ 心理测试 ============
export type TestType = 'scl90' | 'mht' | 'mbti' | 'via' | 'stress' | 'htp' | 'confidence' | 'mental_age'
  | 'phq9' | 'gad7' | 'burnout' | 'social_anxiety' | 'loneliness'
  | 'aas' | 'enneagram' | 'big5' | 'ses' | 'sleep' | 'maas'
  | 'sds' | 'sas' | 'cesd' | 'hads' | 'grit' | 'mlq' | 'ssrs'
  | 'holland' | 'scsq' | 'sketch' | 'sandbox' | 'dream';

export interface TestResult {
  id: string;
  user_id: string;
  test_type: TestType;
  result_data: Record<string, unknown>;
  summary: string | null;
  created_at: string;
}

// ============ 积极任务 ============
export interface PositiveTask {
  id: string;
  user_id: string;
  task_type: string;
  task_title: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

// ============ 科普文章 ============
export type ArticleCategory = 'emotion' | 'stress' | 'self' | 'frontier' | 'satir' | 'positive';

export interface Article {
  id: string;
  title: string;
  content: string | null;
  summary: string | null;
  category: ArticleCategory;
  cover_url: string | null;
  read_count: number;
  is_featured: boolean;
  created_at: string;
}

// ============ 心理测试题目结构 ============
export interface TestOption {
  label: string;
  value: number;
}

export interface TestQuestion {
  id: number;
  text: string;
  options: TestOption[];
}

export interface TestDimension {
  name: string;
  score: number;
  max: number;
  color?: string;
}

export interface TestConfig {
  id: TestType;
  title: string;
  description: string;
  duration: string;
  questionCount: number;
  category: string;
  icon: string;
  color: string;
  questions: TestQuestion[];
  getSummary?: (answers: Record<number, number>) => string;
  getDimensions?: (answers: Record<number, number>) => TestDimension[];
}

// ============ 树洞评论 ============
export interface TreeHoleComment {  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface ExpertInfo {
  id: ExpertType;
  name: string;
  school: string;
  description: string;
  style: string;
  color: string;
  emoji: string;
  greeting: string;
  systemPrompt: string;
  homework: string;
  voiceId: string;      // MiniMax TTS 专属音色 ID
  voiceSpeed: number;   // 语速 0.5-2.0
  voicePitch: number;   // 音调 -12~12
}

// ============ 愈心手记 ============

export type NoteBlockType =
  | 'paragraph' | 'h1' | 'h2' | 'h3'
  | 'quote' | 'ul' | 'ol'
  | 'image' | 'attachment';

export type NoteTextAlign = 'left' | 'center' | 'right';

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  content: string;           // 文本内容（图片/附件块为空）
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  align?: NoteTextAlign;
  indent?: number;           // 首行缩进层级 0-3
  listLevel?: number;        // 列表嵌套层级 1-3
  attachmentId?: string;     // 关联附件ID（image/attachment 块）
}

export interface NoteFolder {
  id: string;
  user_id: string;
  parent_id: string | null;  // 嵌套文件夹父ID
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  note_count?: number;       // 前端聚合
  children?: NoteFolder[];   // 前端构建树形结构
}

export interface Note {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  blocks: NoteBlock[];
  plain_text: string;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  attachments?: NoteAttachment[];  // 关联附件（前端 join）
}

export type NoteAttachmentFileType = 'image' | 'pdf' | 'word' | 'audio' | 'other';

export interface NoteAttachment {
  id: string;
  note_id: string;
  user_id: string;
  file_name: string;
  file_type: NoteAttachmentFileType;
  mime_type: string;
  file_size: number;
  storage_path: string;
  public_url: string;
  created_at: string;
}

// ============ 文章（补充 summary 字段） ============
