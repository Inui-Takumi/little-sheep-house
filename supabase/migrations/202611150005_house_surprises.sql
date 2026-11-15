-- Envelope metadata is shared; sealed content is never directly exposed to clients.
create table public.house_capsules (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  title text not null check (length(btrim(title)) between 1 and 100),
  opens_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (author_id <> recipient_id)
);
create table private.house_capsule_bodies (
  capsule_id uuid primary key references public.house_capsules(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 5000)
);
alter table private.house_capsule_bodies enable row level security;
revoke all on private.house_capsule_bodies from public, anon, authenticated;
alter table public.house_capsules enable row level security;
revoke all on public.house_capsules from public, anon, authenticated;
grant select, delete on public.house_capsules to authenticated;
create policy house_capsules_read on public.house_capsules for select to authenticated using (public.is_house_member());
create policy house_capsules_delete on public.house_capsules for delete to authenticated using (public.is_house_member() and author_id=(select auth.uid()));
create or replace function public.house_create_capsule(p_recipient uuid,p_title text,p_body text,p_opens_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.is_house_member() or not exists(select 1 from public.profiles where id=p_recipient and id<>(select auth.uid())) then raise exception 'not_allowed'; end if;
  if p_opens_at is null or p_opens_at<=now() or length(btrim(coalesce(p_title,''))) not between 1 and 100 or length(btrim(coalesce(p_body,''))) not between 1 and 5000 then raise exception 'invalid_capsule'; end if;
  insert into public.house_capsules(author_id,recipient_id,title,opens_at) values ((select auth.uid()),p_recipient,btrim(p_title),p_opens_at) returning id into result;
  insert into private.house_capsule_bodies(capsule_id,body) values(result,btrim(p_body));
  return result;
end $$;
create or replace function public.house_open_capsule(p_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare content text;
begin
  if not public.is_house_member() then raise exception 'not_allowed'; end if;
  select b.body into content from public.house_capsules c join private.house_capsule_bodies b on b.capsule_id=c.id
    where c.id=p_id and (c.author_id=(select auth.uid()) or (c.recipient_id=(select auth.uid()) and c.opens_at<=now()));
  if content is null then raise exception 'not_available'; end if;
  return content;
end $$;
revoke all on function public.house_create_capsule(uuid,text,text,timestamptz), public.house_open_capsule(uuid) from public, anon;
grant execute on function public.house_create_capsule(uuid,text,text,timestamptz), public.house_open_capsule(uuid) to authenticated;

create table private.house_answers (
  question text not null check (length(btrim(question)) between 1 and 200),
  author_id uuid not null references public.profiles(id),
  answer text not null check (length(btrim(answer)) between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key(question,author_id)
);
alter table private.house_answers enable row level security;
revoke all on private.house_answers from public, anon, authenticated;
create or replace function public.house_answer_question(p_question text,p_answer text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_house_member() then raise exception 'not_allowed'; end if;
  if length(btrim(coalesce(p_question,''))) not between 1 and 200 or length(btrim(coalesce(p_answer,''))) not between 1 and 1000 then raise exception 'invalid_answer'; end if;
  insert into private.house_answers(question,author_id,answer) values(btrim(p_question),(select auth.uid()),btrim(p_answer))
  on conflict(question,author_id) do update set answer=excluded.answer,updated_at=now();
end $$;
create or replace function public.house_question_answers(p_question text)
returns table(author_id uuid,answer text) language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_house_member() then raise exception 'not_allowed'; end if;
  if (select count(*) from public.profiles where slot in (1,2))=2 and
     (select count(*) from private.house_answers a join public.profiles p on p.id=a.author_id where a.question=btrim(p_question) and p.slot in (1,2))=2 then
    return query select a.author_id,a.answer from private.house_answers a join public.profiles p on p.id=a.author_id where a.question=btrim(p_question) and p.slot in (1,2);
  else
    return query select a.author_id,a.answer from private.house_answers a where a.question=btrim(p_question) and a.author_id=(select auth.uid());
  end if;
end $$;
revoke all on function public.house_answer_question(text,text),public.house_question_answers(text) from public, anon;
grant execute on function public.house_answer_question(text,text),public.house_question_answers(text) to authenticated;
