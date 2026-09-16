"use client";
import Link from "next/link";
import { FinanceGate, useFinance } from "./finance-provider";
import { Icon, type IconName } from "./icon";
import { PageHeading, Progress } from "./ui";
import { TransactionList } from "./transaction-list";
import { budgetUsage, currency, monthLabel, summarize } from "@/lib/finance";
import { upcomingInstallments } from "@/lib/installments";
export function Dashboard() { return <FinanceGate><DashboardContent /></FinanceGate>; }
function DashboardContent() {
  const { data, month } = useFinance();
  if (!data) return null;
  const summary = summarize(data.transactions, data.budgets, month);
  const spending = data.categories.filter((c) => c.type === "expense").map((category) => ({
    ...category, amount: summary.monthly.filter((t) => t.type === "expense" && t.status === "realized" && t.category_id === category.id).reduce((s, t) => s + t.amount, 0),
  })).filter((c) => c.amount > 0);
  const stops = spending.map((c, index) => { const start = spending.slice(0, index).reduce((sum, item) => sum + item.amount, 0) / summary.expenses * 360; return c.color + " " + start + "deg " + (start + c.amount / summary.expenses * 360) + "deg"; }).join(", ");
  const metrics: { label: string; value: number | null; caption: string; icon: IconName; tone: string }[] = [
    { label: "Receitas realizadas", value: summary.income, caption: "Recebidas neste mês", icon: "up", tone: "green" },
    { label: "Despesas realizadas", value: summary.expenses, caption: "Fixas e variáveis pagas", icon: "down", tone: "orange" },
    { label: "Saldo realizado", value: summary.balance, caption: "Receitas realizadas − despesas realizadas", icon: "wallet", tone: "blue" },
    { label: "Disponível no orçamento", value: summary.available, caption: "Limite variável − despesas variáveis realizadas", icon: "spark", tone: "featured" },
  ];
  return <><PageHeading eyebrow="SEU RESUMO FINANCEIRO" title={"Olá, " + (data.profile.name.split(" ")[0] || "você") + ". Tudo sob controle?"} description="Um olhar para o seu dinheiro. Mais espaço para os seus planos." action={<Link href="/lancamento" className="button primary"><Icon name="plus" size={18} />Novo lançamento</Link>} />
    <div className="overview-caption"><span className="live-dot" />Visão de {monthLabel(month)}<span className="demo-badge">{data.profile.timezone}</span></div>
    {!data.profile.onboarding_completed && <section className="info-box"><Icon name="wallet" /><div><h2>Seu controle começa aqui</h2><p>Configure suas rendas, despesas fixas e orçamento. Você também pode registrar um lançamento avulso.</p><Link className="button primary mt-4" href="/configuracao-inicial">Começar configuração</Link></div></section>}
    {!summary.monthly.length && <div className="empty-state"><h2>Nenhum lançamento neste mês</h2><p>Seu resumo será atualizado assim que você salvar uma receita ou despesa.</p><Link className="text-link" href="/lancamento">Adicionar primeiro lançamento</Link></div>}
    <section className="metrics-grid" aria-label="Resumo do mês">{metrics.map((m) => <article key={m.label} className={"metric-card " + m.tone}><div className="metric-title">{m.label}<span className="metric-icon"><Icon name={m.icon} /></span></div><p className="metric-value">{m.value === null ? "Não configurado" : currency(m.value)}</p><p className="metric-caption">{m.caption}</p></article>)}</section>
    <div className="history-summary"><span>Receitas previstas <strong>{currency(summary.plannedIncome)}</strong></span><span>Despesas previstas <strong>{currency(summary.plannedExpenses)}</strong></span><span>Previsões não entram nos totais realizados.</span></div>
    <section className="panel form-panel" aria-label="Compromissos parcelados futuros"><div className="section-title"><div><h2>Parcelas dos próximos três meses</h2><p>Vencimentos após o mês selecionado. Estes valores previstos não são somados às despesas realizadas.</p></div></div>{data.installmentPlans.length ? <div className="history-summary">{upcomingInstallments(data.installmentTransactions, month).map((item) => <span key={item.month}>{monthLabel(item.month)}<strong>{currency(item.amount)}</strong><small>{item.count} parcelas previstas</small></span>)}</div> : <p className="muted">Você ainda não tem compras parceladas. Ative “Compra parcelada” ao registrar uma despesa.</p>}<Link href="/planejamento" className="text-link mt-5">Ver compras parceladas</Link></section>
    <section className="limit-strip"><div className="limit-symbol"><Icon name="shield" size={25} /></div><div className="limit-copy"><h2>Orçamento de despesas variáveis</h2><p>{summary.available === null ? "Configure um limite para acompanhar seu orçamento." : summary.available >= 0 ? "Disponível: " + currency(summary.available) : "Limite excedido em " + currency(-summary.available)}</p></div><div className="limit-meter"><div><strong>{summary.percent === null ? "Não configurado" : summary.limit === 0 ? "Limite zero" : summary.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "% utilizado"}</strong><span>{summary.limit === null ? "—" : currency(summary.limit)}</span></div>{summary.percent !== null && <Progress value={summary.percent} label="Utilização do orçamento variável" warning={summary.alert !== null} />}</div><Link href="/planejamento" className="text-link">Ajustar limite <Icon name="arrow" size={17} /></Link></section>
    {summary.alert !== null && <p className="info-box" role="status">Atenção ao orçamento variável: {summary.alert === 100 ? "limite atingido ou excedido" : "você atingiu " + summary.alert + "% do limite"}.</p>}
    {data.budgets.filter((b) => b.category_id !== null).map((budget) => {
      const spent = summary.monthly.filter((t) => t.category_id === budget.category_id && t.status === "realized" && t.expense_kind === "variable").reduce((s, t) => s + t.amount, 0);
      const usage = budgetUsage(spent, budget.amount);
      return usage.alert === null ? null : <p key={budget.id} className="info-box" role="status">{data.categories.find((c) => c.id === budget.category_id)?.name}: {usage.alert === 100 ? "limite variável atingido ou excedido" : "atenção, " + usage.alert + "% do limite variável"}.</p>;
    })}
    <div className="dashboard-grid"><section className="panel category-panel"><div className="panel-heading"><div><h2>Para onde vai seu dinheiro</h2><p>Despesas realizadas por categoria</p></div><span className="subtle-label">Neste mês</span></div><div className="category-content"><div className="donut" role="img" aria-label={"Despesas realizadas: " + currency(summary.expenses)} style={{ background: stops ? "conic-gradient(" + stops + ")" : "var(--chart-track)" }}><div><span>Total de despesas</span><strong>{currency(summary.expenses)}</strong></div></div><ul className="category-legend">{spending.length ? spending.map((c) => <li key={c.id}><i style={{ background: c.color }} /><span>{c.name}</span><strong>{currency(c.amount)}</strong></li>) : <li>Nenhuma despesa realizada neste mês.</li>}</ul></div></section>
    <section className="plan-card"><span className="plan-card-icon"><Icon name="plan" size={24} /></span><p className="eyebrow">PEQUENOS PASSOS, GRANDES PLANOS</p><h2>Seu futuro começa<br />no seu mês.</h2><p>Planeje receitas e despesas mensais e acompanhe seus limites por categoria.</p><Link href="/planejamento" className="button secondary">Ver meu planejamento <Icon name="arrow" size={17} /></Link><div className="decorative-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></section></div>
    <section className="panel transactions-panel"><div className="panel-heading"><div><h2>Últimas movimentações</h2><p>Realizadas e previstas, identificadas na lista.</p></div><Link href="/historico" className="text-link">Ver todas <Icon name="arrow" size={17} /></Link></div><TransactionList transactions={[...summary.monthly].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)} /></section></>;
}
