
-- 扩展 mode 字段 CHECK 约束，加入新的 'poster' 模式
ALTER TABLE painting_house_works
  DROP CONSTRAINT painting_house_works_mode_check;

ALTER TABLE painting_house_works
  ADD CONSTRAINT painting_house_works_mode_check
  CHECK (mode = ANY (ARRAY['story'::text, 'theory'::text, 'game'::text, 'poster'::text]));
