import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { readdir } from "node:fs/promises";
import type { FinanceSnapshot } from "../src/types/finance";

let bundle="", css:string[]=[];
test.beforeAll(async () => {
  const result=await build({entryPoints:["tests/fixtures/security-browser-entry.tsx"],bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},alias:{"next/link":path.resolve("tests/fixtures/link.tsx")},plugins:[{
    name:"local-signout-adapter",setup(b){
      b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:"auth-local",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export const createClient=()=>({auth:{signOut:async()=>{await fetch('/__test-signout',{method:'POST'});return {error:null}}}});",loader:"js"}));
    },
  }]});
  bundle=result.outputFiles[0].text.replace(/<\/script/gi,"<\\/script");
  css=(await readdir(".next/static/chunks")).filter(f=>f.endsWith(".css"));
});
test.beforeEach(async({page})=>{
  // Test origin only. Prevent accidental remote requests if the app changes.
  await page.route("**/*",route=>new URL(route.request().url()).origin==="http://127.0.0.1:3100" ? route.continue() : route.abort());
});
function snapshot(who:string):FinanceSnapshot {
  const description=who==="A" ? '<img src=x onerror="window.__injected=1"><script>window.__injected=1</script>' : "B_PRIVATE";
  return {profile:{user_id:who,name:who,timezone:"America/Sao_Paulo",currency:"BRL",locale:"pt-BR",onboarding_completed:true},month:"2025-01",today:"2025-01-10",categories:[{id:"cat",name:'<svg onload="window.__injected=2">',type:"expense",color:"#137968",active:true,default_key:null}],transactions:[description,"=1+1","+cmd","-cmd","@SUM(1)"].map((text,i)=>({id:String(i),category_id:"cat",description:text,amount:100,date:"2025-01-10",type:"expense",status:"realized",expense_kind:"variable",recurrence_id:null,occurrence_month:null})),recurrences:[],budgets:[],installmentPlans:[],installmentTransactions:[]};
}
async function mount(page:Page,onGet:()=>Promise<FinanceSnapshot> = async()=>snapshot("A")) {
  await page.route("**/api/finance*",async(route)=>route.fulfill({json:await onGet()}));
  await page.route("**/__security-ui",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html><head>${css.map(file=>`<link rel="stylesheet" href="/_next/static/chunks/${file}">`).join("")}</head><body><div id="root"></div><script>${bundle}</script></body></html>`}));
  await page.goto("/__security-ui");
}

test("cabeçalhos reais: nonce muda, scripts hidratam e não há CSP permissiva",async({page,request})=>{
  const violations:string[]=[];
  await page.addInitScript(()=>{
    (window as unknown as {cspViolations:string[]}).cspViolations=[];
    document.addEventListener("securitypolicyviolation",e=>(window as unknown as {cspViolations:string[]}).cspViolations.push(e.violatedDirective));
  });
  page.on("pageerror",error=>violations.push(error.message));
  const response=await page.goto("/login");
  const headers=response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  const scripts=headers["content-security-policy"].split(";").find(v=>v.trim().startsWith("script-src"))!;
  expect(scripts).toContain("'nonce-"); expect(scripts).not.toContain("unsafe-inline"); expect(scripts).not.toContain("unsafe-eval");
  expect(headers["x-content-type-options"]).toBe("nosniff"); expect(headers["x-frame-options"]).toBe("DENY"); expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toContain("no-store"); expect(headers["strict-transport-security"]).toBeUndefined();
  const next=await request.get("/login",{headers:{"x-nonce":"from-client"}});
  expect(next.headers()["content-security-policy"]).not.toBe(headers["content-security-policy"]);
  expect(next.headers()["content-security-policy"]).not.toContain("from-client");
  await page.getByLabel("E-mail",{exact:true}).fill("fixture@example.invalid");
  expect(await page.evaluate(()=>document.querySelector("script")?.nonce)).toBeTruthy();
  expect(await page.evaluate(()=>(window as unknown as {cspViolations:string[]}).cspViolations)).toEqual([]);
  expect(violations).toEqual([]);
});

test("HTML/JavaScript persistido é texto no histórico e CSV neutraliza = + - @",async({page})=>{
  await mount(page);
  await expect(page.locator("tbody")).toContainText('<img src=x onerror="window.__injected=1">');
  await expect(page.locator("tbody img, tbody script, tbody svg[onload]")).toHaveCount(0);
  expect(await page.evaluate(()=>Object.hasOwn(window,"__injected"))).toBe(false);
  const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Exportar CSV"}).click()]);
  const chunks:Buffer[]=[]; for await (const chunk of (await download.createReadStream())!) chunks.push(chunk);
  const csv=Buffer.concat(chunks).toString("utf8");
  for (const value of ["=1+1","+cmd","-cmd","@SUM(1)"]) expect(csv).toContain(`"'${value}"`);
  expect(csv).not.toContain("B_PRIVATE");
  await page.getByLabel("Buscar movimentações").fill("=1+1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const [filtered]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Exportar CSV"}).click()]);
  const parts:Buffer[]=[]; for await (const chunk of (await filtered.createReadStream())!) parts.push(chunk);
  expect(Buffer.concat(parts).toString("utf8")).not.toContain("@SUM");
});

test("troca de identidade descarta dados e filtros da conta anterior durante carregamento",async({page})=>{
  let calls=0, release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await mount(page,async()=>{calls++;if(calls===1)return snapshot("A");await pending;return snapshot("B");});
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByLabel("Buscar movimentações").fill("=1+1");
  await page.getByRole("button",{name:"Teste: mudar conta"}).click();
  try {
    await expect(page.getByText("Carregando seus dados financeiros...")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(0);
  } finally {release();}
  await expect(page.locator("tbody")).toContainText("B_PRIVATE");
  await expect(page.getByLabel("Buscar movimentações")).toHaveValue("");
  await expect(page.locator("tbody")).not.toContainText("onerror");
});

test("sessão expirada oculta dados antigos e logout faz navegação completa",async({page})=>{
  await mount(page);
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.route("**/api/finance*",route=>route.fulfill({status:401,json:{error:"Sua sessão expirou. Entre novamente."}}));
  await page.getByRole("button",{name:"Teste: mudar conta"}).click();
  await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  let calls=0;
  await page.route("**/__test-signout",route=>{calls++;return route.fulfill({json:{}});});
  await page.getByRole("button",{name:"Sair da conta"}).click();
  await expect(page).toHaveURL(/\/login$/); expect(calls).toBe(1);
  await page.goto("/dashboard"); await expect(page).toHaveURL(/\/login\?next=/);
});
