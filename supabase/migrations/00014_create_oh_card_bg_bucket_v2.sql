
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oh-card-bg', 'oh-card-bg', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'oh-card-bg public read'
  ) then
    execute 'create policy "oh-card-bg public read" on storage.objects for select using (bucket_id = ''oh-card-bg'')';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'oh-card-bg service write'
  ) then
    execute 'create policy "oh-card-bg service write" on storage.objects for insert with check (bucket_id = ''oh-card-bg'')';
  end if;
end $$;
