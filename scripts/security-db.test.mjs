import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("matriz SQL de segurança compartilhada com pgTAP (PostgreSQL local, sem rede)", async (t) => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth,public to anon,authenticated;
      create schema storage; create table storage.buckets(id text primary key,public boolean not null default false);
    `);
    const folder = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(folder)).filter((f) => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(name, folder), "utf8"));
    await db.exec("begin");
    await db.exec(await readFile(new URL("../supabase/tests/fixtures/security-cases.inc", import.meta.url), "utf8"));
    const { rows } = await db.query("select * from security_test.run()");
    assert.ok(rows.length > 140, "matriz completa deve executar");
    for (const { label, passed } of rows) await t.test(label, () => assert.equal(passed, true));
    await db.exec("rollback");
  } finally { await db.close(); }
});
