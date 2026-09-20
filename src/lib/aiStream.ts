/**
 * aiStream.ts — AI 流式响应工具
 *
 * ai-workbench-chat 返回 text/event-stream (SSE)，需逐行解析 delta。
 * 用 fetch + TextDecoder 读流，累积完整文本后返回。
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamAiChatOptions {
  model?: string;
  messages: ChatMessage[];
  /** 收到每个正式 token 时回调（可选，用于流式显示）*/
  onToken?: (token: string) => void;
  /** 推理模型思考阶段回调（reasoning_content，可选）*/
  onThinking?: (chunk: string) => void;
  /** 中断信号，调用 abort() 后立即停止流读取 */
  signal?: AbortSignal;
}

/**
 * 调用 ai-workbench-chat Edge Function，解析 SSE 流，返回完整文本。
 * 支持 DeepSeek V4 Pro 的 reasoning_content 推理阶段回调。
 */
export async function streamAiChat(opts: StreamAiChatOptions): Promise<string> {
  const { model = 'deepseek-v4-flash', messages, onToken, onThinking, signal } = opts;

  const url = `${SUPABASE_URL}/functions/v1/ai-workbench-chat`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ model, messages }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI 服务错误 (${resp.status}): ${errText}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('无响应流');

  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  // 解析 SSE 行
  const parseLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload);
      const delta = json?.choices?.[0]?.delta ?? {};
      const content: string = delta.content ?? '';
      const reasoning: string = delta.reasoning_content ?? '';
      if (content) {
        fullText += content;
        onToken?.(content);
      } else if (reasoning) {
        onThinking?.(reasoning);
      }
    } catch {
      // 忽略无效 JSON 行
    }
  };

  while (true) {
    if (signal?.aborted) { reader.cancel(); break; }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // 按换行拆分处理
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      parseLine(line.trim());
    }
  }
  // 处理最后剩余缓冲
  if (buffer.trim()) parseLine(buffer.trim());

  return fullText;
}
