import { expect, test, type Page, type Route } from "@playwright/test";
import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { FinanceSnapshot, InstallmentPlan } from "../src/types/finance";

const planId="11111111-1111-4111-8111-111111111111", categoryId="22222222-2222-4222-8222-222222222222";
let bundle="", styles:string[]=[];
test.beforeAll(async () => {
  const result=await build({entryPoints:["tests/fixtures/installment-entry.tsx"],bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},alias:{"next/link":path.resolve("tests/fixtures/link.tsx")}});
  bundle=result.outputFiles[0].text.replace(/<\/script/gi,"<\\/script");
  styles=(await readdir(".next/static/chunks")).filter((file) => file.endsWith(".css")).map((file) => "/_next/static/chunks/"+file);
});
function fixture(paid=false):FinanceSnapshot {
  const plan:InstallmentPlan={id:planId,category_id:categoryId,description:"Computador",total_amount_cents:10000,installment_count:3,purchase_date:"2025-01-10",first_due_date:"2025-01-31",payment_method:"Boleto",expense_kind:"variable",status:"active",client_request_id:planId,created_at:"2025-01-10T00:00:00Z",updated_at:"2025-01-10T00:00:00Z"};
  const installments=["2025-01-31","2025-02-28","2025-03-31"].map((due,index) => ({id:`00000000-0000-4000-8000-00000000000${index+1}`,category_id:categoryId,description:"Computador",amount:index===2?3334:3333,type:"expense" as const,status:"planned" as "planned"|"realized",expense_kind:"variable" as const,date:due,recurrence_id:null,occurrence_month:null,installment_plan_id:planId,installment_number:index+1,total_installments:3,due_date:due,payment_date:null as string|null,scheduled_amount_cents:index===2?3334:3333,deleted_at:null as string|null}));
  if(paid) Object.assign(installments[0],{status:"realized",date:"2025-02-05",payment_date:"2025-02-05",amount:3500});
  return {profile:{user_id:planId,name:"Teste",timezone:"America/Sao_Paulo",currency:"BRL",locale:"pt-BR",onboarding_completed:true},categories:[{id:categoryId,name:"Outros",color:"#137968",active:true,type:"expense",default_key:null}],transactions:[],recurrences:[],budgets:[{id:"budget",month:"2025-02-01",category_id:null,amount:10000}],month:"2025-01",today:"2025-02-10",installmentPlans:[plan],installmentTransactions:installments};
}
type Action = {action:string;data:Record<string,unknown>};
async function mount(page:Page,state:FinanceSnapshot,view:string,onPost:(request:Action,route:Route)=>Promise<void>) {
  await page.route("**/api/finance*",async(route) => {
    if(route.request().method()==="POST") return onPost(route.request().postDataJSON(),route);
    const month=new URL(route.request().url()).searchParams.get("month")||state.month;
    await route.fulfill({json:{...state,month,transactions:state.installmentTransactions.filter((t)=>!t.deleted_at&&t.date.startsWith(month))}});
  });
  await page.route("**/__installment-ui?**",(route)=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map((href)=>`<link rel="stylesheet" href="${href}">`).join("")}</head><body><div id="root"></div><script>${bundle}</script></body></html>`}));
  await page.goto("/__installment-ui?view="+view);
}
test("prévia, duplo clique, erro e reenvio mantêm a mesma chave sem sucesso antecipado",async({page},testInfo)=>{
  const state=fixture();state.installmentPlans=[];state.installmentTransactions=[];
  const requests:Action[]=[];
  let release!:()=>void;
  const held=new Promise<void>((resolve)=>{release=resolve;});
  await mount(page,state,"create",async(request,route)=>{
    requests.push(request);
    if(requests.length===1){await held;await route.fulfill({status:503,json:{error:"Falha simulada. Tente novamente."}});}
    else await route.fulfill({json:{saved:true}});
  });
  await page.getByLabel("Compra parcelada",{exact:true}).check();
  await page.getByLabel("Valor total da compra (R$)",{exact:true}).fill("100,00");
  await page.getByLabel("Quantidade de parcelas").fill("3");
  await page.getByLabel("Data da compra",{exact:true}).fill("2025-01-10");
  await page.getByLabel("Primeiro vencimento").fill("2025-01-31");
  await page.getByRole("combobox",{name:"Categoria",exact:true}).selectOption(categoryId);
  await page.getByLabel("Descrição da compra",{exact:true}).fill("Computador");
  const preview=page.getByRole("region",{name:"Prévia das parcelas"});
  await expect(preview.locator("tbody tr")).toHaveCount(3);
  await expect(preview.locator("tbody")).toContainText("28/02/2025");
  await expect(preview.locator("tbody")).toContainText("31/03/2025");
  await expect(preview).toContainText("33,34");
  await expect(preview).toContainText("Ajuste de");
  await page.evaluate(()=>{document.documentElement.dataset.theme="dark";});
  await expect(page.getByLabel("Valor total da compra (R$)")).toHaveCSS("background-color","rgb(20, 34, 27)");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("parcelamento-escuro.png"),fullPage:true});
  // Dispatch two submits in one tick to exercise the synchronous ref lock.
  await page.locator("form.installment-form").evaluate((form)=>{form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
  try {
    await expect(page.getByRole("button",{name:"Salvando...",exact:true})).toBeDisabled();
    await expect.poll(()=>requests.length).toBe(1);
    await expect(page.getByRole("heading",{name:"Compra parcelada registrada!"})).toHaveCount(0);
  } finally {release();}
  await expect(page.getByRole("alert")).toContainText("Falha simulada");
  await page.getByRole("button",{name:"Salvar compra parcelada",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Compra parcelada registrada!"})).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].data.client_request_id).toBe(requests[1].data.client_request_id);
  expect(requests[0].data).not.toHaveProperty("user_id");
});
test("pagamento preserva vencimento e dashboard usa só o valor pago no mês efetivo",async({page})=>{
  const state=fixture();const requests:Action[]=[];
  await mount(page,state,"details",async(request,route)=>{
    requests.push(request);expect(request.action).toBe("installment.pay");
    Object.assign(state.installmentTransactions[0],{status:"realized",amount:3500,date:"2025-02-05",payment_date:"2025-02-05"});
    await route.fulfill({json:{saved:true}});
  });
  await page.getByRole("button",{name:"Pagar parcela 1",exact:true}).click();
  await page.getByLabel("Valor pago (R$)").fill("35,00");
  await page.getByLabel("Data do pagamento").fill("2025-02-05");
  await page.getByRole("button",{name:"Confirmar pagamento",exact:true}).click();
  const detail=page.getByRole("region",{name:"Detalhes do parcelamento"});
  await expect(detail.locator("tbody tr").first()).toContainText("31/01/2025");
  await expect(detail.locator("tbody tr").first()).toContainText("05/02/2025");
  await expect(detail.locator("tbody tr").first()).toContainText("35,00");
  expect(requests).toHaveLength(1);expect(requests[0].data).toMatchObject({amount:"35,00",payment_date:"2025-02-05"});
  await page.getByRole("button",{name:"Teste: dashboard",exact:true}).click();
  await expect(page.locator(".metric-card").filter({has:page.locator(".metric-title",{hasText:"Despesas realizadas"})})).toContainText("0,00");
  await page.getByRole("button",{name:"Teste: fevereiro",exact:true}).click();
  await expect(page.locator(".metric-card").filter({has:page.locator(".metric-title",{hasText:"Despesas realizadas"})})).toContainText("35,00");
  await expect(page.locator(".metric-card").filter({hasText:"Disponível no orçamento"})).toContainText("65,00");
  await expect(page.getByRole("region",{name:"Compromissos parcelados futuros"})).toContainText("33,34");
});
test("edição segura e cancelamento confirmado preservam parcela paga e CSV",async({page})=>{
  const state=fixture(true);const paidBefore=structuredClone(state.installmentTransactions[0]);const requests:Action[]=[];
  await mount(page,state,"details",async(request,route)=>{
    requests.push(request);
    if(request.action==="installment.edit") {
      state.installmentPlans[0].description=String(request.data.description);
      for(const row of state.installmentTransactions) if(row.status==="planned") row.description=String(request.data.description);
    } else if(request.action==="installment.cancel") {
      expect(request.data.confirmed).toBe(true);state.installmentPlans[0].status="cancelled";
      for(const row of state.installmentTransactions) if(row.status==="planned") row.deleted_at="2025-02-10T00:00:00Z";
    } else throw new Error("Unexpected action");
    await route.fulfill({json:{saved:true}});
  });
  await page.getByRole("button",{name:"Editar parcelamento",exact:true}).click();
  await expect(page.getByLabel("Valor total da compra (R$)")).toHaveAttribute("readonly","");
  await expect(page.getByLabel("Quantidade de parcelas")).toHaveAttribute("readonly","");
  await page.getByLabel("Descrição da compra",{exact:true}).fill("Compra ajustada");
  await page.getByRole("checkbox",{name:/Confirmo a alteração/}).check();
  await page.getByRole("button",{name:"Salvar alterações do parcelamento",exact:true}).click();
  await expect(page.getByRole("region",{name:"Detalhes do parcelamento"}).getByRole("heading",{name:"Compra ajustada",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Cancelar parcelas futuras",exact:true}).click();
  expect(requests).toHaveLength(1);
  await page.getByRole("button",{name:"Voltar sem alterar",exact:true}).click();
  await page.getByRole("button",{name:"Cancelar parcelas futuras",exact:true}).click();
  await page.getByRole("button",{name:"Confirmar cancelamento das futuras",exact:true}).click();
  await expect(page.getByRole("region",{name:"Detalhes do parcelamento"}).locator("tbody tr").filter({hasText:"Cancelada"})).toHaveCount(2);
  await expect(page.getByRole("button",{name:"Excluir compra inteira",exact:true})).toHaveCount(0);
  expect(state.installmentTransactions[0]).toEqual(paidBefore);
  await page.getByRole("button",{name:"Teste: histórico",exact:true}).click();
  await page.getByRole("button",{name:"Teste: fevereiro",exact:true}).click();
  await expect(page.getByRole("button",{name:"Parcela 1/3",exact:true})).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Exportar CSV",exact:true}).click()]);
  const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream!) chunks.push(chunk);
  const csv=Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain('"1";"3";"31/01/2025";"05/02/2025";"33,33";"35,00"');
  expect(csv).not.toContain("Compra ajustada");
});
