"use client";
import { useState } from "react";
import Link from "next/link";
import { FinanceGate, useFinance } from "./finance-provider";
import { TransactionList } from "./transaction-list";
import { PageHeading } from "./ui";
import { Icon } from "./icon";
import { currency, filterTransactions, monthBounds, monthLabel, summarize, transactionsCsv } from "@/lib/finance";
export function History() { return <FinanceGate><HistoryContent /></FinanceGate>; }
function HistoryContent() {
  const { data, month } = useFinance();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (!data) return null;
  const summary = summarize(data.transactions, data.budgets, month);
  const filtered = filterTransactions(summary.monthly, { search, type, category, status, from, to });
  function download() {
    const blob = new Blob([transactionsCsv(filtered, data!.categories)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "lancamentos-" + month + ".csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <><PageHeading eyebrow="CADA DETALHE CONTA" title="Suas movimentações" description={"Acompanhe as entradas e saídas de " + monthLabel(month) + "."} action={<Link href="/lancamento" className="button primary"><Icon name="plus" />Novo lançamento</Link>} />
    <div className="history-summary"><span>Receitas realizadas <strong className="positive">{currency(summary.income)}</strong></span><span>Despesas realizadas <strong>{currency(summary.expenses)}</strong></span><span>Saldo realizado <strong>{currency(summary.balance)}</strong></span></div>
    <section className="panel"><div className="filter-bar"><label className="search-field"><Icon name="search" /><input aria-label="Buscar movimentações" placeholder="Buscar uma movimentação..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <select aria-label="Filtrar por tipo" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Todos os tipos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select>
      <select aria-label="Filtrar por categoria" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">Todas as categorias</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{!c.active ? " (arquivada)" : ""}</option>)}</select>
      <select aria-label="Filtrar por situação" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todas as situações</option><option value="realized">Realizadas</option><option value="planned">Previstas</option></select>
      <label className="field">De<input aria-label="Data inicial do filtro" type="date" value={from} min={monthBounds(month).start} max={monthBounds(month).end} onChange={(e) => setFrom(e.target.value)} /></label><label className="field">Até<input aria-label="Data final do filtro" type="date" value={to} min={from || monthBounds(month).start} max={monthBounds(month).end} onChange={(e) => setTo(e.target.value)} /></label>
      <button className="button secondary" onClick={download}>Exportar CSV</button></div><div className="results-label" role="status">{filtered.length} movimentações encontradas. O CSV usa estes mesmos filtros.</div>{from && to && from > to && <p className="error-message" role="alert">O início deve ser anterior ao fim do período.</p>}<TransactionList transactions={filtered} editable /></section></>;
}