import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("migrações, isolamento RLS e recorrências em PostgreSQL local", async (t) => {
  const db = await PGlite.create();
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  async function asUser(id) {
    await db.exec("reset role; set role authenticated;");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, user_metadata: { name: "Teste" } })]);
  }
  async function rows(sql, params = []) { return (await db.query(sql, params)).rows; }
  let legacyRule;
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create schema storage;
      create table storage.objects(bucket_id text, name text, owner_id text, owner uuid);
      grant usage on schema storage, public to service_role;
      grant select on storage.objects to service_role;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth,public to anon,authenticated;
      insert into auth.users(id) values ('${a}');`);
    for (const file of ["202609100001_financial_schema.sql", "202609100002_financial_functions.sql", "202609100003_income_by_date.sql", "202609140004_account_deletion.sql"]) {
      if (file === "202609100003_income_by_date.sql") {
        await asUser(a);
        const category = (await rows("select id from public.categories where type='income' limit 1"))[0].id;
        legacyRule = (await rows("insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month) values($1,'income',500,5,'2001-09-01',date_trunc('month',now())::date) returning id", [category]))[0].id;
        for (const m of ["2001-09-01", "2001-10-01", "2001-11-01"]) await db.query("select public.generate_occurrences($1)", [m]);
        await db.query("update public.transactions set status='realized' where recurrence_id=$1 and occurrence_month='2001-10-01'", [legacyRule]);
        await db.query("update public.transactions set deleted_at=now() where recurrence_id=$1 and occurrence_month='2001-11-01'", [legacyRule]);
        await db.exec("reset role");
      }
      if (file === "202609140004_account_deletion.sql") {
        // Nome arbitrário e ação antiga: a migração deve inspecionar o catálogo.
        const fk = (await rows("select conname from pg_constraint where conrelid='public.profiles'::regclass and confrelid='auth.users'::regclass"))[0].conname;
        await db.exec(`alter table public.profiles drop constraint "${fk.replaceAll('"', '""')}";
          alter table public.profiles add constraint custom_owner_reference foreign key(user_id) references auth.users(id);`);
      }
      await db.exec(await readFile(new URL("../supabase/migrations/" + file, import.meta.url), "utf8"));
    }
    await db.query("insert into auth.users(id) values ($1)", [b]);
    await asUser(a);
    const ownCategories = await rows("select * from public.categories");
    const ca = ownCategories.find((c) => c.type === "expense").id;
    const incomeCategory = ownCategories.find((c) => c.type === "income").id;
    await asUser(b);
    const cb = (await rows("select id from public.categories where type='expense'"))[0].id;
    await asUser(a);

    await t.test("papel autenticado sem bypass, backfill e inicialização repetida", async () => {
      assert.equal((await rows("select current_user as role"))[0].role, "authenticated");
      assert.equal((await rows("select rolbypassrls from pg_roles where rolname=current_user"))[0].rolbypassrls, false);
      assert.equal(ownCategories.length, 8);
      await db.exec("select public.initialize_finance(); select public.initialize_finance();");
      assert.equal((await rows("select * from public.categories")).length, 8);
      assert.equal((await rows("select * from public.profiles")).length, 1);
      await asUser(b);
      assert.equal((await rows("select * from public.categories")).length, 8);
      await asUser(a);
    });
    await t.test("migração incremental adapta previsões antigas sem alterar realizados ou exclusões", async () => {
      const before = await rows("select * from public.transactions where recurrence_id=$1 order by occurrence_month", [legacyRule]);
      assert.equal(before.length, 3);
      assert.deepEqual(before.map((r) => r.auto_realize), [true, false, false]);
      assert.deepEqual(before.map((r) => r.status), ["planned", "realized", "planned"]);
      await asUser(b);
      await db.exec("select public.generate_occurrences('2001-09-01')");
      assert.equal((await rows("select * from public.transactions where recurrence_id=$1", [legacyRule])).length, 0);
      await asUser(a);
      assert.equal((await rows("select status from public.transactions where id=$1", [before[0].id]))[0].status, "planned");
      for (let i=0;i<2;i++) await db.exec("select public.generate_occurrences('2001-09-01')");
      const after = await rows("select * from public.transactions where recurrence_id=$1 order by occurrence_month", [legacyRule]);
      assert.deepEqual(after.map((r) => r.id), before.map((r) => r.id));
      assert.deepEqual(after.map((r) => r.status), ["realized", "realized", "planned"]);
      assert.deepEqual(after[2].deleted_at, before[2].deleted_at);
    });
    await t.test("receitas recorrentes usam a data do perfil e preservam ajuste manual", async () => {
      const dates = (await rows("select (now() at time zone 'Pacific/Kiritimati')::date::text as ahead, (now() at time zone 'Etc/GMT+12')::date::text as behind"))[0];
      assert.ok(dates.ahead > dates.behind);
      const target = dates.ahead.slice(0, 7) + "-01";
      const day = Number(dates.ahead.slice(8));
      await db.exec("update public.profiles set timezone='Etc/GMT+12'");
      const income = (await rows("insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month) values($1,'income',700,$2,$3,$3) returning id", [incomeCategory, day, target]))[0].id;
      await db.query("select public.generate_occurrences($1)", [target]);
      const pending = (await rows("select * from public.transactions where recurrence_id=$1", [income]))[0];
      assert.equal(pending.status, "planned");
      assert.equal(pending.auto_realize, true);
      await db.exec("update public.profiles set timezone='Pacific/Kiritimati'");
      for (let i=0;i<2;i++) await db.query("select public.generate_occurrences($1)", [target]);
      const realized = await rows("select * from public.transactions where recurrence_id=$1", [income]);
      assert.equal(realized.length, 1);
      assert.equal(realized[0].id, pending.id);
      assert.equal(realized[0].status, "realized");
      await db.query("update public.transactions set status='planned',auto_realize=false where id=$1", [pending.id]);
      await db.query("select public.generate_occurrences($1)", [target]);
      assert.equal((await rows("select status from public.transactions where id=$1", [pending.id]))[0].status, "planned");
      // Before editing a rule, a due automatic income becomes a historical snapshot.
      await db.query("update public.transactions set auto_realize=true where id=$1", [pending.id]);
      await db.query("update public.recurrences set amount=900 where id=$1", [income]);
      const frozen = (await rows("select * from public.transactions where id=$1", [pending.id]))[0];
      assert.equal(frozen.status, "realized");
      assert.equal(Number(frozen.amount), 700);
      // New past income is realized; past expenses still require confirmation.
      const pastIncome = (await rows("insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month) values($1,'income',100,5,'2001-09-01',$2) returning id", [incomeCategory, target]))[0].id;
      const pastExpense = (await rows("insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month,expense_kind) values($1,'expense',100,5,'2001-09-01',$2,'fixed') returning id", [ca, target]))[0].id;
      await db.exec("select public.generate_occurrences('2001-09-01')");
      assert.equal((await rows("select status from public.transactions where recurrence_id=$1", [pastIncome]))[0].status, "realized");
      assert.equal((await rows("select status from public.transactions where recurrence_id=$1", [pastExpense]))[0].status, "planned");
      await assert.rejects(db.query("update public.transactions set auto_realize=true where recurrence_id=$1", [pastExpense]));
      await db.query("update public.transactions set status='planned',deleted_at=now() where id=$1", [pending.id]);
      await db.query("select public.generate_occurrences($1)", [target]);
      assert.equal((await rows("select status from public.transactions where id=$1", [pending.id]))[0].status, "planned");
      await db.exec("update public.profiles set timezone='America/Sao_Paulo'");
    });
    const month = (await rows("select date_trunc('month',now() at time zone 'America/Sao_Paulo')::date::text as month"))[0].month;
    const nextMonth = (await rows("select ($1::date + interval '1 month')::date::text as month", [month]))[0].month;
    let tx, budget, rule;
    await t.test("usuário cria registros próprios e não associa categorias alheias", async () => {
      tx = (await rows("insert into public.transactions(category_id,type,amount,date,expense_kind) values($1,'expense',100,$2,'variable') returning id", [ca, month]))[0].id;
      budget = (await rows("insert into public.budgets(month,category_id,amount) values($1,$2,500) returning id", [month, ca]))[0].id;
      rule = (await rows("insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month,expense_kind) values($1,'expense',200,31,$2,$2,'fixed') returning id", [ca, month]))[0].id;
      await assert.rejects(db.query("insert into public.transactions(user_id,category_id,type,amount,date,expense_kind) values($1,$2,'expense',100,$3,'variable')", [b, cb, month]));
      await assert.rejects(db.query("insert into public.transactions(category_id,type,amount,date,expense_kind) values($1,'expense',100,$2,'variable')", [cb, month]));
      await assert.rejects(db.query("insert into public.budgets(month,category_id,amount) values($1,$2,500)", [month, cb]));
      await assert.rejects(db.query("insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month,expense_kind) values($1,'expense',200,1,$2,$2,'fixed')", [cb, month]));
      await assert.rejects(db.query("insert into public.transactions(category_id,type,amount,date,expense_kind) values($1,'expense',100,$2,'variable')", [incomeCategory, month]));
    });
    await t.test("constraints rejeitam proprietário alterado, nulos, valores e datas inválidos", async () => {
      await assert.rejects(db.query("update public.transactions set user_id=$1 where id=$2", [b, tx]));
      await assert.rejects(db.query("update public.profiles set user_id=$1", [b]));
      await assert.rejects(db.query("update public.categories set user_id=$1 where id=$2", [b, ca]));
      await assert.rejects(db.query("update public.budgets set user_id=$1 where id=$2", [b, budget]));
      await assert.rejects(db.query("update public.recurrences set user_id=$1 where id=$2", [b, rule]));
      await assert.rejects(db.query("update public.transactions set category_id=$1 where id=$2", [cb, tx]));
      await assert.rejects(db.query("update public.transactions set amount=0 where id=$1", [tx]));
      await assert.rejects(db.query("update public.transactions set amount=100000000000 where id=$1", [tx]));
      await assert.rejects(db.query("update public.transactions set expense_kind=null where id=$1", [tx]));
      await assert.rejects(db.query("update public.transactions set date='2026-02-30' where id=$1", [tx]));
      await assert.rejects(db.exec("update public.profiles set timezone='Not/A_Zone'"));
      await assert.rejects(db.query("update public.budgets set category_id=$1 where id=$2", [cb, budget]));
      await assert.rejects(db.query("update public.recurrences set category_id=$1 where id=$2", [cb, rule]));
    });
    await t.test("conta B não lê, edita ou exclui IDs da conta A", async () => {
      await asUser(b);
      for (const [table, id] of [["transactions", tx], ["categories", ca], ["recurrences", rule], ["budgets", budget]]) {
        assert.equal((await rows("select * from public." + table + " where id=$1", [id])).length, 0);
        assert.equal((await rows("update public." + table + " set user_id=$1 where id=$2 returning id", [b, id])).length, 0);
      }
      assert.equal((await rows("select * from public.profiles where user_id=$1", [a])).length, 0);
      assert.equal((await rows("update public.profiles set name='invasão' where user_id=$1 returning user_id", [a])).length, 0);
      for (const [table, id] of [["transactions", tx], ["budgets", budget]]) assert.equal((await rows("delete from public." + table + " where id=$1 returning id", [id])).length, 0);
      await assert.rejects(db.query("insert into public.transactions(category_id,type,amount,date,expense_kind,recurrence_id,occurrence_month) values($1,'expense',100,$2,'fixed',$3,$2)", [cb, month, rule]));
      for (const table of ["profiles", "categories", "recurrences"]) await assert.rejects(db.exec("delete from public." + table));
      await asUser(a);
      assert.equal((await rows("select * from public.transactions where id=$1", [tx])).length, 1);
    });
    await t.test("visitante não lê, insere, edita, exclui ou executa RPCs", async () => {
      await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
      for (const table of ["profiles", "categories", "transactions", "recurrences", "budgets"]) {
        for (const sql of ["select * from public." + table, "insert into public." + table + " default values", "update public." + table + " set user_id=null", "delete from public." + table]) await assert.rejects(db.exec(sql));
      }
      await assert.rejects(db.exec("select public.initialize_finance()"));
      await assert.rejects(db.query("select public.generate_occurrences($1)", [month]));
      await assert.rejects(db.query("select public.save_budget($1,null,100)", [month]));
      await assert.rejects(db.exec("select public.finance_new_user()"));
      await asUser(a);
    });
    await t.test("recorrências geram uma ocorrência por mês e ajustam fevereiro", async () => {
      await db.query("select public.generate_occurrences($1)", [month]);
      await db.query("select public.generate_occurrences($1)", [month]);
      assert.equal((await rows("select * from public.transactions where recurrence_id=$1", [rule])).length, 1);
      assert.equal((await rows("select public.finance_due_date('2024-02-01',31)::text as date"))[0].date, "2024-02-29");
      assert.equal((await rows("select public.finance_due_date('2025-02-01',31)::text as date"))[0].date, "2025-02-28");
      const occurrence = (await rows("select id from public.transactions where recurrence_id=$1", [rule]))[0].id;
      await db.query("update public.transactions set status='realized' where id=$1", [occurrence]);
      await db.query("select public.generate_occurrences($1)", [nextMonth]);
      await db.query("update public.recurrences set amount=300,effective_month=$1 where id=$2", [month, rule]);
      assert.equal(Number((await rows("select amount from public.transactions where id=$1", [occurrence]))[0].amount), 200);
      const future = (await rows("select * from public.transactions where recurrence_id=$1 and occurrence_month=$2", [rule, nextMonth]))[0];
      assert.equal(Number(future.amount), 300);
      await db.query("update public.transactions set deleted_at=now() where id=$1", [future.id]);
      await db.query("select public.generate_occurrences($1)", [nextMonth]);
      assert.equal((await rows("select * from public.transactions where recurrence_id=$1 and occurrence_month=$2", [rule, nextMonth])).length, 1);
      assert.equal((await rows("select * from public.transactions where recurrence_id=$1 and occurrence_month=$2 and deleted_at is null", [rule, nextMonth])).length, 0);
      await assert.rejects(db.query("update public.recurrences set effective_month='2000-01-01',amount=400 where id=$1", [rule]));
    });
    await t.test("orçamento não configurado difere de zero e setup é atômico e repetível", async () => {
      await db.query("select public.save_budget($1,null,0)", [month]);
      await db.query("select public.save_budget($1,null,0)", [month]);
      assert.equal((await rows("select * from public.budgets where category_id is null")).length, 1);
      await db.query("select public.save_budget($1,null,null)", [month]);
      assert.equal((await rows("select * from public.budgets where category_id is null")).length, 0);
      for (let i=0;i<2;i++) await db.query("select public.save_initial_setup($1,1000,200,500,$2,$3,31)", [month, incomeCategory, ca]);
      assert.equal((await rows("select * from public.recurrences where setup_key is not null")).length, 2);
      await assert.rejects(db.query("select public.save_initial_setup($1,1000,200,999,$2,$3,31)", [month, cb, ca]));
      assert.equal(Number((await rows("select amount from public.budgets where category_id is null and month=$1", [month]))[0].amount), 500);
      assert.equal((await rows("select onboarding_completed from public.profiles"))[0].onboarding_completed, true);
    });
    await t.test("edição futura preserva a versão de meses ainda não consultados", async () => {
      const original = (await rows("insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month,expense_kind) values($1,'expense',111,10,$2,$2,'fixed') returning id", [ca, month]))[0].id;
      await db.query("update public.recurrences set amount=222,effective_month=$1 where id=$2", [nextMonth, original]);
      await db.query("select public.generate_occurrences($1)", [month]);
      await db.query("select public.generate_occurrences($1)", [nextMonth]);
      assert.equal(Number((await rows("select amount from public.transactions where recurrence_id=$1 and occurrence_month=$2", [original, month]))[0].amount), 111);
      assert.equal(Number((await rows("select amount from public.transactions where recurrence_id=$1 and occurrence_month=$2", [original, nextMonth]))[0].amount), 222);
      await assert.rejects(db.query("update public.recurrences set revisions='[]' where id=$1", [original]));
      await db.query("update public.recurrences set active=false,effective_month=$1 where id=$2", [nextMonth, original]);
      await db.query("select public.generate_occurrences($1)", [nextMonth]);
      assert.equal((await rows("select * from public.transactions where recurrence_id=$1 and occurrence_month=$2", [original, nextMonth])).length, 0);
      assert.equal((await rows("select * from public.transactions where recurrence_id=$1 and occurrence_month=$2", [original, month])).length, 1);
    });
    await t.test("arquivamento preserva histórico e bloqueia novas associações", async () => {
      await db.query("update public.categories set active=false where id=$1", [ca]);
      await db.exec("select public.initialize_finance()");
      assert.equal((await rows("select active from public.categories where id=$1", [ca]))[0].active, false);
      await assert.rejects(db.query("insert into public.transactions(category_id,type,amount,date,expense_kind) values($1,'expense',100,$2,'variable')", [ca, month]));
      await db.query("update public.transactions set description='Editado' where id=$1", [tx]);
      await db.query("select public.save_budget($1,$2,600)", [month, ca]);
      assert.equal(Number((await rows("select amount from public.budgets where id=$1", [budget]))[0].amount), 600);
      assert.equal((await rows("delete from public.transactions where id=$1 returning id", [tx])).length, 1);
      assert.equal((await rows("delete from public.budgets where id=$1 returning id", [budget])).length, 1);
    });
    await t.test("migração de exclusão preserva dados, mantém RLS e encontra nomes de FK pelo catálogo", async () => {
      await db.exec("reset role");
      const tables = ["profiles", "categories", "transactions", "recurrences", "budgets"];
      const before = {};
      for (const table of tables) before[table] = (await rows(`select count(*)::int as n from public.${table}`))[0].n;
      await db.exec(await readFile(new URL("../supabase/migrations/202609140004_account_deletion.sql", import.meta.url), "utf8"));
      for (const table of tables) {
        assert.equal((await rows(`select count(*)::int as n from public.${table}`))[0].n, before[table]);
        assert.equal((await rows("select relrowsecurity from pg_class where oid=$1::regclass", [`public.${table}`]))[0].relrowsecurity, true);
        const fks = await rows("select confdeltype, convalidated from pg_constraint where conrelid=$1::regclass and confrelid='auth.users'::regclass and contype='f'", [`public.${table}`]);
        assert.ok(fks.length > 0);
        assert.ok(fks.every((fk) => fk.confdeltype === "c" && fk.convalidated));
      }
      assert.equal((await rows("select confdeltype from pg_constraint where conname='custom_owner_reference'"))[0].confdeltype, "c");
      await asUser(a);
    });
    await t.test("tabela extra de convites sem user_id exige revisão e não é apagada", async () => {
      await db.exec("reset role; create table public.invitations(email text, sender uuid references auth.users(id))");
      await db.query("insert into public.invitations values('convite@example.com',$1)", [a]);
      await assert.rejects(db.exec(await readFile(new URL("../supabase/migrations/202609140004_account_deletion.sql", import.meta.url), "utf8")), /Revise a propriedade/);
      await db.exec("rollback");
      assert.equal((await rows("select * from public.invitations")).length, 1);
      await db.exec("drop table public.invitations");
      await asUser(a);
    });
    await t.test("inventário Storage é exclusivo do serviço e usa proprietário, não nomes de pastas", async () => {
      await db.exec("reset role");
      await db.query("insert into storage.objects values ('files','nested/a.pdf',$1,null),('files','legacy.pdf',null,$1::uuid),('files',$1 || '/foreign.pdf',$2,null),('files','without-owner.pdf',null,null),('avatars','current-owner.png',$2,$1::uuid)", [a, b]);
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`reset role; set role ${role}`);
        await assert.rejects(db.query("select * from public.account_owned_storage_objects($1)", [a]));
        await assert.rejects(db.query("delete from auth.users where id=$1", [b]));
      }
      await db.exec("reset role; set role service_role");
      assert.deepEqual((await rows("select * from public.account_owned_storage_objects($1)", [a])).map((r) => r.name), ["legacy.pdf", "nested/a.pdf"]);
      assert.equal((await rows("select * from public.account_owned_storage_objects($1)", [b])).length, 2);
      await db.exec("reset role");
      assert.equal((await rows("select * from storage.objects")).length, 5); // Função somente leitura.
      await asUser(a);
    });
    await t.test("excluir usuário no Auth remove todos os dados próprios por cascade e preserva conta B", async () => {
      await asUser(b);
      const otherIncome = (await rows("select id from public.categories where type='income' limit 1"))[0].id;
      await db.query("select public.save_initial_setup($1,2000,300,700,$2,$3,15)", [month, otherIncome, cb]);
      await db.exec("reset role");
      const tables = ["profiles", "categories", "transactions", "recurrences", "budgets"];
      const otherBefore = {};
      for (const table of tables) {
        assert.ok((await rows(`select count(*)::int as n from public.${table} where user_id=$1`, [a]))[0].n > 0, table);
        otherBefore[table] = await rows(`select * from public.${table} where user_id=$1 order by ${table === "profiles" ? "user_id" : "id"}`, [b]);
        assert.ok(otherBefore[table].length > 0, `Conta B também tem dados em ${table}`);
      }
      // Simula apenas o efeito SQL do Auth administrativo; não é teste RLS.
      // Storage real é removido pela API antes, testada com falhas em account-deletion.spec.ts.
      await db.query("delete from auth.users where id=$1", [a]);
      assert.equal((await rows("select * from auth.users where id=$1", [a])).length, 0);
      assert.equal((await rows("select * from auth.users where id=$1", [b])).length, 1);
      for (const table of tables) {
        assert.equal((await rows(`select * from public.${table} where user_id=$1`, [a])).length, 0, table);
        assert.deepEqual(await rows(`select * from public.${table} where user_id=$1 order by ${table === "profiles" ? "user_id" : "id"}`, [b]), otherBefore[table]);
      }
      // Mesmo um JWT antigo com sub=A não pode recriar o perfil após a exclusão.
      await asUser(a);
      for (const table of tables) assert.equal((await rows(`select * from public.${table}`)).length, 0);
      await assert.rejects(db.exec("select public.initialize_finance()"));
      await assert.rejects(db.exec("insert into public.profiles(name) values('Tentativa de recriar')"));
    });
  } finally { await db.close(); }
});
