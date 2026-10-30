-- Auth can insert the user before writing app_metadata. The service-role-only
-- RPC authorizes one random bootstrap proof; the trigger consumes it atomically.
alter table private.registration_config
  add column if not exists admin_seed_hash text
  check (admin_seed_hash is null or admin_seed_hash ~ '^[0-9a-f]{64}$');

create or replace function public.prepare_admin_seed(p_seed_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_seed_hash is null or p_seed_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_admin_seed';
  end if;
  if exists (select 1 from public.profiles where slot = 1) then
    raise exception 'admin_already_exists';
  end if;
  update private.registration_config
    set admin_seed_hash = p_seed_hash, updated_at = now()
    where id = true;
end;
$$;

revoke all on function public.prepare_admin_seed(text) from public, anon, authenticated;
grant execute on function public.prepare_admin_seed(text) to service_role;

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
  seed_hash text;
begin
  if lower(coalesce(new.email, '')) = 'admin@local.little-sheep-house.invalid' then
    select rc.admin_seed_hash into seed_hash
      from private.registration_config rc where rc.id = true for update;
    if seed_hash is null
       or coalesce(new.raw_user_meta_data->>'admin_seed_hash', '') <> seed_hash then
      raise exception 'admin_seed_not_authorized';
    end if;
    target_slot := 1;
    profile_nickname := '全世界最聪明的小羊';
    profile_gender := '女';
    update private.registration_config
      set admin_seed_hash = null, updated_at = now() where id = true;
  else
    target_slot := 2;
    profile_nickname := btrim(coalesce(new.raw_user_meta_data->>'nickname', ''));
    profile_gender := coalesce(new.raw_user_meta_data->>'gender', '');
    supplied_hash := lower(coalesce(new.raw_user_meta_data->>'invite_hash', ''));

    select rc.invite_hash, rc.invite_consumed_at
      into configured_hash, consumed_at
      from private.registration_config rc where rc.id = true for update;

    if configured_hash is null or consumed_at is not null
       or supplied_hash !~ '^[0-9a-f]{64}$' or supplied_hash <> configured_hash
       or exists (select 1 from public.profiles p where p.slot = 2) then
      raise exception 'house_full_or_invite_invalid';
    end if;
    if char_length(profile_nickname) not between 1 and 24
       or profile_gender not in ('女', '男', '保密') then
      raise exception 'invalid_profile';
    end if;
  end if;

  insert into public.profiles (id, slot, nickname, gender)
    values (new.id, target_slot, profile_nickname, profile_gender);
  if target_slot = 2 then
    update private.registration_config
      set invite_consumed_at = now(), updated_at = now() where id = true;
  end if;
  return new;
exception when unique_violation then
  raise exception 'house_full';
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
