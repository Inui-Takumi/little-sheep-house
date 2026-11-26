begin;

alter table public.house_diary_entries add column delivery_on date;
grant insert (delivery_on), update (delivery_on) on public.house_diary_entries to authenticated;

create function private.set_house_diary_delivery()
returns trigger language plpgsql set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Shanghai')::date;
begin
  if new.visibility = 'private' then
    new.delivery_on := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.delivery_on is not distinct from old.delivery_on then
      return new;
    end if;
    if old.visibility = 'shared' and (old.delivery_on is null or old.delivery_on <= today) then
      raise exception using errcode = '23514', message = 'diary_already_delivered';
    end if;
  end if;

  if new.delivery_on is not null and (new.delivery_on <= today or new.delivery_on > date '9999-12-31') then
    raise exception using errcode = '23514', message = 'diary_delivery_date_invalid';
  end if;
  return new;
end;
$$;
revoke all on function private.set_house_diary_delivery() from public, anon, authenticated;

create trigger house_diary_delivery_before_write
before insert or update of visibility, delivery_on on public.house_diary_entries
for each row execute function private.set_house_diary_delivery();

alter policy house_diary_read on public.house_diary_entries using (
  (select public.is_house_member()) and (
    author_id = (select auth.uid()) or (
      visibility = 'shared' and (
        delivery_on is null or delivery_on <= (statement_timestamp() at time zone 'Asia/Shanghai')::date
      )
    )
  )
);

create index house_diary_delivery_idx on public.house_diary_entries (delivery_on desc, created_at desc, id desc)
where visibility = 'shared' and delivery_on is not null;

create table private.house_diary_delivery_reads (
  entry_id uuid not null references public.house_diary_entries(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  delivery_on date not null,
  primary key (entry_id, recipient_id, delivery_on)
);
alter table private.house_diary_delivery_reads enable row level security;
revoke all on private.house_diary_delivery_reads from public, anon, authenticated;

create function public.house_diary_unread_deliveries()
returns table (id uuid, unread_count bigint)
language sql stable security definer set search_path = '' as $$
  select entry.id, count(*) over ()
  from public.house_diary_entries entry
  where (select public.is_house_member())
    and entry.author_id <> (select auth.uid())
    and entry.visibility = 'shared'
    and entry.delivery_on <= (statement_timestamp() at time zone 'Asia/Shanghai')::date
    and not exists (
      select 1 from private.house_diary_delivery_reads receipt
      where receipt.entry_id = entry.id
        and receipt.recipient_id = (select auth.uid())
        and receipt.delivery_on = entry.delivery_on
    )
  order by entry.delivery_on desc, entry.created_at desc, entry.id desc
  limit 1;
$$;

create function public.house_diary_mark_delivery_read(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into private.house_diary_delivery_reads (entry_id, recipient_id, delivery_on)
  select entry.id, (select auth.uid()), entry.delivery_on
  from public.house_diary_entries entry
  where entry.id = p_id
    and (select public.is_house_member())
    and entry.author_id <> (select auth.uid())
    and entry.visibility = 'shared'
    and entry.delivery_on <= (statement_timestamp() at time zone 'Asia/Shanghai')::date
  for share of entry
  on conflict do nothing;
$$;

revoke all on function public.house_diary_unread_deliveries(), public.house_diary_mark_delivery_read(uuid) from public, anon;
grant execute on function public.house_diary_unread_deliveries(), public.house_diary_mark_delivery_read(uuid) to authenticated;

commit;
