-- The house is available only to the two existing profile holders.
create or replace function public.is_house_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and slot in (1, 2)); $$;
revoke all on function public.is_house_member() from public, anon;
grant execute on function public.is_house_member() to authenticated;

-- Expose only display names to house members; never expose their email addresses.
create or replace function public.house_members()
returns table(id uuid, nickname text)
language sql stable security definer set search_path = ''
as $$ select p.id, p.nickname from public.profiles p where public.is_house_member() order by p.slot; $$;
revoke all on function public.house_members() from public, anon;
grant execute on function public.house_members() to authenticated;

create table public.house_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  parent_id uuid references public.house_notes(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index house_notes_created_idx on public.house_notes(created_at desc);
create table public.house_likes (
  note_id uuid not null references public.house_notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  primary key(note_id, user_id)
);
create table public.house_reads (
  user_id uuid primary key references public.profiles(id),
  notes_seen_at timestamptz not null default now()
);
create table public.house_dates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 60),
  event_date date not null,
  kind text not null check (kind in ('together', 'anniversary', 'event')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index house_one_together_date on public.house_dates(kind) where kind = 'together';
create table public.house_quotes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.house_notes enable row level security;
alter table public.house_likes enable row level security;
alter table public.house_reads enable row level security;
alter table public.house_dates enable row level security;
alter table public.house_quotes enable row level security;
revoke all on public.house_notes, public.house_likes, public.house_reads, public.house_dates, public.house_quotes from public, anon, authenticated;
grant select, insert, delete on public.house_notes, public.house_likes, public.house_reads, public.house_dates, public.house_quotes to authenticated;
grant update(body) on public.house_notes to authenticated;
grant update(notes_seen_at) on public.house_reads to authenticated;
grant update(title, event_date, kind) on public.house_dates to authenticated;

create policy house_notes_read on public.house_notes for select to authenticated using (public.is_house_member());
create policy house_notes_insert on public.house_notes for insert to authenticated with check (public.is_house_member() and author_id = (select auth.uid()) and (house_notes.parent_id is null or exists (select 1 from public.house_notes n where n.id = house_notes.parent_id and n.parent_id is null)));
create policy house_notes_update on public.house_notes for update to authenticated using (public.is_house_member() and author_id = (select auth.uid())) with check (public.is_house_member() and author_id = (select auth.uid()));
create policy house_notes_delete on public.house_notes for delete to authenticated using (public.is_house_member() and author_id = (select auth.uid()));
create policy house_likes_read on public.house_likes for select to authenticated using (public.is_house_member());
create policy house_likes_insert on public.house_likes for insert to authenticated with check (public.is_house_member() and user_id = (select auth.uid()));
create policy house_likes_delete on public.house_likes for delete to authenticated using (public.is_house_member() and user_id = (select auth.uid()));
create policy house_reads_own on public.house_reads for all to authenticated using (public.is_house_member() and user_id = (select auth.uid())) with check (public.is_house_member() and user_id = (select auth.uid()));
create policy house_dates_read on public.house_dates for select to authenticated using (public.is_house_member());
create policy house_dates_insert on public.house_dates for insert to authenticated with check (public.is_house_member() and created_by = (select auth.uid()));
create policy house_dates_update on public.house_dates for update to authenticated using (public.is_house_member()) with check (public.is_house_member());
create policy house_dates_delete on public.house_dates for delete to authenticated using (public.is_house_member());
create policy house_quotes_read on public.house_quotes for select to authenticated using (public.is_house_member());
create policy house_quotes_insert on public.house_quotes for insert to authenticated with check (public.is_house_member() and author_id = (select auth.uid()));
create policy house_quotes_delete on public.house_quotes for delete to authenticated using (public.is_house_member() and author_id = (select auth.uid()));
