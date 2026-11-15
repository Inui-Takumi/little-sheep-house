-- Shared collections. Media objects are private and accessible only to house members.
create table public.house_items (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('memory','wish','song','task','mood')),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null default '' check (length(body) <= 2000),
  event_date date,
  url text check (url is null or (length(url) <= 2000 and url ~ '^https?://')),
  image_path text,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.house_items enable row level security;
revoke all on public.house_items from public, anon, authenticated;
grant select, insert, delete on public.house_items to authenticated;
grant update(title, body, event_date, url, completed) on public.house_items to authenticated;
create policy house_items_read on public.house_items for select to authenticated using (public.is_house_member());
create policy house_items_insert on public.house_items for insert to authenticated
  with check (public.is_house_member() and author_id=(select auth.uid()) and (image_path is null or (kind='memory' and split_part(image_path,'/',1)=(select auth.uid())::text)));
create policy house_items_update on public.house_items for update to authenticated
  using (public.is_house_member() and (author_id=(select auth.uid()) or kind in ('wish','task')))
  with check (public.is_house_member() and (author_id=(select auth.uid()) or kind in ('wish','task')));
create policy house_items_delete on public.house_items for delete to authenticated
  using (public.is_house_member() and (author_id=(select auth.uid()) or kind in ('wish','task')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('house-memories','house-memories',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
do $$ begin
  if exists (select 1 from storage.buckets where id='house-memories' and (public is distinct from false or file_size_limit is distinct from 10485760::bigint or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']::text[])) then
    raise exception 'house_memories_bucket_configuration_mismatch';
  end if;
end $$;
create policy house_memory_read on storage.objects for select to authenticated using (bucket_id='house-memories' and public.is_house_member());
create policy house_memory_upload on storage.objects for insert to authenticated with check (bucket_id='house-memories' and public.is_house_member() and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy house_memory_delete on storage.objects for delete to authenticated using (bucket_id='house-memories' and public.is_house_member() and (storage.foldername(name))[1]=(select auth.uid())::text);
