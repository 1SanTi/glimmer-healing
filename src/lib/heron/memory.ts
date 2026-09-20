import { getHeronMemories, addHeronMemory } from '@/db/api';

/** 加载长期记忆，拼成提示词片段（按分类分组） */
export async function loadMemory(userId: string): Promise<string> {
  const list = await getHeronMemories(userId);
  if (!list.length) return '';
  const prefs    = list.filter(m => m.category === 'preference');
  const tasks    = list.filter(m => m.category === 'task');
  const summaries = list.filter(m => m.category === 'summary');
  const parts: string[] = [];
  if (prefs.length)     parts.push(`## 用户偏好\n${prefs.map(m => `- ${m.content}`).join('\n')}`);
  if (tasks.length)     parts.push(`## 重要事项\n${tasks.map(m => `- [${m.checked ? 'x' : ' '}] ${m.content}`).join('\n')}`);
  if (summaries.length) parts.push(`## 历史摘要\n${summaries.map(m => `- ${m.content}`).join('\n')}`);
  return parts.join('\n\n');
}

/** 保存一条长期记忆（Agent 自动调用时默认归为偏好类） */
export async function saveMemory(
  userId: string,
  content: string,
  category: 'preference' | 'task' | 'summary' = 'preference',
): Promise<void> {
  const text = content.trim();
  if (!text) return;
  await addHeronMemory(userId, text, category);
}