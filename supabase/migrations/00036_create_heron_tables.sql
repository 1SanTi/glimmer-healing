-- 苍鹭医生 会话历史
CREATE TABLE public.heron_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '新对话',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.heron_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heron_sessions_owner" ON public.heron_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 苍鹭医生 长期记忆
CREATE TABLE public.heron_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.heron_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heron_memories_owner" ON public.heron_memories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 苍鹭医生 审计日志
CREATE TABLE public.heron_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.heron_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heron_audit_logs_owner" ON public.heron_audit_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 苍鹭医生 定时任务
CREATE TABLE public.heron_scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cron text NOT NULL,
  skill text NOT NULL,
  prompt text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.heron_scheduled_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heron_scheduled_tasks_owner" ON public.heron_scheduled_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_heron_sessions_user ON public.heron_sessions(user_id, updated_at DESC);
CREATE INDEX idx_heron_memories_user ON public.heron_memories(user_id, created_at DESC);
CREATE INDEX idx_heron_audit_logs_user ON public.heron_audit_logs(user_id, created_at DESC);
CREATE INDEX idx_heron_scheduled_tasks_user ON public.heron_scheduled_tasks(user_id, next_run_at);