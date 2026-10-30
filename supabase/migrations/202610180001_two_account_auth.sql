-- Little Sheep House: two-account authentication and profile protection.
-- Run this migration before creating the seeded admin account.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  slot smallint not null unique check (slot in (1, 2)),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 24),
  gender text not null check (gender in ('女', '男', '保密')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

drop policy if exists "Users can read only their own profile" on public.profiles;
create policy "Users can read only their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create table if not exists private.registration_config (
  id boolean primary key default true check (id),
  invite_hash text check (invite_hash is null or invite_hash ~ '^[0-9a-f]{64}$'),
  invite_consumed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.registration_config enable row level security;

insert into private.registration_config (id)
values (true)
on conflict (id) do nothing;

revoke all on table private.registration_config from public, anon, authenticated;
grant all on table private.registration_config to service_role;

create or replace function public.is_registration_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    rc.invite_hash is not null
    and rc.invite_consumed_at is null
    and not exists (select 1 from public.profiles p where p.slot = 2)
  from private.registration_config rc
  where rc.id = true;
$$;

revoke all on function public.is_registration_open() from public;
grant execute on function public.is_registration_open() to anon, authenticated;

-- Called only by a server-side initialization script using the secret key.
create or replace function public.configure_registration(p_invite_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_invite_hash is null or lower(p_invite_hash) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invite_hash_must_be_sha256_hex';
  end if;

  insert into private.registration_config (id, invite_hash, invite_consumed_at, updated_at)
  values (true, lower(p_invite_hash), null, now())
  on conflict (id) do update
    set invite_hash = excluded.invite_hash,
        invite_consumed_at = null,
        updated_at = now();
end;
$$;

revoke all on function public.configure_registration(text) from public, anon, authenticated;
grant execute on function public.configure_registration(text) to service_role;

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_email text := lower(coalesce(event->'user'->>'email', ''));
  seeded_admin boolean := coalesce(
    (event->'user'->'app_metadata'->>'is_seeded_admin')::boolean,
    false
  );
  supplied_hash text := lower(coalesce(event->'user'->'user_metadata'->>'invite_hash', ''));
  configured_hash text;
  consumed_at timestamptz;
begin
  -- The admin account may only be created by the private seed operation.
  if requested_email = 'admin@local.little-sheep-house.invalid' and seeded_admin then
    return '{}'::jsonb;
  end if;

  if requested_email = 'admin@local.little-sheep-house.invalid' then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'signup_not_allowed')
    );
  end if;

  select rc.invite_hash, rc.invite_consumed_at
    into configured_hash, consumed_at
    from private.registration_config rc
    where rc.id = true;

  if consumed_at is not null
     or exists (select 1 from public.profiles p where p.slot = 2) then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'house_full')
    );
  end if;

  if configured_hash is null
     or supplied_hash !~ '^[0-9a-f]{64}$'
     or supplied_hash <> configured_hash then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'invite_invalid')
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.before_user_created(jsonb) from public, anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_slot smallint;
  profile_nickname text;
  profile_gender text;
  supplied_hash text;
  configured_hash text;
  consumed_at timestamptz;
begin
  if lower(coalesce(new.email, '')) = 'admin@local.little-sheep-house.invalid'
     and coalesce(new.raw_app_meta_data->>'is_seeded_admin', 'false') = 'true' then
    target_slot := 1;
    profile_nickname := '全世界最聪明的小羊';
    profile_gender := '女';
  else
    target_slot := 2;
    profile_nickname := btrim(coalesce(new.raw_user_meta_data->>'nickname', ''));
    profile_gender := coalesce(new.raw_user_meta_data->>'gender', '');
    supplied_hash := lower(coalesce(new.raw_user_meta_data->>'invite_hash', ''));

    select rc.invite_hash, rc.invite_consumed_at
      into configured_hash, consumed_at
      from private.registration_config rc
      where rc.id = true
      for update;

    if configured_hash is null
       or consumed_at is not null
       or supplied_hash !~ '^[0-9a-f]{64}$'
       or supplied_hash <> configured_hash
       or exists (select 1 from public.profiles p where p.slot = 2) then
      raise exception using errcode = 'P0001', message = 'house_full_or_invite_invalid';
    end if;

    if char_length(profile_nickname) not between 1 and 24
       or profile_gender not in ('女', '男', '保密') then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
  end if;

  insert into public.profiles (id, slot, nickname, gender)
  values (new.id, target_slot, profile_nickname, profile_gender);

  if target_slot = 2 then
    update private.registration_config
      set invite_consumed_at = now(), updated_at = now()
      where id = true;
  end if;

  return new;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'house_full';
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

comment on table public.profiles is 'Private two-slot profile directory for Little Sheep House.';
comment on function public.before_user_created(jsonb) is 'Supabase Auth hook enforcing the one-time invite and second-slot limit.';
