import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("leitura do mês sem escrita, horizonte de projeções e resumo de parcelamentos", async (t) => {
  const db = await PGlite.create();
  const a = randomUUID(), b = randomUUID();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  async function asUser(id) {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  }
  // Inside one transaction: did generate_occurrences write or lock anything?
  async function wrote(month) {
    await db.exec("begin");
    try {
      await db.query("select public.generate_occurrences($1)", [month]);
      return (await rows("select pg_current_xact_id_if_assigned() as xid"))[0].xid !== null;
    } finally { await db.exec("rollback"); }
  }
  const month = (offset) => rows("select (date_trunc('month',now() at time zone 'America/Sao_Paulo') + make_interval(months => $1))::date::text as m", [offset]).then((r) => r[0].m);
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      grant usage on schema auth,public to anon,authenticated;`);
    const folder = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(folder)).filter((f) => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(name, folder), "utf8"));
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    await asUser(a);
    const expense = (await rows("select id from public.categories where type='expense' limit 1"))[0].id;
    const income = (await rows("select id from public.categories where type='income' limit 1"))[0].id;
    const current = await month(0);
    await rows("insert into public.recurrences(category_id,type,amount,description,expense_kind,day_of_month,start_month,effective_month) values($1,'expense',2000,'Aluguel','fixed',5,$2,$2)", [expense, current]);

    await t.test("primeira consulta gera; mês já gerado não escreve nem bloqueia", async () => {
      assert.equal(await wrote(current), true);
      await db.query("select public.generate_occurrences($1)", [current]);
      assert.equal((await rows("select * from public.transactions where occurrence_month=$1", [current])).length, 1);
      assert.equal(await wrote(current), false);
    });
    await t.test("nova regra ou receita vencida ainda geram e realizam no mês consultado", async () => {
      await rows("insert into public.recurrences(category_id,type,amount,description,day_of_month,start_month,effective_month) values($1,'income',5000,'Salário',1,$2,$2)", [income, current]);
      assert.equal(await wrote(current), true);
      await db.query("select public.generate_occurrences($1)", [current]);
      const salary = (await rows("select * from public.transactions where type='income' and occurrence_month=$1", [current]))[0];
      assert.equal(salary.status, "realized");
      assert.equal(await wrote(current), false);
    });
    await t.test("exclusão marcada não é regenerada nem força escrita", async () => {
      await db.query("update public.transactions set deleted_at=now() where type='expense' and occurrence_month=$1", [current]);
      assert.equal(await wrote(current), false);
    });
    await t.test("projeções param 24 meses à frente", async () => {
      const last = await month(24), beyond = await month(25);
      await db.query("select public.generate_occurrences($1)", [last]);
      assert.equal((await rows("select * from public.transactions where occurrence_month=$1", [last])).length, 2);
      assert.equal(await wrote(beyond), false);
      await db.query("select public.generate_occurrences('2100-12-01')");
      assert.equal((await rows("select * from public.transactions where occurrence_month > $1", [last])).length, 0);
    });
    await t.test("resumo conta parcelas pagas e respeita RLS", async () => {
      const plan = (await rows("select public.create_installment_plan($1,$2,'Notebook',9000,3,'2025-01-10','2025-01-31','Cartão','variable') as id", [randomUUID(), expense]))[0].id;
      const first = (await rows("select id from public.transactions where installment_plan_id=$1 and installment_number=1", [plan]))[0].id;
      await db.query("select public.pay_installment($1,'2025-02-01',3000)", [first]);
      const summary = await rows("select * from public.installment_plan_summaries where id=$1", [plan]);
      assert.equal(summary.length, 1);
      assert.equal(summary[0].paid_count, 1);
      assert.equal(summary[0].installment_count, 3);
      await asUser(b);
      assert.equal((await rows("select * from public.installment_plan_summaries")).length, 0);
      await db.exec("reset role; set role anon");
      await assert.rejects(rows("select * from public.installment_plan_summaries"), (error) => error.code === "42501");
    });
  } finally { await db.close(); }
});
