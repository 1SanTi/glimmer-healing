
-- 梦境记录表
CREATE TABLE IF NOT EXISTS dream_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '未命名梦境',
  content     TEXT NOT NULL DEFAULT '',
  ai_analysis TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dream_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dream_records_owner" ON dream_records
  FOR ALL USING (auth.uid() = user_id);

-- 睡眠配置表（每用户一条记录）
CREATE TABLE IF NOT EXISTS sleep_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  bed_time       TEXT NOT NULL DEFAULT '22:30',
  wake_time      TEXT NOT NULL DEFAULT '07:00',
  notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sleep_audio_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sleep_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sleep_config_owner" ON sleep_config
  FOR ALL USING (auth.uid() = user_id);
