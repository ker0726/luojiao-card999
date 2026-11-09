-- ============================================================
--  作品集站点 · Supabase 初始化脚本
--  用法：打开 Supabase 控制台 → SQL Editor → New query →
--        把本文件全部内容粘贴进去 → Run
--  重复执行是安全的（都可重复运行）
-- ============================================================

-- 1) 内容表：整站内容存在一行 JSON 里（id = 'main'）
create table if not exists public.site_content (
  id          text primary key,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.site_content enable row level security;

-- 访客只读；登录后的管理员才能写入
drop policy if exists "site_content_public_read" on public.site_content;
create policy "site_content_public_read" on public.site_content
  for select using (true);

drop policy if exists "site_content_auth_insert" on public.site_content;
create policy "site_content_auth_insert" on public.site_content
  for insert to authenticated with check (true);

drop policy if exists "site_content_auth_update" on public.site_content;
create policy "site_content_auth_update" on public.site_content
  for update to authenticated using (true) with check (true);

-- 先放一行空内容，后台第一次保存时直接更新这一行
insert into public.site_content (id, payload)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- 2) 图片存储桶：公开读取，登录后可上传/覆盖/删除
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media_auth_insert" on storage.objects;
create policy "media_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'media');

drop policy if exists "media_auth_update" on storage.objects;
create policy "media_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'media') with check (bucket_id = 'media');

drop policy if exists "media_auth_delete" on storage.objects;
create policy "media_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media');

-- 完成。接下来去 Authentication → Users → Add user 建一个管理员账号
-- （邮箱 + 密码，建议关掉 “Auto Confirm” 之外的邀请邮件，直接设密码即可）
