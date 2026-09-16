import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("parcelamentos atômicos, histórico pago, RLS e cascade em PostgreSQL local", async (t) => {
  const db = await PGlite.create();
  const a = randomUUID(), b = randomUUID();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  async function asUser(id) {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  }
  const args = (category, patch = {}) => ({ request: randomUUID(), category, description: "Compra de teste", total: 10000, count: 3, purchase: "2025-01-10", first: "2025-01-31", method: "Boleto", kind: "variable", ...patch });
  async function create(p) {
    return (await rows("select public.create_installment_plan($1,$2,$3,$4,$5,$6,$7,$8,$9) as id", Object.values(p)))[0].id;
  }
  async function edit(id, p, confirmed = true) {
    await db.query("select public.edit_installment_plan($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [id, p.category, p.description, p.total, p.count, p.purchase, p.first, p.method, p.kind, confirmed]);
  }
  const schedule = (id) => rows("select * from public.transactions where installment_plan_id=$1 order by installment_number", [id]);
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      grant usage on schema auth,public to anon,authenticated;
    `);
    const folder = new URL("../supabase/migrations/", import.meta.url);
    let legacy;
    for (const name of (await readdir(folder)).filter((f) => f.endsWith(".sql")).sort()) {
      if (name === "202609160005_installments.sql") {
        await db.query("insert into auth.users(id) values($1),($2)", [a,b]);
        await asUser(a);
        legacy=(await rows("insert into public.transactions(category_id,type,amount,description,date,status,expense_kind) select id,'expense',123,'Legado','2024-12-15','realized','variable' from public.categories where type='expense' limit 1 returning *"))[0];
        await db.exec("reset role");
      }
      await db.exec(await readFile(new URL(name, folder), "utf8"));
    }
    await asUser(a);
    const ca = (await rows("select id from public.categories where type='expense' order by id limit 1"))[0].id;
    const otherCa = (await rows("select id from public.categories where type='expense' order by id limit 1 offset 1"))[0].id;
    const incomeA = (await rows("select id from public.categories where type='income' limit 1"))[0].id;
    const pa = args(ca);
    let idA, paidId;
    await asUser(b);
    const cb = (await rows("select id from public.categories where type='expense' limit 1"))[0].id;
    const pb = args(cb);
    const idB = await create(pb);
    const txB = (await schedule(idB))[0].id;
    await asUser(a);

    await t.test("migração incremental preserva dados e campos de lançamentos anteriores", async () => {
      const after=(await rows("select * from public.transactions where id=$1",[legacy.id]))[0];
      for (const key of Object.keys(legacy)) assert.deepEqual(after[key],legacy[key],key);
      for (const key of ['installment_plan_id','installment_number','total_installments','due_date','payment_date','scheduled_amount_cents']) assert.equal(after[key],null,key);
      await db.query("update public.transactions set amount=124 where id=$1",[legacy.id]);
    });

    await t.test("100 reais em 3x, vencimentos ancorados em 31 de janeiro e soma exata", async () => {
      idA = await create(pa);
      const list = await schedule(idA);
      assert.deepEqual(list.map((r) => Number(r.amount)), [3333,3333,3334]);
      assert.equal(list.reduce((sum, r) => sum+Number(r.amount),0),10000);
      assert.deepEqual(list.map((r) => r.due_date.toISOString().slice(0,10)), ["2025-01-31","2025-02-28","2025-03-31"]);
      assert.ok(list.every((r) => r.status==='planned' && r.type==='expense' && r.user_id===a && !r.payment_date));
      assert.deepEqual(list.map((r) => r.installment_number), [1,2,3]);
      const leap = await create(args(ca, { first: "2024-01-31", purchase:"2024-01-01" }));
      assert.deepEqual((await schedule(leap)).map((r) => r.due_date.toISOString().slice(0,10)), ["2024-01-31","2024-02-29","2024-03-31"]);
      const small = await create(args(ca, { total:5,count:2 }));
      assert.deepEqual((await schedule(small)).map((r) => Number(r.amount)), [2,3]);
    });
    await t.test("reenvios da mesma chave não duplicam; payload diferente é recusado", async () => {
      const before = await schedule(idA);
      for (let i=0;i<3;i++) assert.equal(await create(pa), idA);
      assert.deepEqual(await schedule(idA),before);
      await assert.rejects(create({ ...pa,total:20000 }), (error) => error.code==='P1101');
      assert.equal((await rows("select * from public.installment_requests where client_request_id=$1", [pa.request])).length,1);
    });
    await t.test("constraints e RLS validam entradas também em chamadas diretas", async () => {
      for (const patch of [{total:1,count:2},{count:1},{count:61},{count:null},{total:0},{total:null},{purchase:null},{first:"2024-01-01"},{first:"2100-12-31"},{description:""},{method:"x".repeat(61)},{category:cb},{category:incomeA},{kind:"other"}]) {
        const p = args(ca,patch);
        await assert.rejects(create(p));
        assert.equal((await rows("select * from public.installment_requests where client_request_id=$1", [p.request])).length,0);
      }
      await assert.rejects(db.query("update public.installment_plans set user_id=$1 where id=$2", [b,idA]));
      await assert.rejects(db.query("update public.installment_plans set category_id=$1 where id=$2", [cb,idA]));
      await assert.rejects(db.query("update public.installment_plans set total_amount_cents=12345 where id=$1", [idA]));
      const tx = (await schedule(idA))[0];
      await assert.rejects(db.query("update public.transactions set installment_plan_id=$1 where id=$2", [idB,tx.id]));
      await assert.rejects(db.query("delete from public.transactions where id=$1", [tx.id]));
      await assert.rejects(db.query("update public.transactions set installment_number=2 where id=$1", [tx.id]));
      await assert.rejects(db.query("update public.transactions set amount=amount+1 where id=$1", [tx.id]));
      await assert.rejects(db.query("insert into public.transactions(category_id,type,amount,date,status,expense_kind,installment_plan_id,installment_number,total_installments,due_date,scheduled_amount_cents) values($1,'expense',3333,'2025-01-31','planned','variable',$2,1,3,'2025-01-31',3333)", [ca,idB]));
    });
    await t.test("falha na segunda parcela reverte plano, parcelas e chave de idempotência", async () => {
      await db.exec(`reset role;
        create function public.test_installment_failure() returns trigger language plpgsql as $$ begin if new.description='Falha simulada' and new.installment_number=2 then raise exception 'simulated failure'; end if; return new; end $$;
        create trigger test_installment_failure before insert on public.transactions for each row execute function public.test_installment_failure();`);
      await asUser(a);
      const p = args(ca,{ description:"Falha simulada" });
      await assert.rejects(create(p), /simulated failure/);
      assert.equal((await rows("select * from public.installment_plans where client_request_id=$1", [p.request])).length,0);
      assert.equal((await rows("select * from public.installment_requests where client_request_id=$1", [p.request])).length,0);
      assert.equal((await rows("select * from public.transactions where description='Falha simulada'")).length,0);
      const before = await schedule(idA);
      await assert.rejects(edit(idA,{ ...pa,description:"Falha simulada",count:4 }));
      assert.deepEqual(await schedule(idA),before);
      await db.exec("reset role; drop trigger test_installment_failure on public.transactions; drop function public.test_installment_failure()");
      await asUser(a);
      assert.ok(await create(p));
    });
    await t.test("plano não pago pode ser regenerado e excluído; retry tardio não o recria", async () => {
      const p = args(ca), id = await create(p);
      await assert.rejects(edit(id,{ ...p,total:5,count:2 },false));
      await edit(id, { ...p,total:5,count:2,first:"2025-02-28" });
      assert.deepEqual((await schedule(id)).map((r) => Number(r.amount)),[2,3]);
      assert.deepEqual((await schedule(id)).map((r) => r.due_date.toISOString().slice(0,10)),["2025-02-28","2025-03-28"]);
      await assert.rejects(db.query("select public.delete_installment_plan($1,false)",[id]));
      await db.query("select public.delete_installment_plan($1,true)",[id]);
      assert.equal((await schedule(id)).length,0);
      await assert.rejects(create(p),(error) => error.code==='P1101');
    });
    await t.test("pagar mantém ID, número e vencimento; usa valor e data efetivos sem duplicar", async () => {
      const original = (await schedule(idA))[0]; paidId=original.id;
      await db.query("select public.pay_installment($1,'2025-02-05',3500)",[paidId]);
      await db.query("select public.pay_installment($1,'2025-02-05',3500)",[paidId]);
      const paid = (await schedule(idA))[0];
      assert.equal(paid.id,original.id); assert.equal(paid.installment_number,1);
      assert.equal(Number(paid.scheduled_amount_cents),3333); assert.equal(Number(paid.amount),3500);
      assert.equal(paid.due_date.toISOString().slice(0,10),"2025-01-31");
      assert.equal(paid.payment_date.toISOString().slice(0,10),"2025-02-05");
      assert.equal(paid.date.toISOString().slice(0,10),"2025-02-05"); assert.equal(paid.status,"realized");
      assert.equal((await schedule(idA)).length,3);
      await assert.rejects(db.query("select public.pay_installment($1,'2025-02-05',3501)",[paidId]));
      await assert.rejects(db.query("select public.pay_installment($1,'2100-01-01',3500)",[(await schedule(idA))[1].id]));
      await assert.rejects(db.query("select public.pay_installment($1,'2020-01-01',3500)",[(await schedule(idA))[1].id]));
    });
    await t.test("paga é imutável; edição segura afeta só não pagas; cancelamento mantém histórico", async () => {
      const paid = (await schedule(idA))[0];
      await assert.rejects(edit(idA,{ ...pa,total:15000 }));
      await assert.rejects(db.query("select public.delete_installment_plan($1,true)",[idA]));
      await assert.rejects(db.query("delete from public.installment_plans where id=$1",[idA]));
      await assert.rejects(db.query("delete from public.transactions where id=$1",[paidId]));
      await assert.rejects(db.query("update public.transactions set deleted_at=now() where id=$1",[paidId]));
      await assert.rejects(db.query("update public.transactions set status='planned',payment_date=null,date=due_date,amount=scheduled_amount_cents where id=$1",[paidId]));
      await edit(idA,{ ...pa,category:otherCa,description:"Compra editada",kind:"fixed" });
      assert.deepEqual((await schedule(idA))[0],paid);
      assert.ok((await schedule(idA)).slice(1).every((r) => r.description==='Compra editada' && r.category_id===otherCa));
      await assert.rejects(db.query("select public.cancel_installment_plan($1,false)",[idA]));
      await db.query("select public.cancel_installment_plan($1,true)",[idA]);
      await db.query("select public.cancel_installment_plan($1,true)",[idA]);
      const after = await schedule(idA);
      assert.deepEqual(after[0],paid); assert.equal(after.length,3);
      assert.ok(after.slice(1).every((r) => r.deleted_at && r.status==='planned'));
      await assert.rejects(db.query("select public.pay_installment($1,'2025-03-01',3333)",[after[1].id]));
      await assert.rejects(db.query("update public.transactions set deleted_at=null where id=$1",[after[1].id]));
    });
    await t.test("duas contas não leem, editam, pagam, cancelam, excluem ou vinculam dados alheios", async () => {
      assert.equal((await rows("select * from public.installment_plans where id=$1",[idB])).length,0);
      assert.equal((await rows("select * from public.transactions where id=$1",[txB])).length,0);
      assert.equal((await rows("select * from public.installment_requests where user_id=$1",[b])).length,0);
      assert.equal((await rows("update public.installment_plans set description='ataque' where id=$1 returning id",[idB])).length,0);
      assert.equal((await rows("delete from public.installment_plans where id=$1 returning id",[idB])).length,0);
      for (const sql of ["select public.pay_installment($1,'2025-02-01',3333)","select public.cancel_installment_plan($1,true)","select public.delete_installment_plan($1,true)"]) await assert.rejects(db.query(sql,[sql.includes('pay_installment')?txB:idB]));
      await assert.rejects(edit(idB,pa));
      await assert.rejects(db.query("insert into public.installment_requests(user_id,client_request_id,plan_id,payload_hash) values($1,$2,$3,sha256('test'::bytea))",[b,randomUUID(),randomUUID()]));
      await asUser(b);
      assert.equal((await rows("select * from public.installment_plans where id=$1",[idA])).length,0);
      assert.equal((await schedule(idB)).length,3);
      await asUser(a);
    });
    await t.test("visitante não acessa tabelas ou RPCs", async () => {
      await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
      for (const table of ['installment_plans','installment_requests']) for (const sql of [`select * from public.${table}`,`insert into public.${table} default values`,`update public.${table} set user_id=null`,`delete from public.${table}`]) await assert.rejects(db.exec(sql));
      await assert.rejects(create(pa)); await assert.rejects(edit(idA,pa));
      for (const sql of ["select public.pay_installment($1,'2025-01-31',3333)","select public.cancel_installment_plan($1,true)","select public.delete_installment_plan($1,true)","select public.finance_installment_rows($1)"]) await assert.rejects(db.query(sql,[idA]));
      await asUser(a);
    });
    await t.test("exclusão da conta remove planos, parcelas pagas/canceladas e chaves; preserva B", async () => {
      await db.exec("reset role");
      const tables=['profiles','categories','transactions','recurrences','budgets','installment_plans','installment_requests'];
      const before={};
      for (const table of tables) before[table]=await rows(`select * from public.${table} where user_id=$1`,[b]);
      assert.ok((await rows("select * from public.installment_plans where user_id=$1",[a])).length>0);
      assert.ok((await rows("select * from public.transactions where user_id=$1 and status='realized'",[a])).length>0);
      // Simulate Auth's restricted database role, without financial table grants.
      // This is cascade verification, separate from the anon/authenticated RLS tests.
      await db.exec("create role auth_deleter nologin; grant usage on schema auth to auth_deleter; grant select,delete on auth.users to auth_deleter; set role auth_deleter");
      await db.query("delete from auth.users where id=$1",[a]);
      await db.exec("reset role");
      for (const table of tables) {
        assert.equal((await rows(`select * from public.${table} where user_id=$1`,[a])).length,0,table);
        assert.deepEqual(await rows(`select * from public.${table} where user_id=$1`,[b]),before[table]);
      }
      assert.equal((await rows("select * from auth.users where id=$1",[b])).length,1);
    });
  } finally { await db.close(); }
});
