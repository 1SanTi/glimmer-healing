-- 允许 created_by 为 NULL（管理员通过 service_role 生成时无需关联用户）
ALTER TABLE public.redemption_codes 
  ALTER COLUMN created_by DROP NOT NULL;
