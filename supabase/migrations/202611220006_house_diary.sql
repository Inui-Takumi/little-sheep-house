create table public.house_diary_entries (
  id uuid primary key,
  author_id uuid not null default auth.uid() references public.profiles(id),
  visibility text not null default 'private' check (visibility in ('shared', 'private')),
  title text not null default '' check (char_length(title) <= 60),
  body text not null check (char_length(body) between 1 and 10000 and body ~ '[^[:space:]]'),
  envelope text not null default 'rose' check (envelope in ('rose', 'stock', 'post', 'night')),
  paper text not null default 'ruled' check (paper in ('ruled', 'kraft', 'grid', 'cloud')),
  font text not null default 'serif' check (font in ('serif', 'sans', 'xiaowei', 'kaishu', 'longcang', 'maocao', 'kuaile', 'huangyou')),
  seal text not null default 'lamb' check (seal in ('lamb', 'heart', 'moon', 'flower')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index house_diary_recent_idx on public.house_diary_entries (created_at desc, id desc);
create index house_diary_visibility_idx on public.house_diary_entries (visibility, author_id, created_at desc, id desc);

create function private.touch_house_diary_entry()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_house_diary_entry() from public, anon, authenticated;

create trigger house_diary_touch_before_update
before update on public.house_diary_entries
for each row execute function private.touch_house_diary_entry();

alter table public.house_diary_entries enable row level security;
revoke all on public.house_diary_entries from public, anon, authenticated;
grant select, delete on public.house_diary_entries to authenticated;
grant insert (id, visibility, title, body, envelope, paper, font, seal) on public.house_diary_entries to authenticated;
grant update (visibility, title, body, envelope, paper, font, seal) on public.house_diary_entries to authenticated;

create policy house_diary_read on public.house_diary_entries for select to authenticated
  using ((select public.is_house_member()) and (visibility = 'shared' or author_id = (select auth.uid())));
create policy house_diary_insert on public.house_diary_entries for insert to authenticated
  with check ((select public.is_house_member()) and author_id = (select auth.uid()));
create policy house_diary_update on public.house_diary_entries for update to authenticated
  using ((select public.is_house_member()) and author_id = (select auth.uid()))
  with check ((select public.is_house_member()) and author_id = (select auth.uid()));
create policy house_diary_delete on public.house_diary_entries for delete to authenticated
  using ((select public.is_house_member()) and author_id = (select auth.uid()));
