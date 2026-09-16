import { expect, test } from "@playwright/test";
import { installmentSchedule, upcomingInstallments } from "../src/lib/installments";
import { installmentInput } from "../src/lib/finance-validation";
import { summarize, transactionsCsv, MAX_CENTS } from "../src/lib/finance";
import type { Transaction } from "../src/types/finance";

test("100 reais em 3 parcelas e cinco centavos em duas, com resto apenas na última", () => {
  expect(installmentSchedule(10000, 3, "2025-01-31").map((p) => p.amount)).toEqual([3333,3333,3334]);
  expect(installmentSchedule(5, 2, "2025-01-31").map((p) => p.amount)).toEqual([2,3]);
});
test("vencimentos ancorados no dia original com fevereiro bissexto e virada de ano", () => {
  expect(installmentSchedule(10000, 3, "2025-01-31").map((p) => p.due_date)).toEqual(["2025-01-31","2025-02-28","2025-03-31"]);
  expect(installmentSchedule(10000, 3, "2024-01-31").map((p) => p.due_date)).toEqual(["2024-01-31","2024-02-29","2024-03-31"]);
  expect(installmentSchedule(10000, 4, "2023-12-31").map((p) => p.due_date)).toEqual(["2023-12-31","2024-01-31","2024-02-29","2024-03-31"]);
  expect(installmentSchedule(10000, 3, "2024-02-29").map((p) => p.due_date)).toEqual(["2024-02-29","2024-03-29","2024-04-29"]);
});
test("soma exata e parcelas positivas para 2 a 60 parcelas e o maior valor permitido", () => {
  for (let count=2;count<=60;count++) for (const total of [count, count+1, 9999, MAX_CENTS]) {
    const rows=installmentSchedule(total,count,"2025-01-31");
    expect(rows.reduce((sum,r) => sum+BigInt(r.amount),BigInt(0))).toBe(BigInt(total));
    expect(rows.every((r) => Number.isSafeInteger(r.amount) && r.amount > 0)).toBe(true);
    expect(new Set(rows.map((r) => r.due_date)).size).toBe(count);
  }
});
test("divisão rejeita zeros, frações de centavos, contagem inválida e datas fora do intervalo", () => {
  for (const [total,count,date] of [[1,2,"2025-01-31"],[0,3,"2025-01-31"],[100,1,"2025-01-31"],[100,61,"2025-01-31"],[100,2.5,"2025-01-31"],[100.5,3,"2025-01-31"],[MAX_CENTS+1,3,"2025-01-31"],[100,3,"2025-02-30"],[100,3,"2100-12-31"]] as const) expect(() => installmentSchedule(total,count,date)).toThrow();
});
test("servidor valida reais brasileiros e ignora identidade enviada pelo formulário", () => {
  const input={total_amount:"1.234,56",installment_count:"3",category_id:"22222222-2222-4222-8222-222222222222",description:"Compra",purchase_date:"2025-01-10",first_due_date:"2025-01-31",payment_method:"Boleto",expense_kind:"variable",user_id:"outro"};
  expect(installmentInput(input)).toMatchObject({p_total:123456,p_count:3,p_description:"Compra"});
  expect(installmentInput(input)).not.toHaveProperty("user_id");
  for (const patch of [{first_due_date:"2024-12-31"},{total_amount:100},{installment_count:"3.5"},{description:""},{category_id:"invalido"}]) expect(() => installmentInput({...input,...patch})).toThrow();
});
function purchase(): Transaction[] {
  return installmentSchedule(10000,3,"2025-01-31").map((p) => ({id:String(p.number),description:"Compra",type:"expense",category_id:"c",date:p.due_date,due_date:p.due_date,amount:p.amount,scheduled_amount_cents:p.amount,status:"planned",expense_kind:"variable",recurrence_id:null,occurrence_month:null,installment_plan_id:"plan",installment_number:p.number,total_installments:3,payment_date:null,deleted_at:null}));
}
test("dashboard contabiliza somente o pagamento no período efetivo, sem somar total ou projeção", () => {
  const rows=purchase(); rows[0]={...rows[0],status:"realized",date:"2025-02-05",payment_date:"2025-02-05",amount:3500};
  expect(summarize(rows,[],"2025-01")).toMatchObject({expenses:0,plannedExpenses:0,balance:0});
  expect(summarize(rows,[{id:"b",month:"2025-02-01",category_id:null,amount:10000}],"2025-02")).toMatchObject({expenses:3500,plannedExpenses:3333,balance:-3500,variableExpenses:3500,available:6500});
  expect(upcomingInstallments(rows,"2025-01")).toEqual([{month:"2025-02",count:1,amount:3333},{month:"2025-03",count:1,amount:3334},{month:"2025-04",count:0,amount:0}]);
  rows[2].deleted_at="2025-02-06T00:00:00Z";
  expect(summarize(rows,[],"2025-03").plannedExpenses).toBe(0);
  expect(upcomingInstallments(rows,"2025-01")[1].amount).toBe(0);
  expect(upcomingInstallments(rows,"2100-12")).toEqual([]);
});
test("CSV inclui compra, número, vencimento original e pagamento sem permitir fórmulas", () => {
  const rows=purchase(); rows[0]={...rows[0],description:'=HYPERLINK("malicioso")',status:"realized",date:"2025-02-05",payment_date:"2025-02-05",amount:3500};
  const csv=transactionsCsv(rows,[]);
  expect(csv).toContain('"Descrição da compra";"Parcela";"Total de parcelas";"Vencimento";"Data de pagamento"');
  expect(csv).toContain('"1";"3";"31/01/2025";"05/02/2025";"33,33";"35,00"');
  expect(csv).toContain('"Paga"'); expect(csv).toContain('"Prevista"');
  expect(csv.match(/'=HYPERLINK/g)).toHaveLength(2);
  expect(csv.startsWith("\uFEFF")).toBe(true);
});
