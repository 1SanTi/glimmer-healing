-- 1. note_folders 补全缺失列
ALTER TABLE note_folders
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#F9C784',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_note_folders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_note_folders_updated_at ON note_folders;
CREATE TRIGGER trg_note_folders_updated_at
  BEFORE UPDATE ON note_folders
  FOR EACH ROW EXECUTE FUNCTION update_note_folders_updated_at();

-- 2. notes 表：将 content 列重命名为 blocks，补全 is_draft 列
ALTER TABLE notes RENAME COLUMN content TO blocks;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;