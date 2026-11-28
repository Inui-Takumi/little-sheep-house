begin;

alter table public.house_diary_entries add column delivery_at timestamptz(0);
grant insert (delivery_at), update (delivery_at) on public.house_diary_entries to authenticated;

-- Preserve the time and version of existing letters when adding their delivery instant.
alter table public.house_diary_entries disable trigger house_diary_touch_before_update;
update public.house_diary_entries
set delivery_at = delivery_on::timestamp at time zone 'Asia/Shanghai'
where delivery_on is not null;
alter table public.house_diary_entries enable trigger house_diary_touch_before_update;

alter table private.house_diary_delivery_reads
  alter column delivery_on type timestamptz(0)
  using (delivery_on::timestamp at time zone 'Asia/Shanghai');
alter table private.house_diary_delivery_reads rename column delivery_on to delivery_at;

create or replace function private.set_house_diary_delivery()
returns trigger language plpgsql set search_path = '' as $$
declare
  now_at timestamptz := clock_timestamp();
begin
  if new.visibility = 'private' then
    new.delivery_on := null;
    new.delivery_at := null;
    return new;
  end if;

  -- Older clients still write a date, which represents Beijing midnight.
  if tg_op = 'INSERT' then
    new.delivery_at := coalesce(new.delivery_at, new.delivery_on::timestamp at time zone 'Asia/Shanghai');
  elsif new.delivery_at is not distinct from old.delivery_at then
    if new.delivery_on is not distinct from old.delivery_on then
      return new;
    end if;
    new.delivery_at := new.delivery_on::timestamp at time zone 'Asia/Shanghai';
  end if;

  if tg_op = 'UPDATE' then
    if old.visibility = 'shared' and (old.delivery_at is null or old.delivery_at <= now_at) then
      raise exception using errcode = '23514', message = 'diary_already_delivered';
    end if;
  end if;

  new.delivery_on := (new.delivery_at at time zone 'Asia/Shanghai')::date;
  if new.delivery_at is not null and (new.delivery_at <= now_at or new.delivery_on > date '9999-12-31') then
    raise exception using errcode = '23514', message = 'diary_delivery_date_invalid';
  end if;
  return new;
end;
$$;

drop trigger house_diary_delivery_before_write on public.house_diary_entries;
create trigger house_diary_delivery_before_write
before insert or update of visibility, delivery_on, delivery_at on public.house_diary_entries
for each row execute function private.set_house_diary_delivery();

alter policy house_diary_read on public.house_diary_entries using (
  (select public.is_house_member()) and (
    author_id = (select auth.uid()) or (
      visibility = 'shared' and (delivery_at is null or delivery_at <= statement_timestamp())
    )
  )
);

drop index public.house_diary_delivery_idx;
create index house_diary_delivery_idx on public.house_diary_entries (delivery_at desc, created_at desc, id desc)
where visibility = 'shared' and delivery_at is not null;

create or replace function public.house_diary_unread_deliveries()
returns table (id uuid, unread_count bigint)
language sql stable security definer set search_path = '' as $$
  select entry.id, count(*) over ()
  from public.house_diary_entries entry
  where (select public.is_house_member())
    and entry.author_id <> (select auth.uid())
    and entry.visibility = 'shared'
    and entry.delivery_at <= statement_timestamp()
    and not exists (
      select 1 from private.house_diary_delivery_reads receipt
      where receipt.entry_id = entry.id
        and receipt.recipient_id = (select auth.uid())
        and receipt.delivery_at = entry.delivery_at
    )
  order by entry.delivery_at desc, entry.created_at desc, entry.id desc
  limit 1;
$$;

create or replace function public.house_diary_mark_delivery_read(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into private.house_diary_delivery_reads (entry_id, recipient_id, delivery_at)
  select entry.id, (select auth.uid()), entry.delivery_at
  from public.house_diary_entries entry
  where entry.id = p_id
    and (select public.is_house_member())
    and entry.author_id <> (select auth.uid())
    and entry.visibility = 'shared'
    and entry.delivery_at <= statement_timestamp()
  for share of entry
  on conflict do nothing;
$$;

commit;
