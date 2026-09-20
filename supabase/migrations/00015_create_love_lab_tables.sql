
-- 亲密关系社会网络图：节点表
CREATE TABLE relationship_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '朋友',         -- 角色（伴侣/家人/朋友/同事等）
  tags text[] DEFAULT '{}',                  -- 属性标签（安全港湾/压力来源等）
  quality text NOT NULL DEFAULT 'positive',  -- 关系质量：positive/neutral/draining
  trust_score int DEFAULT 5 CHECK (trust_score BETWEEN 1 AND 10),
  comfort_score int DEFAULT 5 CHECK (comfort_score BETWEEN 1 AND 10),
  distance real DEFAULT 150,                 -- 视觉中心距离（px单位，用于布局）
  angle real DEFAULT 0,                      -- 方位角（度）
  note text DEFAULT '',
  avatar_emoji text DEFAULT '😊',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 亲密关系日历：事件记录表
CREATE TABLE relationship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  title text NOT NULL,
  content text DEFAULT '',
  mood text DEFAULT 'happy',                 -- happy/calm/sad/anxious/angry/loved
  mood_score int DEFAULT 5 CHECK (mood_score BETWEEN 1 AND 10),
  is_anniversary boolean DEFAULT false,      -- 是否纪念日
  anniversary_label text DEFAULT '',         -- 纪念日标签（相识/初恋/结婚等）
  node_ids uuid[] DEFAULT '{}',             -- 关联的关系人
  sticker text DEFAULT '',
  image_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 关系定位地图：位置记录表
CREATE TABLE relationship_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id uuid REFERENCES relationship_nodes(id) ON DELETE CASCADE,
  label text NOT NULL,
  address text NOT NULL,
  latitude real,
  longitude real,
  psychological_distance int DEFAULT 5 CHECK (psychological_distance BETWEEN 1 AND 10),
  ai_advice text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER relationship_nodes_updated_at
  BEFORE UPDATE ON relationship_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER relationship_locations_updated_at
  BEFORE UPDATE ON relationship_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE relationship_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_locations ENABLE ROW LEVEL SECURITY;

-- relationship_nodes policies
CREATE POLICY "nodes_select_own" ON relationship_nodes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nodes_insert_own" ON relationship_nodes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nodes_update_own" ON relationship_nodes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nodes_delete_own" ON relationship_nodes FOR DELETE USING (auth.uid() = user_id);

-- relationship_events policies
CREATE POLICY "events_select_own" ON relationship_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "events_insert_own" ON relationship_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "events_update_own" ON relationship_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "events_delete_own" ON relationship_events FOR DELETE USING (auth.uid() = user_id);

-- relationship_locations policies
CREATE POLICY "locations_select_own" ON relationship_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "locations_insert_own" ON relationship_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "locations_update_own" ON relationship_locations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "locations_delete_own" ON relationship_locations FOR DELETE USING (auth.uid() = user_id);
