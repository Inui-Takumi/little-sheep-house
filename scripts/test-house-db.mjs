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
  for (const file of ["202611150003_shared_house.sql", "202611150004_house_collections.sql", "202611150005_house_surprises.sql"]) {
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
  console.log("共享权限、私有照片规则、时光信件及双人问答：本机数据库测试通过");
} finally {
  await db.close();
}
