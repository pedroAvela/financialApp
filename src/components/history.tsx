"use client";

import { useState } from "react";
import Link from "next/link";
import { useFinance } from "@/components/finance-provider";
import { TransactionList } from "@/components/transaction-list";
import { PageHeading } from "@/components/ui";
import { Icon } from "@/components/icon";
import { categories } from "@/data/mock-data";
import { currency, monthLabel, summarize } from "@/lib/finance";

export function History() {
  const { transactions, month, settings } = useFinance();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const summary = summarize(transactions, settings, month);
  const filtered = summary.monthly.filter((item) =>
    item.description.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) &&
    (type === "all" || item.type === type) && (category === "all" || item.categoryId === category));
  return <>
    <PageHeading eyebrow="CADA DETALHE CONTA" title="Suas movimentações" description={`Acompanhe as entradas e saídas de ${monthLabel(month)}.`} action={<Link href="/lancamento" className="button primary"><Icon name="plus" />Novo lançamento</Link>} />
    <div className="history-summary"><span>Receitas <strong className="positive">{currency(summary.income)}</strong></span><span>Despesas <strong>{currency(summary.expenses)}</strong></span><span>Saldo do mês <strong>{currency(summary.balance)}</strong></span></div>
    <section className="panel"><div className="filter-bar"><label className="search-field"><Icon name="search" /><input aria-label="Buscar movimentações" placeholder="Buscar uma movimentação..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrar por tipo" value={type} onChange={(event) => setType(event.target.value)}><option value="all">Todos os tipos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select><select aria-label="Filtrar por categoria" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas as categorias</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="results-label" role="status">{filtered.length} movimentações encontradas</div><TransactionList transactions={filtered} /></section>
  </>;
}

