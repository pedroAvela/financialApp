import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { databaseFixture, A, B, personalTables } from "./helpers/security-database.mjs";
import { findingsIn } from "./security-scan.mjs";

const context = new AsyncLocalStorage();
globalThis.__securityTestContext = () => context.getStore();
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
let app;
async function compile() {
  const outfile = path.resolve("node_modules/.cache/security-tests/entry.cjs");
  await build({ entryPoints: ["tests/fixtures/security-server-entry.ts"], outfile, bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{
    name: "local-test-infrastructure-only",
    setup(b) {
      b.onResolve({ filter: /^(server-only|next\/headers|@supabase\/supabase-js|@supabase\/ssr)$|(?:^@\/lib\/supabase\/|^\.\/supabase\/)(server|admin|config)$/ }, (args) => ({ path: args.path, namespace: "test-only" }));
      b.onLoad({ filter: /.*/, namespace: "test-only" }, ({ path: p }) => {
        let contents = "export {};";
        if (p.endsWith("/server")) contents = "export const createClient = async () => globalThis.__securityTestContext().client;";
        if (p.endsWith("/admin")) contents = "export const createAdminClient = () => globalThis.__securityTestContext().admin;";
        if (p.endsWith("/config")) contents = "export const getSupabaseConfig = () => ({ url: 'http://local.invalid', key: 'sb_publishable_local_fixture' });";
        if (p === "@supabase/supabase-js") contents = "export const createClient = () => globalThis.__securityTestContext().verification;";
        if (p === "@supabase/ssr") contents = "export const createServerClient = (url,key,options) => { const context=globalThis.__securityTestContext(); if(context.refreshCookies) options.cookies.setAll(context.refreshCookies); return context.client; };";
        if (p === "next/headers") contents = "export const cookies = async () => ({getAll:()=>[],set:()=>{}});";
        return { contents, loader: "js" };
      });
    },
  }] });
  return require(outfile);
}

test("integração local: Route Handlers reais + validações + PostgreSQL com RLS", async (t) => {
  app = await compile();
  const f = await databaseFixture();
  const sessions = new Map();
  const files = [{ user: A, bucket_id: "private-fixture", name: "file-a" }, { user: B, bucket_id: "private-fixture", name: "file-b" }];
  let failFiles = false, verifiedAs = null, adminCalls = 0;
  function session(uid, expired = false) {
    const client = f.client(uid, expired);
    const value = { client,
      verification: { auth: {
        async signInWithPassword({ password }) { return { data: { user: password === "local-confirmation" ? { id: verifiedAs ?? uid, email: "fixture@example.invalid" } : null }, error: null }; },
        async signOut() { return { error: null }; },
      } },
      admin: {
        async rpc(name, { p_user_id }) { assert.equal(name,"account_owned_storage_objects"); return { data: files.filter((v) => v.user === p_user_id), error: null }; },
        storage: { from(bucket) { return { async remove(paths) { if (failFiles) return { error: {} }; for (let i=files.length-1;i>=0;i--) if (files[i].bucket_id===bucket && paths.includes(files[i].name)) files.splice(i,1); return { error: null }; } }; } },
        auth: { admin: { async deleteUser(id, soft) { adminCalls++; assert.equal(id,uid); assert.equal(soft,false); const result = await f.execute("admin","delete from auth.users where id=$1",[id]); return { error: result.error }; } } },
      },
    };
    return value;
  }
  sessions.set(A,session(A)); sessions.set(B,session(B));
  const call = (who, route, body, options = {}) => context.run(typeof who === "string" ? sessions.get(who) : who ?? session(null), () => {
    const request = new NextRequest(`http://localhost:3100${options.path ?? "/api/finance"}`, { method: body === undefined ? "GET" : "POST", headers: { host: "localhost:3100", origin: "http://localhost:3100", "content-type": "application/json", ...options.headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
    return route(request);
  });
  const post = (who, action, data) => call(who,app.financeRoute.POST,{action,data});
  const cat = {};
  for (const uid of [A,B]) cat[uid] = (await f.execute(uid,"select id from public.categories where default_key='other'")).data[0].id;
  const transaction = (uid, patch = {}) => ({ id: randomUUID(), category_id: cat[uid], type: "expense", amount: "12,34", date: "2025-01-10", status: "realized", expense_kind: "variable", description: "Original", ...patch });
  const purchase = (uid, patch = {}) => ({ client_request_id: randomUUID(), category_id: cat[uid], description: "Compra", total_amount: "100,00", installment_count: 3, purchase_date: "2025-01-10", first_due_date: "2025-01-31", expense_kind: "variable", ...patch });
  try {
    await t.test("corpo em chunks é limitado em bytes sem Content-Length e interrompe leitura", async () => {
      let cancelled=false;
      const stream=new ReadableStream({pull(controller){controller.enqueue(new TextEncoder().encode("á".repeat(2000)));},cancel(){cancelled=true;}});
      const request=new Request("http://local.invalid",{method:"POST",headers:{"content-type":"application/json"},body:stream,duplex:"half"});
      await assert.rejects(app.readJsonBody(request,8192),{status:413}); assert.equal(cancelled,true);
      const invalid=new Request("http://local.invalid",{method:"POST",headers:{"content-type":"application/json"},body:new Uint8Array([0xff])});
      await assert.rejects(app.readJsonBody(invalid,8192),{status:400});
    });
    await t.test("sem sessão/expirada: APIs, exportação, exclusão e proxy fecham acesso", async () => {
      for (const who of [null,session(A,true)]) {
        assert.equal((await call(who,app.financeRoute.GET)).status,401);
        assert.equal((await call(who,app.exportRoute.GET)).status,401);
        assert.equal((await call(who,app.deleteRoute.POST,{confirmation:"EXCLUIR",password:"local-confirmation"})).status,401);
        for (const pathname of ["/dashboard","/historico","/planejamento","/configuracoes","/lancamento","/configuracao-inicial"]) {
          const response = await call(who,app.proxy,undefined,{path:pathname});
          assert.equal(response.status,307); assert.equal(new URL(response.headers.get("location")).pathname,"/login");
        }
      }
      assert.equal(adminCalls,0);
    });
    await t.test("CSRF, JSON malformado, tipo e tamanho são bloqueados antes da escrita", async () => {
      const before = await f.state();
      for (const [body,headers,status] of [[{}, {origin:"https://foreign.invalid"},403], ["{",{},400], ["{}",{"content-type":"application/json-extra"},415], ["{}",{"content-length":"70000"},413], [{data:"á".repeat(40000)}, {},413]]) {
        assert.equal((await call(A,app.financeRoute.POST,body,{headers})).status,status);
      }
      assert.equal((await call(A,app.deleteRoute.POST,{password:"á".repeat(5000)})).status,413);
      assert.deepEqual(await f.state(),before);
    });
    const own = transaction(A,{user_id:B});
    await t.test("user_id forjado é ignorado; reenvio concorrente cria um único registro", async () => {
      const responses = await Promise.all([post(A,"transaction.create",own),post(A,"transaction.create",own)]);
      assert.deepEqual(responses.map((r)=>r.status),[200,200]);
      const rows = (await f.execute("admin","select * from public.transactions where id=$1",[own.id])).data;
      assert.equal(rows.length,1); assert.equal(rows[0].user_id,A);
      assert.equal((await post(A,"transaction.create",{...own,amount:"999,00"})).status,409);
      assert.equal((await post(B,"transaction.create",{...own,category_id:cat[B]})).status,409);
      assert.equal((await f.execute(A,"select amount from public.transactions where id=$1",[own.id])).data[0].amount,1234);
    });
    await t.test("IDs alheios não alteram/excluem; relacionamentos e valores são validados", async () => {
      const before = await f.state();
      for (const action of ["transaction.update","transaction.confirm","transaction.delete"]) assert.equal((await post(B,action,{...own,category_id:cat[B],confirmed:true})).status,404);
      assert.equal((await post(B,"transaction.create",transaction(B,{category_id:cat[A]}))).status,400);
      for (const amount of ["-1,00","0,00","NaN","1e9","1.000.000.000,00",12.34]) assert.equal((await post(A,"transaction.create",transaction(A,{amount}))).status,400);
      assert.deepEqual(await f.state(),before);
    });
    await t.test("perfil, categoria, recorrência e orçamento usam identidade validada", async () => {
      const before=await f.state(), categoryId=randomUUID(), recurrenceId=randomUUID();
      assert.equal((await post(A,"profile.save",{user_id:B,name:"Conta A",timezone:"America/Sao_Paulo"})).status,200);
      assert.equal((await post(A,"category.save",{id:categoryId,user_id:B,name:"Categoria A",color:"#137968",type:"expense"})).status,200);
      assert.equal((await post(A,"recurrence.save",{id:recurrenceId,user_id:B,category_id:categoryId,type:"expense",amount:"10,00",description:"Regra A",expense_kind:"fixed",day_of_month:5,start_month:"2098-01",effective_month:"2098-01"})).status,200);
      assert.equal((await post(A,"budget.save",{user_id:B,month:"2025-01",category_id:null,amount:"100,00"})).status,200);
      const after=await f.state();
      for (const table of personalTables) assert.deepEqual(after[table].filter(v=>v.row.user_id===B),before[table].filter(v=>v.row.user_id===B));
      for (const [table,id] of [["categories",categoryId],["recurrences",recurrenceId]]) assert.equal(after[table].find(v=>v.row.id===id).row.user_id,A);
      for (const [action,data] of [["category.save",{id:categoryId,existing:true,name:"Intruso",color:"#137968"}],["category.archive",{id:categoryId,state:"archived"}],["recurrence.archive",{id:recurrenceId,effective_month:"2098-01"}]]) assert.equal((await post(B,action,data)).status,404);
      assert.deepEqual(await f.state(),after);
    });
    let plan, installment;
    await t.test("parcelamentos: concorrência idempotente e IDs/categorias sem associação cruzada", async () => {
      const input = purchase(A,{user_id:B});
      assert.deepEqual((await Promise.all([post(A,"installment.create",input),post(A,"installment.create",input)])).map(r=>r.status),[200,200]);
      plan = (await f.execute(A,"select * from public.installment_plans")).data[0];
      const rows = (await f.execute(A,"select * from public.transactions where installment_plan_id=$1 order by installment_number",[plan.id])).data;
      assert.equal(rows.length,3); assert.equal(plan.user_id,A); installment=rows[0];
      const before=await f.state();
      assert.equal((await post(B,"installment.create",purchase(B,{category_id:cat[A]}))).status,400);
      for (const action of ["installment.edit","installment.cancel","installment.delete"]) assert.equal((await post(B,action,{...purchase(B),id:plan.id,confirmed:true})).status,404);
      assert.equal((await post(B,"installment.pay",{id:installment.id,payment_date:"2025-02-01",amount:"33,33"})).status,404);
      assert.deepEqual(await f.state(),before);
    });
    await t.test("falha na segunda parcela reverte plano, recibo e ocorrências pela API", async () => {
      const before=await f.state();
      await f.db.exec(`create function public.security_injected_failure() returns trigger language plpgsql as $$begin if new.installment_number=2 then raise exception 'Local fixture failure'; end if; return new; end$$;
        create trigger security_injected_failure before insert on public.transactions for each row execute function public.security_injected_failure();`);
      try { assert.equal((await post(A,"installment.create",purchase(A))).status,503); assert.deepEqual(await f.state(),before); }
      finally { await f.db.exec("drop trigger security_injected_failure on public.transactions; drop function public.security_injected_failure()"); }
    });
    await t.test("snapshot/exportação/CSV isolados A/B e sem cache compartilhado", async () => {
      const foreign = transaction(B,{description:"B_ONLY_PRIVATE"}); assert.equal((await post(B,"transaction.create",foreign)).status,200);
      for (const description of ["=1+1","+cmd","-cmd","@SUM(1)","\t=1","<script>alert(1)</script>"]) assert.equal((await post(A,"transaction.create",transaction(A,{description}))).status,200);
      const results = await Promise.all([A,B,A,B].map(async(uid)=>{
        const response=await call(uid,app.financeRoute.GET,undefined,{path:"/api/finance?month=2025-01&user_id="+(uid===A?B:A)});
        assert.equal(response.status,200); assert.match(response.headers.get("cache-control"),/private, no-store/);
        const data=await response.json(); assert.equal(data.profile.user_id,uid); assert.ok(data.transactions.every((v)=>v.user_id===uid)); return data;
      }));
      const filtered=app.filterTransactions(results[0].transactions,{search:"",type:"expense",category:"all",status:"realized",from:"2025-01-01",to:"2025-01-31"});
      const csv=app.transactionsCsv(filtered,results[0].categories);
      assert.ok(csv.startsWith("\uFEFF")); assert.ok(!csv.includes("B_ONLY_PRIVATE"));
      for (const marker of ["=1+1","+cmd","-cmd","@SUM(1)"]) assert.ok(csv.includes(`"'${marker}"`));
      for (const uid of [A,B]) {
        const response=await call(uid,app.exportRoute.GET); assert.equal(response.status,200);
        const data=await response.json(); assert.equal(data.account.id,uid);
        for (const name of ["categories","transactions","recurrences","budgets","installmentPlans","installmentRequests"]) assert.ok(data[name].every((v)=>v.user_id===uid));
      }
    });
    await t.test("CSP nonce não aceita cabeçalho cliente e HTTPS recebe HSTS", async () => {
      const one=await call(A,app.proxy,undefined,{path:"/dashboard",headers:{"x-nonce":"injected","Content-Security-Policy":"script-src *"}});
      const two=await call(B,app.proxy,undefined,{path:"/dashboard"});
      assert.match(one.headers.get("content-security-policy"),/frame-ancestors 'none'/);
      assert.ok(!one.headers.get("content-security-policy").includes("injected"));
      assert.notEqual(one.headers.get("content-security-policy"),two.headers.get("content-security-policy"));
      assert.equal(one.headers.get("strict-transport-security"),null);
      const before=process.env.NODE_ENV; process.env.NODE_ENV="production";
      try {
        const secure=await context.run(sessions.get(A),()=>app.proxy(new NextRequest("https://app.invalid/dashboard")));
        assert.equal(secure.headers.get("strict-transport-security"),"max-age=31536000");
        const refreshed=await context.run({...sessions.get(A),refreshCookies:[{name:"session-fixture",value:"renewed-fixture",options:{path:"/",httpOnly:true,secure:true}}]},()=>app.proxy(new NextRequest("https://app.invalid/dashboard",{headers:{cookie:"session-fixture=old-fixture"}})));
        assert.match(refreshed.headers.get("x-middleware-request-cookie"),/session-fixture=renewed-fixture/);
        assert.equal(refreshed.headers.get("x-middleware-request-content-security-policy"),refreshed.headers.get("content-security-policy"));
        assert.ok(refreshed.headers.get("content-security-policy").includes(refreshed.headers.get("x-middleware-request-x-nonce")));
        assert.match(refreshed.headers.get("set-cookie"),/HttpOnly/);
      } finally { if(before===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=before; }
    });
    await t.test("logout descarta sessão e impede próxima leitura", async () => {
      const value=session(B); await value.client.auth.signOut();
      assert.equal((await call(value,app.financeRoute.GET)).status,401);
      assert.equal((await call(value,app.proxy,undefined,{path:"/dashboard"})).status,307);
    });
    await t.test("exclusão: UUID alheio, confirmação e identidade incorretos nunca chamam admin", async () => {
      const body={confirmation:"EXCLUIR",password:"local-confirmation"};
      const before=await f.state();
      for (const patch of [{user_id:B},{id:B},{confirmation:"excluir"}]) assert.equal((await call(A,app.deleteRoute.POST,{...body,...patch})).status,400);
      assert.equal((await call(A,app.deleteRoute.POST,{...body,password:"wrong-fixture"})).status,403);
      verifiedAs=B;
      assert.equal((await call(A,app.deleteRoute.POST,body)).status,403); verifiedAs=null;
      assert.equal(adminCalls,0); assert.deepEqual(await f.state(),before);
    });
    await t.test("exclusão: falha no Storage preserva conta; repetição apaga só A por cascade", async () => {
      await f.execute(A,"insert into public.recurrences(category_id,type,amount,expense_kind,day_of_month,start_month,effective_month) values($1,'expense',100,'fixed',1,'2025-01-01','2025-01-01')",[cat[A]]);
      await f.execute(A,"select public.save_budget('2025-01-01',null,10000)");
      const before=await f.state(); failFiles=true;
      const body={confirmation:"EXCLUIR",password:"local-confirmation"};
      assert.equal((await call(A,app.deleteRoute.POST,body)).status,503); assert.equal(adminCalls,0); assert.deepEqual(await f.state(),before);
      failFiles=false;
      const response=await call(A,app.deleteRoute.POST,body,{headers:{cookie:"sb-local-auth-token.0=fixture; sb-local-auth-token-code-verifier=fixture; preference=keep"}});
      assert.equal(response.status,200); assert.equal((await response.json()).redirectTo,"/login?notice=conta_excluida");
      assert.match(response.headers.get("set-cookie"),/Max-Age=0/); assert.ok(!response.headers.get("set-cookie").includes("preference"));
      assert.equal(adminCalls,1); assert.deepEqual(files.map(v=>v.user),[B]);
      const after=await f.state();
      for (const table of personalTables) {
        assert.equal(after[table].filter(v=>v.row.user_id===A).length,0);
        assert.deepEqual(after[table].filter(v=>v.row.user_id===B),before[table].filter(v=>v.row.user_id===B));
      }
      assert.equal((await call(A,app.financeRoute.GET)).status,401);
    });
  } finally { await f.db.close(); delete globalThis.__securityTestContext; }
});

test("scanner reconhece fixtures sintéticas sem retornar conteúdo", () => {
  for (const sample of ["sb_"+"secret_"+"x".repeat(24), "-----BEGIN "+"PRIVATE KEY-----", "SMTP_PASSWORD="+'"'+"x".repeat(24)+'"', "gh"+"p_"+"a".repeat(36)]) assert.deepEqual(findingsIn("line1\n"+sample),[2]);
  assert.deepEqual(findingsIn("process.env.SUPABASE_SERVICE_ROLE_KEY"),[]);
});
