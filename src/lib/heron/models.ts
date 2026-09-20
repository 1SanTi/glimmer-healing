import type { ModelTier, ModelOption } from './types';
import type { HeronAttachment } from '@/types/types';

export const MODELS: ModelOption[] = [
  { id: 'auto',             label: '✨ 自动',          desc: '智能路由·自动选最佳模型',  tier: 'balanced' },
  { id: 'deepseek-v4-flash',label: 'DeepSeek V4 Flash', desc: '轻量·快速响应',            tier: 'lightweight' },
  { id: 'deepseek-v4-pro',  label: 'DeepSeek V4 Pro',  desc: '复杂任务·深度推理',         tier: 'flagship' },
  { id: 'glm-4-flash',      label: '智谱 GLM-5.3',     desc: '均衡·默认推荐',             tier: 'balanced' },
  { id: 'hunyuan-t1',       label: '混元 3',            desc: '轻量·中文理解强',           tier: 'lightweight' },
  { id: 'kimi-k3',          label: 'Kimi K3',           desc: '旗舰·最强多模态',           tier: 'flagship' },
];

export const MODEL_ROUTES: Record<ModelTier, { primary: string; fallbacks: string[] }> = {
  lightweight: { primary: 'deepseek-v4-flash', fallbacks: ['hunyuan-t1', 'glm-4-flash'] },
  balanced: { primary: 'glm-4-flash', fallbacks: ['deepseek-v4-pro', 'kimi-k3'] },
  flagship: { primary: 'kimi-k3', fallbacks: ['deepseek-v4-pro', 'glm-4-flash'] },
};

const FLAGSHIP_SKILLS = ['ai-dev-workbench', 'course-knowledge', 'skill-creator'];
const BALANCED_SKILLS = ['note-writer', 'file-reader', 'happiness-tracker', 'web-search'];

const FLAGSHIP_KW = ['做网页', '生成应用', '开发', '编程', '工程报告', '深度分析', '多步', '复杂', '系统设计'];
const BALANCED_KW = ['总结', '解读', '写笔记', '分析', '整理', '报告', '搜索', '查一下', '查询'];

export function evaluateDifficulty(text: string, skill: string | null, attachments: HeronAttachment[]): ModelTier {
  let score = 0;
  if (text.length > 200) score += 3;
  else if (text.length > 50) score += 1;
  if (skill) {
    if (FLAGSHIP_SKILLS.includes(skill)) score += 4;
    else if (BALANCED_SKILLS.includes(skill)) score += 2;
  }
  if (FLAGSHIP_KW.some(k => text.includes(k))) score += 3;
  else if (BALANCED_KW.some(k => text.includes(k))) score += 1;
  if (attachments.length) {
    const kinds = attachments.map(a => a.kind);
    if (kinds.includes('file') || attachments.length > 1) score += 2;
    else score += 1;
  }
  if (score >= 5) return 'flagship';
  if (score >= 2) return 'balanced';
  return 'lightweight';
}

export function routeModel(tier: ModelTier): string {
  return MODEL_ROUTES[tier].primary;
}