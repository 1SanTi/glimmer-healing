
-- 用户角色枚举
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- 用户档案表
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  username text,
  avatar_url text,
  role public.user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 心情打卡记录表
CREATE TABLE public.mood_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mood text NOT NULL CHECK (mood IN ('happy', 'calm', 'sad')),
  note text,
  checked_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 幸福度日志表
CREATE TABLE public.happiness_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('positive', 'negative')),
  event_desc text NOT NULL,
  score integer NOT NULL CHECK (score >= 1 AND score <= 10),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 匿名树洞帖子表
CREATE TABLE public.tree_hole_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('academic', 'interpersonal', 'workplace', 'emotion', 'general')),
  is_public boolean NOT NULL DEFAULT true,
  is_crisis boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 树洞暖心回应表
CREATE TABLE public.tree_hole_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.tree_hole_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('hug', 'empathy', 'brave')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, reaction_type)
);

-- AI对话会话表
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expert text NOT NULL CHECK (expert IN ('rogers', 'beck', 'perls', 'wolpe', 'freud')),
  title text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  homework text,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 心理测试记录表
CREATE TABLE public.test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_type text NOT NULL CHECK (test_type IN ('scl90', 'mht', 'mbti', 'via', 'stress', 'htp', 'confidence', 'mental_age')),
  result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 积极心理任务表
CREATE TABLE public.positive_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  task_title text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 科普文章表（系统数据）
CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'emotion' CHECK (category IN ('emotion', 'stress', 'self', 'frontier', 'satir', 'positive')),
  cover_url text,
  read_count integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 自动同步新用户到profiles
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 获取用户角色辅助函数（防止RLS递归）
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- 启用RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.happiness_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tree_hole_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tree_hole_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positive_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- profiles 策略
CREATE POLICY "管理员全权访问profiles" ON profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);
CREATE POLICY "用户查看自己的profiles" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "用户更新自己的profiles" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- mood_checkins 策略
CREATE POLICY "用户管理自己的心情记录" ON mood_checkins
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "管理员查看所有心情记录" ON mood_checkins
  FOR SELECT TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- happiness_logs 策略
CREATE POLICY "用户管理自己的幸福日志" ON happiness_logs
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- tree_hole_posts 策略
CREATE POLICY "用户管理自己的树洞帖子" ON tree_hole_posts
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "登录用户查看公开树洞" ON tree_hole_posts
  FOR SELECT TO authenticated USING (is_public = true);
CREATE POLICY "匿名用户查看公开树洞" ON tree_hole_posts
  FOR SELECT TO anon USING (is_public = true);

-- tree_hole_reactions 策略
CREATE POLICY "登录用户管理自己的回应" ON tree_hole_reactions
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "登录用户查看回应" ON tree_hole_reactions
  FOR SELECT TO authenticated USING (true);

-- chat_sessions 策略
CREATE POLICY "用户管理自己的对话" ON chat_sessions
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- test_results 策略
CREATE POLICY "用户管理自己的测试记录" ON test_results
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- positive_tasks 策略
CREATE POLICY "用户管理自己的积极任务" ON positive_tasks
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- articles 策略
CREATE POLICY "所有人查看文章" ON articles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "管理员管理文章" ON articles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- 插入示例科普文章
INSERT INTO public.articles (title, content, category, is_featured) VALUES
('当情绪来了，我们该怎么办？', '情绪是我们内心世界的信使。当愤怒、悲伤或焦虑涌来时，不要急于压制它们...情绪不是敌人，而是需要被听见的信号。学会情绪命名、深呼吸暂停键和身体扫描，是情绪管理的三大基石。', 'emotion', true),
('抑郁症科普：不是"想太多"', '抑郁症是一种真实的疾病，影响着全球超过3亿人。它不是软弱，不是矫情，而是大脑化学物质失衡引发的健康问题。了解抑郁的九大症状、及早识别、主动求助，是每个人都应该具备的心理急救知识。', 'emotion', true),
('翻越压力的高山', '压力是生活的一部分，适度的压力甚至能激发潜能。但当压力超过承受阈值时，我们需要"爬山图"策略：识别压力源、评估资源、制定小步骤行动计划，一步一步跨越那座心中的大山。', 'stress', true),
('学会自我关怀', '自我关怀不是自私，而是持续给予他人的前提。克里斯汀·内夫的三大自我关怀支柱：正念觉察、共同人性感、自我善待。每天5分钟的自我关怀冥想，能显著降低焦虑和抑郁水平。', 'stress', false),
('在MBTI中预见自己', 'MBTI将人格分为16种类型，但它更大的价值不在于"贴标签"，而在于帮助我们理解自己的信息处理方式、决策偏好和人际风格。了解你的类型，为人际沟通和职业选择打开新视角。', 'self', true),
('面孔加工中的眼睛区域奥秘', '最新研究发现，人类在识别面孔时，眼睛区域承载了超过70%的情绪信息。这一发现不仅解释了"眼睛会说话"的古老智慧，更为自闭症干预和人机交互设计提供了全新思路。', 'frontier', false),
('集体记忆如何在线上聊天中形成', '当我们共同经历一件事时，集体讨论会重构每个人的个体记忆。心理学研究显示，在线群聊的"协同遗忘"效应比面对面交流更强——群体讨论的内容被记住，未讨论的内容被遗忘。', 'frontier', false),
('萨提亚沟通姿态：你属于哪一种？', '美国心理学家萨提亚发现，人在压力下会采用四种不良沟通姿态：讨好、指责、超理智和打岔。这四种姿态都是为了保护自尊，却往往适得其反。学习"一致型沟通"，才能真正连接彼此。', 'satir', true),
('如何构建乐观解释风格', '塞利格曼的积极心理学研究表明，乐观不是天生的，而是可以学习的"解释风格"。当坏事发生时，乐观者倾向于将其解释为暂时的、局部的、外部的；悲观者则相反。改变解释风格，从一句话开始。', 'positive', true),
('逆境中的韧性培育', '心理韧性（Resilience）是从困境中反弹的能力。APA研究指出，韧性不是少数人的天赋，而是人人可以培养的技能。建立连接、接受变化、设定目标、积极自我认知——四大支柱共同构建你的心理韧性。', 'positive', false);
