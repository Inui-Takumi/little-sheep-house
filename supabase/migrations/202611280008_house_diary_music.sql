begin;

alter table public.house_diary_entries drop constraint house_diary_entries_paper_check;
alter table public.house_diary_entries
  add constraint house_diary_entries_paper_check
  check (paper in ('ruled', 'kraft', 'grid', 'cloud', 'botanical'));
alter table public.house_diary_entries
  add column music_path text,
  add constraint house_diary_music_path_check check (
    music_path is null or music_path ~ (
      '^' || author_id::text || '/' || id::text || '/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    )
  );
grant insert (music_path), update (music_path) on public.house_diary_entries to authenticated;
create unique index house_diary_music_path_idx on public.house_diary_entries (music_path)
  where music_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('house-diary-music', 'house-diary-music', false, 10485760,
        array['audio/mpeg', 'audio/mp4', 'audio/wav']);

create policy house_diary_music_read on storage.objects for select to authenticated
using (
  bucket_id = 'house-diary-music'
  and (select public.is_house_member())
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.house_diary_entries entry where entry.music_path = objects.name)
  )
);

create policy house_diary_music_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'house-diary-music'
  and (select public.is_house_member())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}){2}$'
);

create policy house_diary_music_cleanup on storage.objects for delete to authenticated
using (
  bucket_id = 'house-diary-music'
  and (select public.is_house_member())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.house_diary_entries entry where entry.music_path = objects.name)
);

create function private.check_house_diary_music()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.music_path is not null then
    if tg_op = 'UPDATE' and new.music_path is not distinct from old.music_path then
      return new;
    end if;
    if not starts_with(new.music_path, new.author_id::text || '/' || new.id::text || '/') then
      raise exception using errcode = '23514', message = 'diary_music_missing';
    end if;
    perform 1 from storage.objects
      where bucket_id = 'house-diary-music' and name = new.music_path
      for key share;
    if not found then
      raise exception using errcode = '23514', message = 'diary_music_missing';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_house_diary_music() from public, anon, authenticated;

create trigger house_diary_music_before_write
before insert or update of music_path on public.house_diary_entries
for each row execute function private.check_house_diary_music();

commit;
