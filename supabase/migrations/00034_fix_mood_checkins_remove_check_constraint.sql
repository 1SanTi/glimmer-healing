-- 删除只允许 happy/calm/sad 的旧约束，允许任意 mood 文本（多选逗号拼接）
ALTER TABLE public.mood_checkins DROP CONSTRAINT IF EXISTS mood_checkins_mood_check;

-- 确保 upsert 用到的唯一索引存在（user_id + checked_at）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'mood_checkins'
      AND indexname = 'mood_checkins_user_date_unique'
  ) THEN
    CREATE UNIQUE INDEX mood_checkins_user_date_unique
      ON public.mood_checkins(user_id, checked_at);
  END IF;
END $$;