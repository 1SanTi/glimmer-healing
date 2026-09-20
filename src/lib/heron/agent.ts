import { streamAiChat } from '@/lib/aiStream';
import { detectCrisis } from '@/lib/utils';
import type { HeronMessage, HeronAttachment, PetState, HeronTask, HeronStep } from '@/types/types';
import { evaluateDifficulty, routeModel, MODEL_ROUTES } from './models';
import { findSkill, getAllSkills } from './skills';
import { loadMemory, saveMemory } from './memory';
import type { LlmMessage } from './types';

export interface AgentInput {
  text: string;
  attachments: HeronAttachment[];
  model?: string;
  skill?: string;
  /** 近期对话历史（最新在后），用于规划阶段理解上下文意图 */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AgentEvent {
  type: 'state' | 'assistant-token' | 'assistant-message' | 'error' | 'step-log';
  state?: PetState;
  token?: string;
  message?: HeronMessage;
  error?: string;
  steps?: HeronStep[]; // ReAct 推理链（完整列表），用于实时可视化
}

const MEMORY_TAG = 'MEMORY:';

function nowIso(): string {
  return new Date().toISOString();
}

export class HeronAgent {
  private abortController: AbortController | null = null;
  private cancelled = false;
  private stepLog: HeronStep[] = [];   // ReAct 推理链日志
  private taskList: HeronTask[] = []; // 多步任务清单

  constructor(
    private opts: {
      userId: string;
      onEvent: (e: AgentEvent) => void;
      onCrisis: (text: string) => void;
    },
  ) {}

  /** 中断当前正在运行的 run()，立即停止流式输出 */
  stop(): void {
    this.cancelled = true;
    this.abortController?.abort();
  }

  private emit(e: AgentEvent): void {
    if (this.cancelled) return;
    this.opts.onEvent(e);
  }

  /** 发送一个思考步骤（含详情），同时推入内部记录并广播完整列表 */
  private emitStep(partial: Partial<HeronStep> & { label: string }): void {
    const step: HeronStep = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: partial.label,
      detail: partial.detail,
      tool: partial.tool,
      params: partial.params,
      result: partial.result,
      durationMs: partial.durationMs,
      status: partial.status ?? 'running',
    };
    this.stepLog.push(step);
    this.emit({ type: 'step-log', steps: [...this.stepLog] });
  }

  /** 更新最后一个步骤的详情，并广播完整列表 */
  private updateLastStep(patch: Partial<HeronStep>): void {
    const last = this.stepLog[this.stepLog.length - 1];
    if (!last) return;
    Object.assign(last, patch);
    this.emit({ type: 'step-log', steps: [...this.stepLog] });
  }

  /** 格式化技能调用参数，供思考过程展示 */
  private formatParams(params: Record<string, unknown>): string {
    // 每个参数独占一行；值内部的换行压成空格，避免与行分隔符混淆导致误以为截断
    const entries = Object.entries(params)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => {
        const raw = typeof v === 'string' ? v : JSON.stringify(v);
        const display = raw.replace(/\r?\n/g, ' ').trim();
        return `${k}: ${display}`;
      });
    return entries.length ? entries.join('\n') : '无';
  }

  /** 非流式调用大模型（支持多模态），带主备容灾 */
  private async callLlm(messages: LlmMessage[], model?: string): Promise<string> {
    const order = model ? [model] : [MODEL_ROUTES.balanced.primary, ...MODEL_ROUTES.balanced.fallbacks];
    let lastErr: unknown = null;
    for (const m of order) {
      try {
        return await streamAiChat({ model: m, messages: messages as never, signal: this.abortController?.signal });
      } catch (err) {
        if (this.cancelled) throw err;
        lastErr = err;
      }
    }
    throw lastErr ?? new Error('模型调用失败');
  }

  /**
   * 任务规划：一次 LLM 调用完成「分解 + 意图识别 + 参数提取」
   * 返回 {label, skillName, params}[] 执行计划
   */
  private async buildActionPlan(
    text: string,
    forcedSkill: string | null,
    attachments: HeronAttachment[],
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<Array<{ label: string; skillName: string | null; params: Record<string, unknown> }>> {
    const defaultParams: Record<string, unknown> = {
      query: text, content: text, description: text, prompt: text,
      title: text.slice(0, 30), mood_label: '平静', mood_score: 6,
      action: 'write', score: 60,
    };

    // 手动指定技能时跳过规划，直接提参
    if (forcedSkill) {
      const params = await this.extractParamsForSkill(forcedSkill, text, attachments);
      return [{ label: text.slice(0, 12), skillName: forcedSkill, params }];
    }

    const skills = getAllSkills();
    const list = skills
      .map(s => `- ${s.name}：${s.description}（触发词：${s.triggerKeywords.slice(0, 3).join('/')}）`)
      .join('\n');
    const attInfo = attachments.length ? `\n附件：${attachments.map(a => a.name).join(', ')}` : '';

    // 将近期对话历史格式化为上下文段落，帮助 LLM 理解指代和追问意图
    const historyCtx = history.length
      ? `\n近期对话上下文（按时间顺序，最新在最后）：\n${history
          .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content.replace(/\n/g, ' ')}`)
          .join('\n')}\n`
      : '';

    try {
      const raw = await this.callLlm([{
        role: 'user',
        content: `分析用户请求，结合对话上下文理解用户真实意图，制定执行计划。拆分为 1-4 个子任务，每个子任务选择对应技能和关键参数。
${historyCtx}
可用技能：
${list}
- null：闲聊/情感支持/倾听

用户最新请求：${text}${attInfo}

返回 JSON 数组，格式（只返回 JSON，不要其他文字）：
[{"label":"简短标题(≤8字)","skill":"技能name或null","params":{"query":"...","content":"..."}}]

规则：
- 若用户最新请求是对上文的追问或简短指令（如"给我一份"、"继续"、"详细说"），必须结合上下文补全意图
- 简单闲聊/情感支持 → 1 个元素，skill=null
- 单一工具任务 → 1 个元素
- 复合多步请求 → 多个元素，每步对应不同操作
- params 只写该步骤真正需要的参数`,
      }], MODEL_ROUTES.lightweight.primary);

      const match = raw.replace(/```json|```/gi, '').trim().match(/\[[\s\S]*\]/);
      if (!match) return await this.singleStepFallback(text, attachments, defaultParams);

      const parsed = JSON.parse(match[0]) as Array<{ label?: string; skill?: string; params?: Record<string, unknown> }>;
      if (!Array.isArray(parsed) || parsed.length === 0)
        return await this.singleStepFallback(text, attachments, defaultParams);

      return parsed.slice(0, 4).map(item => ({
        label: typeof item.label === 'string' ? item.label : text.slice(0, 10),
        skillName: typeof item.skill === 'string' && item.skill !== 'null' ? item.skill : null,
        params: (item.params && typeof item.params === 'object')
          ? { ...defaultParams, ...item.params }
          : defaultParams,
      }));
    } catch {
      return await this.singleStepFallback(text, attachments, defaultParams);
    }
  }

  /** buildActionPlan 降级：直接走旧意图识别 */
  private async singleStepFallback(
    text: string,
    attachments: HeronAttachment[],
    defaultParams: Record<string, unknown>,
  ): Promise<Array<{ label: string; skillName: string | null; params: Record<string, unknown> }>> {
    const intent = await this.recognizeIntent(text, attachments);
    return [{
      label: text.slice(0, 12),
      skillName: intent?.skill ?? null,
      params: intent ? { ...defaultParams, ...intent.params } : defaultParams,
    }];
  }

  /** ② 验收校验：工具执行结果是否满足该子任务要求（返回 true = 通过） */
  private async verifySubtask(taskLabel: string, skillSummary: string): Promise<boolean> {
    if (!skillSummary || skillSummary.length < 5) return false;

    // 快速失败信号：含明确错误标记 → 直接不通过，不调用 LLM
    const FAILURE_SIGNALS = [
      '❌', '失败', '无法', '不可用', '出错', '错误',
      '请重试', '未找到', '暂时不可用', '请提供', '请上传', '请联系管理员',
    ];
    if (FAILURE_SIGNALS.some(s => skillSummary.includes(s))) return false;

    // 快速成功信号：含 URL / 文件路径 / 成功关键词 → 直接通过，不调用 LLM
    // 注意：用 'https://' 而非 'http' 避免匹配含 http 的错误提示文本
    const SUCCESS_SIGNALS = [
      'https://', '.html', '.png', '.jpg', '.webp', '.mp3',
      '已生成', '已创建', '已保存', '已写入', '已记录', '已完成',
      'storage', 'bucket', '手记', '笔记', '树洞',
    ];
    if (SUCCESS_SIGNALS.some(s => skillSummary.includes(s))) return true;

    // 摘要明显很短 → 认为失败
    if (skillSummary.length < 15) return false;

    // 兜底：用轻量 LLM 判断（仅用于无明显成功信号的场景）
    try {
      const raw = await this.callLlm([{
        role: 'user',
        content: `判断以下执行结果是否满足了子任务要求。
子任务：${taskLabel}
执行结果：${skillSummary.slice(0, 200)}
只回答 yes 或 no，不要其他文字。`,
      }], MODEL_ROUTES.lightweight.primary);
      return raw.trim().toLowerCase().startsWith('y');
    } catch {
      return true; // 无法判断时乐观通过
    }
  }

  async run(input: AgentInput): Promise<void> {
    this.cancelled = false;
    this.abortController = new AbortController();
    this.stepLog = [];
    this.taskList = [];
    const signal = this.abortController.signal;
    const { text, attachments } = input;

    // ── 1) 危机安全网 ──────────────────────────────────────────────
    if (detectCrisis(text)) {
      this.emit({ type: 'state', state: 'idle' });
      this.opts.onCrisis(text);
      this.emit({
        type: 'assistant-message',
        message: {
          id: `m_${Date.now()}`,
          role: 'assistant',
          content: '我感受到你现在很不容易。你的安全对我来说是最重要的——苍鹭已经为你打开了紧急求助通道，请先看看上面的支持资源，好吗？我会一直在这里陪着你。',
          timestamp: nowIso(),
          state: 'idle',
        },
      });
      return;
    }

    // ── 2) 模型路由 ────────────────────────────────────────────────
    const tier = evaluateDifficulty(text, input.skill ?? null, attachments);
    const model = input.model ?? routeModel(tier);

    // ── 3) THINK：理解需求 + 规划 ──────────────────────────────────
    this.emit({ type: 'state', state: 'thinking' });
    this.emitStep({ label: '理解需求', detail: '分析用户请求，识别意图并规划执行方案', status: 'running' });

    const plan = await this.buildActionPlan(text, input.skill ?? null, attachments, input.history ?? []);

    if (plan.length >= 2) {
      this.taskList = plan.map(p => ({ label: p.label, status: 'pending' as const }));
      this.updateLastStep({
        detail: `识别为多步任务，拆分为 ${plan.length} 步：${plan.map(p => p.label).join(' → ')}`,
        status: 'done',
      });
      this.emitStep({ label: '任务分解', detail: `已拆分 ${plan.length} 个子任务，将依次执行`, status: 'done' });
    } else {
      this.updateLastStep({
        detail: plan[0]?.skillName ? '识别为单一任务，将调用对应技能完成' : '识别为闲聊/情感支持，将直接温柔回复',
        status: 'done',
      });
    }

    // ── 4) ReAct 循环：每步「思考 → 行动 → 观察」 ─────────────────
    type StepResult = { label: string; summary: string; card?: HeronMessage['card'] };
    const allResults: StepResult[] = [];

    for (let i = 0; i < plan.length; i++) {
      if (this.cancelled) break;
      const action = plan[i];
      const skill = action.skillName ? findSkill(action.skillName) : null;

      // 标记任务运行中
      if (this.taskList.length > 0) this.taskList[i].status = 'running';

      // 无工具的步骤（闲聊/安慰）直接跳过
      if (!skill) {
        if (this.taskList.length > 0) this.taskList[i].status = 'done';
        continue;
      }

      // THINK before act：基于前序结果思考本步
      if (plan.length >= 2) {
        const ctx = allResults.length > 0
          ? `，已完成「${allResults[allResults.length - 1].label}」`
          : '';
        this.emitStep({ label: `思考第 ${i + 1} 步`, detail: `规划第 ${i + 1}/${plan.length} 步「${action.label}」${ctx}`, status: 'done' });
      }

      // ACT：调用工具
      this.emit({ type: 'state', state: skill.permission === 'ask' ? 'tool-using' : 'working' });
      this.emitStep({
        label: '工具调用',
        detail: `调用「${skill.displayName}」处理「${action.label}」`,
        tool: skill.displayName,
        params: this.formatParams(action.params),
        status: 'running',
      });
      const toolStart = Date.now();

      try {
        const prevCtx = allResults.length > 0
          ? { _prevSummary: allResults[allResults.length - 1].summary }
          : {};
        const res = await skill.handler({
          userId: this.opts.userId,
          params: { ...action.params, ...prevCtx },
          attachments,
          llm: (messages, m) => this.callLlm(messages, m),
        });

        this.updateLastStep({ result: res.summary, durationMs: Date.now() - toolStart, status: 'done' });
        allResults.push({ label: action.label, summary: res.summary, card: res.card });

        // OBSERVE + THINK：多步时验收本步结果
        if (plan.length >= 2) {
          this.emit({ type: 'state', state: 'thinking' });
          const passed = await this.verifySubtask(action.label, res.summary);
          if (passed) {
            if (this.taskList.length > 0) this.taskList[i].status = 'done';
            if (i < plan.length - 1) this.emitStep({ label: '结果确认', detail: `「${action.label}」结果通过验收，继续下一步`, status: 'done' });
          } else {
            // 补缺：重试一次
            this.emitStep({ label: '补缺重试', detail: `「${action.label}」结果未满足要求，重试一次`, status: 'running' });
            const retryStart = Date.now();
            try {
              const retry = await skill.handler({
                userId: this.opts.userId,
                params: { ...action.params, ...prevCtx, _retry: true },
                attachments,
                llm: (messages, m) => this.callLlm(messages, m),
              });
              allResults[allResults.length - 1] = { label: action.label, summary: retry.summary, card: retry.card };
              if (this.taskList.length > 0) this.taskList[i].status = 'done';
              this.updateLastStep({ result: retry.summary, durationMs: Date.now() - retryStart, status: 'done' });
            } catch {
              if (this.taskList.length > 0) this.taskList[i].status = 'failed';
              this.updateLastStep({ status: 'failed', detail: '重试后仍未成功' });
            }
          }
        } else {
          if (this.taskList.length > 0) this.taskList[i].status = 'done';
        }
      } catch (err) {
        if (this.taskList.length > 0) this.taskList[i].status = 'failed';
        this.updateLastStep({ status: 'failed', detail: '执行过程中出现异常', result: '执行异常' });
        allResults.push({ label: action.label, summary: '该步骤执行遇到了问题' });
        void err;
      }
    }

    // ── 5) 验收检查阶段 ────────────────────────────────────────────
    if (plan.length >= 2) {
      this.emit({ type: 'state', state: 'thinking' });
      this.emitStep({ label: '验收检查', detail: '逐一确认所有步骤的结果是否满足要求', status: 'done' });
    }

    // ── 6) 组织回复（流式）────────────────────────────────────────
    this.emit({ type: 'state', state: 'thinking' });
    this.emitStep({ label: '回复生成', detail: '根据执行结果组织温和、简洁的回复', status: 'running' });

    // 合并多步结果
    const lastCard = allResults.filter(r => r.card).pop()?.card;
    const combinedSummary = allResults.length > 0
      ? allResults.map(r => `【${r.label}】${r.summary}`).join('\n\n')
      : undefined;
    const skillResult: { summary: string; card?: HeronMessage['card'] } | null =
      (lastCard || combinedSummary) ? { summary: combinedSummary ?? '', card: lastCard } : null;

    const memory = await loadMemory(this.opts.userId);
    const systemPrompt = this.buildSystemPrompt(skillResult?.summary, memory, this.taskList);
    const history: LlmMessage[] = [{ role: 'system', content: systemPrompt }];

    if (attachments.length) {
      const img = attachments.find(a => a.kind === 'image');
      if (img?.uri) {
        history.push({ role: 'user', content: [
          { type: 'text', text: text || '（用户上传了图片）' },
          { type: 'image_url', image_url: { url: img.uri } },
        ] });
      } else {
        history.push({ role: 'user', content: `${text}\n\n[附件] ${attachments.map(a => `${a.name}: ${a.content || ''}`).join('; ')}` });
      }
    } else {
      history.push({ role: 'user', content: text });
    }

    let full = '';
    try {
      full = await streamAiChat({
        model,
        messages: history as never,
        onToken: (token) => this.emit({ type: 'assistant-token', token }),
        signal,
      });
    } catch (err) {
      const isAbort = this.cancelled || (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted')));
      if (isAbort) return;
      try {
        full = await streamAiChat({
          model: MODEL_ROUTES.balanced.primary,
          messages: history as never,
          onToken: (token) => this.emit({ type: 'assistant-token', token }),
          signal,
        });
      } catch (err2) {
        if (this.cancelled) return;
        throw err2;
      }
    }

    // ── 7) 提取长期记忆 ────────────────────────────────────────────
    let memoryFact = '';
    if (full.includes(MEMORY_TAG)) {
      const idx = full.indexOf(MEMORY_TAG);
      memoryFact = full.slice(idx + MEMORY_TAG.length).trim().split('\n')[0];
      full = full.slice(0, idx).trim();
    }
    if (memoryFact) await saveMemory(this.opts.userId, memoryFact);

    this.updateLastStep({ status: 'done' });
    this.emit({ type: 'state', state: 'idle' });
    this.emit({
      type: 'assistant-message',
      message: {
        id: `m_${Date.now()}`,
        role: 'assistant',
        content: full || combinedSummary || '我在这里陪你～',
        timestamp: nowIso(),
        card: lastCard,
        state: 'idle',
        steps: this.stepLog.length ? [...this.stepLog] : undefined,
        tasks: this.taskList.length >= 2 ? [...this.taskList] : undefined,
      },
    });
  }

  /** 手动指定技能时，从用户消息中提取该技能所需参数 */
  private async extractParamsForSkill(skillName: string, text: string, attachments: HeronAttachment[]): Promise<Record<string, unknown>> {
    const skill = findSkill(skillName);
    if (!skill) return { content: text, query: text, description: text, prompt: text };
    // 先用通用兜底，再尝试 LLM 提取
    const fallback: Record<string, unknown> = {
      content: text, query: text, description: text, prompt: text,
      title: text.slice(0, 30), mood_label: '平静', mood_score: 6, action: 'write', score: 60,
    };
    try {
      const raw = await this.callLlm(
        [{
          role: 'user',
          content: `根据用户消息，为技能「${skill.displayName}」提取参数。
技能说明：${skill.fullInstructions}
用户消息：${text}${attachments.length ? `\n附件：${attachments.map(a => a.name).join(', ')}` : ''}

只返回一个纯 JSON 对象，不要代码块，不要解释。`,
        }],
        MODEL_ROUTES.lightweight.primary,
      );
      const match = raw.replace(/```json|```/gi, '').trim().match(/\{[\s\S]*\}/);
      if (!match) return fallback;
      const parsed = JSON.parse(match[0]);
      return typeof parsed === 'object' && parsed !== null ? { ...fallback, ...parsed } : fallback;
    } catch {
      return fallback;
    }
  }

  private async recognizeIntent(text: string, attachments: HeronAttachment[]): Promise<{ skill: string; params: Record<string, unknown> } | null> {
    const skills = getAllSkills();
    const list = skills.map(s => `- ${s.name}：${s.description}（触发词：${s.triggerKeywords.slice(0, 4).join('/')}）`).join('\n');
    const prompt = `你是苍鹭医生的意图识别器。根据用户消息判断需要调用哪个技能，并提取参数。
可用技能：
${list}

规则：
- 只返回一个 JSON 对象，不要任何多余文字或代码块。
- 格式：{"skill":"技能name或null","params":{...}}
- 如果是闲聊、安慰、倾听，skill 返回 null。
- 如果用户上传了图片/文件，优先考虑 file-reader。

用户消息：${text}${attachments.length ? `\n附件：${attachments.map(a => a.name).join(', ')}` : ''}`;
    try {
      const raw = await this.callLlm([{ role: 'user', content: prompt }], MODEL_ROUTES.lightweight.primary);
      const jsonStr = raw.replace(/```json|```/gi, '').trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      const skill = typeof parsed.skill === 'string' && parsed.skill !== 'null' ? parsed.skill : null;
      if (!skill) return null;
      return { skill, params: (parsed.params && typeof parsed.params === 'object') ? parsed.params : {} };
    } catch {
      return null;
    }
  }

  private buildSystemPrompt(skillSummary: string | undefined, memory: string, tasks: HeronTask[] = []): string {
    const memBlock = memory ? `\n\n【关于用户的长期记忆】\n${memory}` : '';
    const skillBlock = skillSummary ? `\n\n【本次技能已执行】\n${skillSummary}` : '';
    // ③ 结果验收提示词：多步任务时注入验收清单 + 完整性检查指令
    const tasksBlock = tasks.length >= 2
      ? `\n\n【本次多步任务清单】\n${tasks.map((t, i) =>
          `${i + 1}. [${t.status === 'done' ? '✅' : t.status === 'failed' ? '❌' : '⏳'}] ${t.label}`
        ).join('\n')}
\n验收要求：在回复中，简短确认哪些子任务已完成、哪些未完成（如有）。若有未完成的部分，说明原因并给出补充建议。不要堆砌技术细节，用温和口吻告知即可。`
      : '';
    const verifyBlock = `\n\n【执行完整性要求】
- 执行完所有步骤后，请确认是否完全满足了用户的所有要求。
- 如果用户请求了多件事，每件事都要有所回应，不能只回复其中一件。
- 如果某项无法完成，明确告知并给出替代方案，不要默默跳过。`;
    return `你是「苍鹭医生」，一只温柔、专业、值得信赖的治愈系鸟医生，生活在微光心愈 App 里。
你的形象：蓝羽、圆框眼镜、蓝西装配徽章、白衬衫、黄马甲，说话温和、耐心、像一位懂你的老朋友。
沟通原则：
- 用温暖、平实、第二人称的语气，避免说教和空泛的鸡汤。
- 回答简洁，一般 2-4 句话，必要时分点。
- 优先倾听与共情，再给温柔的建议。
- 如果本次已经执行了技能，请自然地告知结果，不要重复技能的原始输出。
- 如果技能执行结果包含「❌」，表示该步骤执行失败，必须如实告知用户失败原因，绝不能假装成功或忽略错误。
- 如果技能生成了网页/HTML 代码，绝对不要在回复中输出任何 HTML 代码或代码块，代码已自动存入预览卡片，只需用一句话告知用户点击卡片即可预览。
- 如果用户透露了值得长期记住的偏好、习惯或重要事实，请在回复最后单独一行以「MEMORY:」开头写下这条记忆（只写一条，简洁）。${skillBlock}${tasksBlock}${verifyBlock}${memBlock}`;
  }
}