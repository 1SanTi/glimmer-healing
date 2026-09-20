
-- 画布项目表（心绘小屋画布模式）
CREATE TABLE IF NOT EXISTS public.canvas_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '未命名项目',
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 画布节点表（每个项目下的节点）
CREATE TABLE IF NOT EXISTS public.canvas_nodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.canvas_projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pos_x       float NOT NULL DEFAULT 0,
  pos_y       float NOT NULL DEFAULT 0,
  prompt      text,
  aspect      text NOT NULL DEFAULT '1:1',
  scene       text NOT NULL DEFAULT 'story',
  style       text NOT NULL DEFAULT 'healing',
  status      text NOT NULL DEFAULT 'idle',
  image_url   text,
  error_msg   text,
  work_id     uuid,
  parent_id   uuid REFERENCES public.canvas_nodes(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.canvas_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_nodes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_projects" ON public.canvas_projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_all_nodes" ON public.canvas_nodes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_canvas_projects_updated_at ON public.canvas_projects;
CREATE TRIGGER set_canvas_projects_updated_at
  BEFORE UPDATE ON public.canvas_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_canvas_nodes_updated_at ON public.canvas_nodes;
CREATE TRIGGER set_canvas_nodes_updated_at
  BEFORE UPDATE ON public.canvas_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
