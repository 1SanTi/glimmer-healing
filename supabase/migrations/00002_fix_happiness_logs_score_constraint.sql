-- 修复 score 约束：允许负分（难事扣分）
ALTER TABLE public.happiness_logs
  DROP CONSTRAINT IF EXISTS happiness_logs_score_check;

ALTER TABLE public.happiness_logs
  ADD CONSTRAINT happiness_logs_score_check CHECK (score >= -10 AND score <= 10);
