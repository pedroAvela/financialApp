"use client";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FinanceGate, useFinance } from "./finance-provider";
import { ActionMessages, useFinanceAction } from "./finance-action";
import { budgetUsage, currency, inputMoney } from "@/lib/finance";
import { Icon } from "./icon";
import { Progress } from "./ui";
import { RecurrencesManager } from "./recurrences-manager";
import type { Category } from "@/types/finance";

export function FinancialForm({ initial = false }: { initial?: boolean }) {
  return <FinanceGate>{initial ? <SetupForm /> : <PlanningForms />}</FinanceGate>;
}
function SetupForm() {
  const { data, month, setMonth } = useFinance();
  const action = useFinanceAction();
  const router = useRouter();
  if (!data) return null;
  const currentMonth = data.today.slice(0, 7);
  const effective = month > currentMonth ? month : currentMonth;
  const income = data.recurrences.find((r) => r.setup_key === "income");
  const fixed = data.recurrences.find((r) => r.setup_key === "fixed");
  const budget = effective === month ? data.budgets.find((b) => b.category_id === null) : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    if (await action.run("setup.save", values, "Configuração inicial salva.")) { setMonth(String(values.month)); router.push("/dashboard"); }
  }
  return <form className="space-y-6" onSubmit={submit}><section className="panel form-panel"><div className="section-title"><span className="small-icon"><Icon name="wallet" /></span><div><h2>Vamos começar pelo básico</h2><p>Cria ou atualiza duas regras mensais e o orçamento do mês escolhido. Use Planejamento para detalhar outras rendas e despesas.</p></div></div>
    <fieldset disabled={action.pending}><legend className="sr-only">Configuração inicial</legend><div className="form-grid">
    <label className="field">Aplicar a partir do mês<input type="month" name="month" min={currentMonth} max="2100-12" defaultValue={effective} required /></label>
    <label className="field">Dia de recebimento e vencimento<input name="day" type="number" min={1} max={31} defaultValue={income?.day_of_month ?? fixed?.day_of_month ?? 5} required /></label>
    <label className="field">Renda mensal (R$)<input name="income" inputMode="decimal" defaultValue={inputMoney(income?.active ? income.amount : 0)} required maxLength={16} /><small>Na data de recebimento, a renda passa a realizada ao consultar o mês. Você pode ajustar no histórico. Zero desativa esta regra.</small></label>
    <label className="field">Categoria da renda<select name="income_category" defaultValue={income?.category_id ?? data.categories.find((c) => c.default_key === "salary" && c.active)?.id ?? ""}><option value="">Selecione</option>{data.categories.filter((c) => c.type === "income" && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="field">Despesas fixas mensais (R$)<input name="fixed" inputMode="decimal" defaultValue={inputMoney(fixed?.active ? fixed.amount : 0)} required maxLength={16} /><small>Zero desativa a regra base de despesas fixas.</small></label>
    <label className="field">Categoria das despesas fixas<select name="fixed_category" defaultValue={fixed?.category_id ?? data.categories.find((c) => c.default_key === "housing" && c.active)?.id ?? ""}><option value="">Selecione</option>{data.categories.filter((c) => c.type === "expense" && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="field">Orçamento variável do mês (R$)<input name="budget" inputMode="decimal" defaultValue={budget ? inputMoney(budget.amount) : ""} maxLength={16} /><small>Em branco: não configurado. Zero: nenhum gasto variável previsto. Despesas fixas não consomem este limite.</small></label></div>
    <ActionMessages {...action} /><button type="submit" className="button primary"><Icon name="arrow" />{action.pending ? "Salvando..." : "Começar meu controle"}</button></fieldset></section></form>;
}
function PlanningForms() {
  const { data, month } = useFinance();
  if (!data) return null;
  return <div className="space-y-6"><section className="panel form-panel"><div className="section-title"><span className="small-icon"><Icon name="plan" /></span><div><h2>Limites de despesas variáveis</h2><p>Válidos para o mês selecionado, sem transporte automático entre meses. Em branco remove o limite; zero é um limite configurado.</p></div></div>
    <BudgetForm key={month + "-general"} />
    <h3 className="mt-6 mb-5">Limites por categoria</h3><div className="budget-grid">{data.categories.filter((c) => c.type === "expense" && (c.active || data.budgets.some((b) => b.category_id === c.id))).map((c) => <BudgetForm key={month + c.id} category={c} />)}</div><p className="form-note">Limites por categoria são independentes do geral. Somente despesas variáveis realizadas são comparadas aos limites.</p></section><RecurrencesManager /></div>;
}
function BudgetForm({ category }: { category?: Category }) {
  const { data, month } = useFinance();
  const action = useFinanceAction();
  if (!data) return null;
  const budget = data.budgets.find((b) => b.category_id === (category?.id ?? null));
  const spent = data.transactions.filter((t) => t.type === "expense" && t.status === "realized" && t.expense_kind === "variable" && (!category || t.category_id === category.id)).reduce((s, t) => s + t.amount, 0);
  const usage = budgetUsage(spent, budget?.amount ?? null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await action.run("budget.save", { amount: new FormData(event.currentTarget).get("amount"), category_id: category?.id ?? null, month }, "Limite salvo."); }
  return <form className="budget-item" onSubmit={submit}><div className="budget-heading"><strong>{category?.name ?? "Orçamento variável geral"}{category && !category.active ? " (arquivada)" : ""}</strong><small>{usage.percent === null ? "Não configurado" : budget?.amount === 0 ? "Limite zero" : Math.round(usage.percent) + "% utilizado"}</small></div>
    {usage.percent !== null && <Progress value={usage.percent} label={"Limite de " + (category?.name ?? "despesas variáveis")} warning={usage.alert !== null} />}<p>{currency(spent)} em despesas variáveis realizadas.</p>
    {usage.alert !== null && <p role="status" className="form-note">Atenção: {usage.alert === 100 ? "limite atingido ou excedido" : usage.alert + "% do orçamento utilizado"}.</p>}
    <label className="field">{category ? "Limite de " + category.name.toLowerCase() + " (R$)" : "Limite geral variável (R$)"}<input name="amount" inputMode="decimal" maxLength={16} defaultValue={budget ? inputMoney(budget.amount) : ""} disabled={action.pending} /></label><ActionMessages {...action} /><button className="button secondary" disabled={action.pending}>{action.pending ? "Salvando..." : "Salvar limite"}</button>
  </form>;
}