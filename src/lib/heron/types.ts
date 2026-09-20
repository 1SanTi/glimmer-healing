import type { HeronCard, HeronAttachment, SkillPermission, HeronCardType } from '@/types/types';

export type ModelTier = 'lightweight' | 'balanced' | 'flagship';

export interface ModelOption {
  id: string;
  label: string;
  desc: string;
  tier: ModelTier;
}

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
}

export interface SkillContext {
  userId: string;
  params: Record<string, unknown>;
  attachments: HeronAttachment[];
  /** 调用大模型生成文本（非流式，返回完整文本） */
  llm: (messages: LlmMessage[], model?: string) => Promise<string>;
}

export interface SkillResult {
  summary: string;
  card?: HeronCard;
}

export interface Skill {
  name: string;
  displayName: string;
  description: string;
  fullInstructions: string;
  triggerKeywords: string[];
  permission: SkillPermission;
  returns: HeronCardType;
  tier: ModelTier;
  handler: (ctx: SkillContext) => Promise<SkillResult>;
}