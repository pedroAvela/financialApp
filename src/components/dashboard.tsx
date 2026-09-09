"use client";

import Link from "next/link";
import { useFinance } from "@/components/finance-provider";
import { Icon, type IconName } from "@/components/icon";
import { PageHeading, Progress } from "@/components/ui";
import { TransactionList } from "@/components/transaction-list";
import { categories } from "@/data/mock-data";
import { currency, monthLabel, summarize } from "@/lib/finance";

export function Dashboard() {
  const { transactions, settings, month } = useFinance();
  const summary = summarize(transactions, settings, month);
  const spending = categories.filter((category) => category.type === "expense").map((category) => ({
    ...category, amount: summary.monthly.filter((item) => item.type === "expense" && item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0),
  })).filter((category) => category.amount > 0);
  const stops = spending.map((category, index) => {
    const start = spending.slice(0, index).reduce((sum, item) => sum + item.amount, 0) / summary.expenses * 360;
    const end = start + category.amount / summary.expenses * 360;
    return `${category.color} ${start}deg ${end}deg`;
  }).join(", ");
  const metrics: { label: string; value: number; caption: string; icon: IconName; tone: string }[] = [
    { label: "Receitas do mês", value: summary.income, caption: "Tudo o que entrou neste mês", icon: "up", tone: "green" },
    { label: "Despesas do mês", value: summary.expenses, caption: "Tudo o que saiu neste mês", icon: "down", tone: "orange" },
    { label: "Saldo do mês", value: summary.balance, caption: "Saldo inicial + receitas − despesas", icon: "wallet", tone: "blue" },
    { label: "Valor disponível", value: summary.available, caption: `Saldo menos ${currency(settings.reserve)} de reserva`, icon: "spark", tone: "featured" },
  ];
  const remaining = settings.monthlyLimit - summary.expenses;
  return <>
    <PageHeading eyebrow="SEU RESUMO FINANCEIRO" title={`Olá, ${settings.name.split(" ")[0]}. Tudo sob controle?`} description="Um olhar para o seu dinheiro. Mais espaço para os seus planos." action={<Link href="/lancamento" className="button primary"><Icon name="plus" size={18} />Novo lançamento</Link>} />
    <div className="overview-caption"><span className="live-dot" /> Visão de {monthLabel(month)}<span className="demo-badge">Demonstração</span></div>
    <section className="metrics-grid" aria-label="Resumo do mês">{metrics.map((metric) => <article key={metric.label} className={`metric-card ${metric.tone}`}><div className="metric-title">{metric.label}<span className="metric-icon"><Icon name={metric.icon} /></span></div><p className="metric-value">{currency(metric.value)}</p><p className="metric-caption">{metric.caption}</p></article>)}</section>
    <section className="limit-strip"><div className="limit-symbol"><Icon name="shield" size={25} /></div><div className="limit-copy"><h2>Seu limite mensal</h2><p>{remaining >= 0 ? <>Você ainda tem <strong>{currency(remaining)}</strong> dentro do limite.</> : <>Limite excedido em <strong>{currency(-remaining)}</strong>.</>}</p></div><div className="limit-meter"><div><strong>{summary.utilization.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% utilizado</strong><span>{currency(settings.monthlyLimit)}</span></div><Progress value={summary.utilization} label="Utilização do limite mensal" warning={summary.utilization >= 80} /></div><Link href="/planejamento" className="text-link">Ajustar limite <Icon name="arrow" size={17} /></Link></section>
    <div className="dashboard-grid">
      <section className="panel category-panel"><div className="panel-heading"><div><h2>Para onde vai seu dinheiro</h2><p>Despesas por categoria</p></div><span className="subtle-label">Neste mês</span></div>
        <div className="category-content"><div className="donut" role="img" aria-label={`Despesas por categoria, total ${currency(summary.expenses)}. Detalhes na lista ao lado.`} style={{ background: stops ? `conic-gradient(${stops})` : "#edf1ee" }}><div><span>Total de despesas</span><strong>{currency(summary.expenses)}</strong></div></div><ul className="category-legend">{spending.length ? spending.map((category) => <li key={category.id}><i style={{ background: category.color }} /><span>{category.name}</span><strong>{currency(category.amount)}</strong></li>) : <li>Nenhuma despesa neste mês.</li>}</ul></div>
      </section>
      <section className="plan-card"><span className="plan-card-icon"><Icon name="plan" size={24} /></span><p className="eyebrow">PEQUENOS PASSOS, GRANDES PLANOS</p><h2>Seu futuro começa<br />no seu mês.</h2><p>Defina limites por categoria e acompanhe seus gastos com mais tranquilidade.</p><Link href="/planejamento" className="button secondary">Ver meu planejamento <Icon name="arrow" size={17} /></Link><div className="decorative-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></section>
    </div>
    <section className="panel transactions-panel"><div className="panel-heading"><div><h2>Últimas movimentações</h2><p>Os detalhes que fazem a diferença.</p></div><Link href="/historico" className="text-link">Ver todas <Icon name="arrow" size={17} /></Link></div><TransactionList transactions={[...summary.monthly].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)} /></section>
  </>;
}

