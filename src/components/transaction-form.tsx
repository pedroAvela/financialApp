"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useFinance } from "@/components/finance-provider";
import { categories } from "@/data/mock-data";
import { currency, moneyToCents } from "@/lib/finance";
import type { CategoryId, TransactionType } from "@/types/finance";
import { Icon } from "@/components/icon";

export function TransactionForm() {
  const { addTransaction, month, setMonth } = useFinance();
  const [type, setType] = useState<TransactionType>("expense");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = moneyToCents(String(data.get("amount")));
    const description = String(data.get("description")).trim();
    const date = String(data.get("date"));
    const categoryId = String(data.get("category")) as CategoryId;
    if (!Number.isFinite(amount) || amount <= 0) return setError("Informe um valor maior que zero. Exemplo: 125,90.");
    if (!description) return setError("Informe uma descrição para o lançamento.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) return setError("Informe uma data válida.");
    if (!categories.some((category) => category.id === categoryId && category.type === type)) return setError("Selecione uma categoria válida.");
    addTransaction({ amount, description, date, categoryId, type });
    setMonth(date.slice(0, 7));
    setSaved(amount);
    setError("");
  }

  if (saved !== null) return <section className="panel success-panel" role="status"><span className="success-icon"><Icon name="check" size={30} /></span><h2>Lançamento registrado!</h2><p>{currency(saved)} adicionados às suas movimentações simuladas.</p><div className="form-actions"><Link href="/historico" className="button primary">Ver movimentações</Link><button className="button secondary" onClick={() => setSaved(null)}>Adicionar outro</button></div></section>;

  return <form className="panel form-panel" onSubmit={submit}><div className="segmented-control" role="group" aria-label="Tipo de lançamento"><button type="button" aria-pressed={type === "expense"} className={type === "expense" ? "selected" : ""} onClick={() => setType("expense")}><Icon name="down" />Despesa</button><button type="button" aria-pressed={type === "income"} className={type === "income" ? "selected" : ""} onClick={() => setType("income")}><Icon name="up" />Receita</button></div>
    <label className="field amount-field">Valor (R$)<input name="amount" aria-label="Valor (R$)" aria-describedby="amount-hint" inputMode="decimal" placeholder="0,00" required maxLength={16} autoFocus /><small id="amount-hint">Use vírgula para os centavos. Exemplo: 125,90.</small></label>
    <label className="field">Descrição<input name="description" placeholder={type === "expense" ? "Ex.: almoço, mercado, aluguel" : "Ex.: salário, trabalho extra"} required maxLength={80} /></label>
    <div className="form-grid"><label className="field">Categoria<select name="category" key={type} required defaultValue=""><option value="" disabled>Selecione uma categoria</option>{categories.filter((item) => item.type === type).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field">Data<input type="date" name="date" defaultValue={`${month}-09`} min="2000-01-01" max="2100-12-31" required /></label></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="form-actions"><button type="submit" className="button primary"><Icon name="check" />Salvar {type === "expense" ? "despesa" : "receita"}</button><Link href="/dashboard" className="button secondary">Cancelar</Link></div><p className="form-note">Os lançamentos desta demonstração duram até a página ser recarregada.</p>
  </form>;
}

