
-- 备课中心：文件夹表
create table lesson_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references lesson_folders(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table lesson_folders enable row level security;
create policy "用户管理自己的文件夹" on lesson_folders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 备课中心：文件表
create table lesson_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references lesson_folders(id) on delete set null,
  name text not null,
  file_type text not null, -- 'excel'|'pdf'|'ppt'|'word'|'text'|'image'|'audio'|'url'|'other'
  storage_path text,        -- Supabase Storage 路径（url类型为null）
  url text,                 -- file_type='url' 时存网址
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table lesson_files enable row level security;
create policy "用户管理自己的文件" on lesson_files for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 备课资源共享平台
create table shared_resources (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  file_type text not null,
  storage_path text,
  url text,
  size_bytes bigint,
  download_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table shared_resources enable row level security;
-- 所有人可查看分享资源
create policy "所有人可读分享资源" on shared_resources for select to anon, authenticated using (true);
-- 登录用户可上传
create policy "已登录可上传共享资源" on shared_resources for insert to authenticated with check (uploader_id = auth.uid());
-- 上传者可删除自己的
create policy "上传者可删除" on shared_resources for delete to authenticated using (uploader_id = auth.uid());
-- 下载次数更新（所有人）
create policy "任何人可更新下载数" on shared_resources for update to anon, authenticated using (true) with check (true);

-- Storage bucket: 备课文件
insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-files', 'lesson-files', false, 52428800) -- 50MB
on conflict (id) do nothing;

-- Storage RLS: 已登录用户可上传自己的文件，可读自己的文件
create policy "用户可上传备课文件" on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "用户可读自己备课文件" on storage.objects for select to authenticated
  using (bucket_id = 'lesson-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "用户可删自己备课文件" on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Storage bucket: 公开共享资源
insert into storage.buckets (id, name, public, file_size_limit)
values ('shared-resources', 'shared-resources', true, 52428800)
on conflict (id) do nothing;
create policy "已登录可上传共享资源文件" on storage.objects for insert to authenticated
  with check (bucket_id = 'shared-resources');
create policy "所有人可读共享资源文件" on storage.objects for select to anon, authenticated
  using (bucket_id = 'shared-resources');
