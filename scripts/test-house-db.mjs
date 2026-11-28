import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
const first = "00000000-0000-0000-0000-000000000001";
const second = "00000000-0000-0000-0000-000000000002";
const outsider = "00000000-0000-0000-0000-000000000003";
const as = async (id) => db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`);
const denied = async (sql, params = []) => assert.rejects(db.query(sql, params));

try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create table public.profiles(id uuid primary key,slot smallint unique,nickname text);
    insert into profiles values ('${first}',1,'A'),('${second}',2,'B');
    alter table profiles enable row level security; grant select on profiles to authenticated;
    create policy own on profiles for select to authenticated using (id=auth.uid());
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  `);
  for (const file of ["202611150003_shared_house.sql", "202611150004_house_collections.sql", "202611150005_house_surprises.sql", "202611220006_house_diary.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  await as(first);
  assert.equal((await db.query("select * from house_members()")).rows.length, 2);
  const note = (await db.query("insert into house_notes(author_id,body) values ($1,'hello') returning id", [first])).rows[0].id;
  await db.query("insert into house_items(author_id,kind,title) values ($1,'memory','photo')", [first]);
  const wish = (await db.query("insert into house_items(author_id,kind,title) values ($1,'wish','wish') returning id", [first])).rows[0].id;
  await db.query("insert into storage.objects values ('house-memories',$1)", [`${first}/photo`]);
  const capsule = (await db.query("select house_create_capsule($1,'hello','secret',now()+interval '1 day') id", [second])).rows[0].id;
  assert.equal((await db.query("select house_open_capsule($1) body",[capsule])).rows[0].body, "secret");
  await db.query("select house_answer_question('Q','answer A')");
  await as(second);
  assert.equal((await db.query("select * from house_notes")).rows.length, 1);
  assert.equal((await db.query("select * from house_items")).rows.length, 2);
  assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
  assert.equal((await db.query("delete from storage.objects where name=$1 returning name",[`${first}/photo`])).rows.length,0);
  assert.equal((await db.query("delete from house_notes where id=$1 returning id", [note])).rows.length, 0);
  await db.query("insert into house_notes(author_id,parent_id,body) values ($1,$2,'reply')", [second,note]);
  assert.equal((await db.query("update house_items set completed=true where id=$1 returning id",[wish])).rows.length,1);
  assert.equal((await db.query("delete from house_items where kind='memory' returning id")).rows.length,0);
  await denied("select house_open_capsule($1)", [capsule]);
  await denied("select * from private.house_capsule_bodies");
  assert.equal((await db.query("select * from house_question_answers('Q')")).rows.length, 0);
  await db.query("select house_answer_question('Q','answer B')");
  assert.equal((await db.query("select * from house_question_answers('Q')")).rows.length, 2);
  await as(first);
  assert.equal((await db.query("delete from house_notes where id=$1 returning id",[note])).rows.length,1);
  const replies=await db.query("select body,parent_id from house_notes where author_id=$1",[second]);
  assert.equal(replies.rows[0].parent_id,null);
  await as(outsider);
  assert.equal((await db.query("select * from house_notes")).rows.length, 0);
  assert.equal((await db.query("select * from house_items")).rows.length, 0);
  assert.equal((await db.query("select * from house_members()")).rows.length, 0);
  await denied("select house_open_capsule($1)", [capsule]);
  await denied("select * from house_question_answers('Q')");
  await denied("insert into storage.objects values ('house-memories',$1)", [`${first}/forged`]);
  await db.exec("reset role; set role anon");
  await denied("select * from house_notes");
  await db.exec("reset role");
  await db.query("update house_capsules set opens_at=now()-interval '1 second' where id=$1", [capsule]);
  await as(second);
  assert.equal((await db.query("select house_open_capsule($1) body", [capsule])).rows[0].body, "secret");

  const privateId = "00000000-0000-0000-0000-000000000011";
  const sharedId = "00000000-0000-0000-0000-000000000012";
  const testBody = "今天写下一句。\n<em>下一行</em>";
  const byId = "select author_id, body, version, font from house_diary_entries where id=$1";
  await as(first);
  await db.query("insert into house_diary_entries(id,body,font) values ($1,$2,'maocao')", [privateId, testBody]);
  await db.query("insert into house_diary_entries(id,body,visibility,seal) values ($1,'shared','shared','moon')", [sharedId]);
  await denied("insert into house_diary_entries(id,body) values ($1,$2)", [privateId, testBody]);
  await denied("insert into house_diary_entries(id,author_id,body) values (gen_random_uuid(),$1,'author forgery')", [second]);
  await denied("insert into house_diary_entries(id,body,visibility) values (gen_random_uuid(),'text','internet')");
  await denied("insert into house_diary_entries(id,body,font) values (gen_random_uuid(),'text','arbitrary-css')");
  await denied("insert into house_diary_entries(id,body) values (gen_random_uuid(),$1)", [" \n\t "]);
  const own = (await db.query(byId, [privateId])).rows[0];
  assert.equal(own.body, testBody);
  assert.equal(own.author_id, first);
  assert.equal(own.font, "maocao");
  await as(second);
  assert.equal((await db.query(byId, [privateId])).rows.length, 0);
  assert.equal((await db.query(byId, [sharedId])).rows[0].body, "shared");
  assert.equal((await db.query("update house_diary_entries set body='other' where id=$1 returning id", [sharedId])).rows.length, 0);
  assert.equal((await db.query("delete from house_diary_entries where id=$1 returning id", [privateId])).rows.length, 0);
  assert.equal((await db.query("delete from house_diary_entries where id=$1 returning id", [sharedId])).rows.length, 0);
  await as(first);
  const publish = (await db.query("update house_diary_entries set visibility='shared' where id=$1 and version=1 returning version", [privateId])).rows;
  assert.equal(Number(publish[0].version), 2);
  await denied("update house_diary_entries set author_id=$1 where id=$2", [second, privateId]);
  const stale = await db.query("update house_diary_entries set body='stale' where id=$1 and version=1 returning id", [privateId]);
  assert.equal(stale.rows.length, 0);
  await as(second);
  assert.equal((await db.query(byId, [privateId])).rows[0].body, testBody);
  await as(first);
  await db.query("update house_diary_entries set visibility='private' where id=$1", [privateId]);
  await as(second);
  assert.equal((await db.query(byId, [privateId])).rows.length, 0);
  await as(outsider);
  assert.equal((await db.query("select id from house_diary_entries")).rows.length, 0);
  await denied("insert into house_diary_entries(id,body) values (gen_random_uuid(),'outsider')");
  await db.exec("reset role; set role anon");
  await denied("select id,body from house_diary_entries");
  await as(first);
  assert.equal((await db.query("delete from house_diary_entries where id=$1 returning id", [sharedId])).rows.length, 1);
  await as(second);
  assert.equal((await db.query(byId, [sharedId])).rows.length, 0);
  console.log("日记：两位住客、非住客、匿名、并发版本及公开/私密切换权限通过");

  await as(first);
  await db.query("update house_diary_entries set visibility='shared' where id=$1", [privateId]);
  await db.exec("reset role");
  await db.exec(await readFile(new URL("../supabase/migrations/202611260007_house_diary_delivery.sql", import.meta.url), "utf8"));

  const scheduledId = "00000000-0000-0000-0000-000000000013";
  const cancelledId = "00000000-0000-0000-0000-000000000014";
  const laterId = "00000000-0000-0000-0000-000000000015";
  const beijingDate = "(statement_timestamp() at time zone 'Asia/Shanghai')::date";
  const unread = async () => (await db.query("select * from house_diary_unread_deliveries()")).rows;
  const markRead = (id) => db.query("select house_diary_mark_delivery_read($1)", [id]);
  const schedule = (id, offset) => db.query(
    `insert into house_diary_entries(id,visibility,title,body,delivery_on)
     values ($1,'shared','标题','正文',${beijingDate} + $2::integer)`, [id, offset]
  );

  await as(first);
  await denied(`update house_diary_entries set delivery_on=${beijingDate} + 1 where id=$1`, [privateId]);
  await denied(`insert into house_diary_entries(id,visibility,body,delivery_on)
                values (gen_random_uuid(),'shared','正文',${beijingDate})`);
  await schedule(scheduledId, 1);
  await schedule(cancelledId, 1);
  await schedule(laterId, 2);
  await db.query(`update house_diary_entries set delivery_on=${beijingDate} + 3 where id=$1`, [laterId]);
  await db.query("update house_diary_entries set visibility='private' where id=$1", [cancelledId]);
  assert.equal((await db.query("select delivery_on from house_diary_entries where id=$1", [cancelledId])).rows[0].delivery_on, null);
  assert.equal((await db.query(byId, [scheduledId])).rows[0].body, "正文");
  assert.deepEqual(await unread(), []);
  await markRead(scheduledId);

  await as(second);
  assert.equal((await db.query(byId, [privateId])).rows[0].body, testBody);
  assert.equal((await db.query("select title,body from house_diary_entries where id=$1", [scheduledId])).rows.length, 0);
  assert.deepEqual(await unread(), []);
  await markRead(scheduledId);
  await denied("select * from private.house_diary_delivery_reads");

  // Move the test letters across the delivery boundary without changing the host clock.
  await db.exec("reset role; alter table house_diary_entries disable trigger house_diary_delivery_before_write");
  await db.query(`update house_diary_entries set delivery_on=${beijingDate} where id=$1`, [scheduledId]);
  await db.query(`update house_diary_entries set delivery_on=${beijingDate} - 1 where id=$1`, [laterId]);
  await db.exec("alter table house_diary_entries enable trigger house_diary_delivery_before_write");

  await as(outsider);
  assert.deepEqual(await unread(), []);
  await markRead(scheduledId);
  await db.exec("reset role; set role anon");
  await assert.rejects(unread());
  await assert.rejects(markRead(scheduledId));

  await as(first);
  assert.deepEqual(await unread(), []);
  await markRead(scheduledId);
  await denied(`update house_diary_entries set delivery_on=${beijingDate} + 1 where id=$1`, [scheduledId]);
  await db.query("update house_diary_entries set body='投递后编辑' where id=$1", [scheduledId]);

  await as(second);
  assert.equal((await db.query(byId, [scheduledId])).rows[0].body, "投递后编辑");
  assert.equal((await db.query(byId, [cancelledId])).rows.length, 0);
  const [latest] = await unread();
  assert.equal(latest.id, scheduledId);
  assert.equal(Number(latest.unread_count), 2);
  const beforeRead = (await db.query(byId, [scheduledId])).rows[0].version;
  await markRead(scheduledId);
  await markRead(scheduledId);
  assert.equal((await db.query(byId, [scheduledId])).rows[0].version, beforeRead);
  assert.equal((await unread())[0].id, laterId);
  await markRead(laterId);
  assert.deepEqual(await unread(), []);

  await as(first);
  await db.query("delete from house_diary_entries where id=$1", [scheduledId]);
  await db.exec("reset role");
  assert.equal((await db.query("select entry_id from private.house_diary_delivery_reads where entry_id=$1", [scheduledId])).rows.length, 0);
  console.log("日期投递：历史公开信兼容、到期前保密、改期和取消、收信方提醒与去重通过");

  await db.exec(await readFile(new URL("../supabase/migrations/202611280008_house_diary_music.sql", import.meta.url), "utf8"));
  const musicBucket = "house-diary-music";
  const musicId = "00000000-0000-0000-0000-000000000016";
  const objectId = "00000000-0000-0000-0000-000000000017";
  const musicPath = `${first}/${musicId}/${objectId}`;
  const otherPath = `${second}/${musicId}/${objectId}`;
  const upload = (path) => db.query("insert into storage.objects values ($1,$2)", [musicBucket, path]);
  const readObject = () => db.query("select name from storage.objects where bucket_id=$1 and name=$2", [musicBucket, musicPath]);
  const removeObject = () => db.query("delete from storage.objects where bucket_id=$1 and name=$2 returning name", [musicBucket, musicPath]);

  assert.deepEqual((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id=$1", [musicBucket])).rows[0], {
    public: false, file_size_limit: 10485760, allowed_mime_types: ["audio/mpeg", "audio/mp4", "audio/wav"]
  });
  await as(second);
  await upload(otherPath);
  await assert.rejects(upload(musicPath));
  await as(first);
  assert.equal((await db.query("select music_path from house_diary_entries where id=$1", [privateId])).rows[0].music_path, null);
  const insertMusic = (path) => db.query(
    `insert into house_diary_entries(id,visibility,body,paper,delivery_on,music_path)
     values ($1,'shared','配乐试信','botanical',${beijingDate} + 1,$2)`, [musicId, path]
  );
  await assert.rejects(insertMusic(musicPath));
  await assert.rejects(insertMusic(otherPath));
  await upload(musicPath);
  await as(second);
  assert.equal((await readObject()).rows.length, 0);
  await as(first);
  await insertMusic(musicPath);
  assert.equal((await readObject()).rows.length, 1);
  assert.equal((await removeObject()).rows.length, 0);
  await as(second);
  assert.equal((await readObject()).rows.length, 0);
  await db.exec("reset role; alter table house_diary_entries disable trigger house_diary_delivery_before_write");
  await db.query(`update house_diary_entries set delivery_on=${beijingDate} where id=$1`, [musicId]);
  await db.exec("alter table house_diary_entries enable trigger house_diary_delivery_before_write");
  await as(second);
  assert.equal((await readObject()).rows.length, 1);
  assert.equal((await removeObject()).rows.length, 0);
  await as(outsider);
  assert.equal((await readObject()).rows.length, 0);
  await db.exec("reset role; set role anon");
  await assert.rejects(readObject());
  await as(first);
  await db.query("update house_diary_entries set visibility='private' where id=$1", [musicId]);
  await as(second);
  assert.equal((await readObject()).rows.length, 0);
  await as(first);
  await db.query("update house_diary_entries set music_path=null where id=$1", [musicId]);
  assert.equal((await removeObject()).rows.length, 1);
  console.log("信件配乐：信纸兼容、文件归属、私密和定时封存、到期读取及解除关联后清理通过");
  console.log("共享权限、私有照片规则、时光信件及双人问答：本机数据库测试通过");
} finally {
  await db.close();
}
