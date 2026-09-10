"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FinanceGate, useFinance } from "./finance-provider";
import { ActionMessages, useFinanceAction } from "./finance-action";
import { currency, inputMoney, moneyToCents } from "@/lib/finance";
import type { Transaction, TransactionType } from "@/types/finance";
import { Icon } from "./icon";

export function TransactionForm({ transaction, onClose }: { transaction?: Transaction; onClose?: () => void }) {
  const [saved, setSaved] = useState<number | null>(null);
  if (saved !== null) return <section className="panel success-panel" role="status"><span className="success-icon"><Icon name="check" size={30} /></span><h2>Lançamento registrado!</h2><p>{currency(saved)} salvos nas suas movimentações.</p><div className="form-actions"><Link href="/historico" className="button primary">Ver movimentações</Link><button className="button secondary" onClick={() => setSaved(null)}>Adicionar outro</button></div></section>;
  return <FinanceGate><TransactionEditor transaction={transaction} onClose={onClose} onSaved={setSaved} /></FinanceGate>;
}
function TransactionEditor({ transaction, onClose, onSaved }: { transaction?: Transaction; onClose?: () => void; onSaved: (amount: number) => void }) {
  const { data, setMonth } = useFinance();
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "expense");
  const id = useRef<string | null>(transaction?.id ?? null);
  const action = useFinanceAction();
  if (!data) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    id.current ??= crypto.randomUUID();
    const ok = await action.run(transaction ? "transaction.update" : "transaction.create", { ...values, id: id.current, type }, "Lançamento salvo.");
    if (ok) {
      if (transaction) { onClose?.(); return; }
      onSaved(moneyToCents(String(values.amount)));
      const selected = String(values.date).slice(0, 7);
      setMonth(selected);
    }
  }
  const available = data.categories.filter((c) => c.type === type && (c.active || c.id === transaction?.category_id));
  return <form className="panel form-panel" onSubmit={submit} onChange={() => { if (!transaction && !action.pending) id.current = null; }} aria-busy={action.pending}>
    <fieldset disabled={action.pending}><legend className="sr-only">{transaction ? "Editar lançamento" : "Novo lançamento"}</legend>
    <div className="segmented-control" role="group" aria-label="Tipo de lançamento">{(["expense", "income"] as const).map((value) => <button key={value} type="button" disabled={Boolean(transaction?.recurrence_id)} aria-pressed={type === value} className={type === value ? "selected" : ""} onClick={() => setType(value)}><Icon name={value === "expense" ? "down" : "up"} />{value === "expense" ? "Despesa" : "Receita"}</button>)}</div>
    <label className="field amount-field">Valor (R$)<input name="amount" inputMode="decimal" placeholder="0,00" required maxLength={16} defaultValue={transaction ? inputMoney(transaction.amount) : ""} /><small>Use vírgula para os centavos. Exemplo: 125,90.</small></label>
    <label className="field">Descrição (opcional)<input name="description" placeholder="Ex.: mercado, aluguel, trabalho extra" maxLength={200} defaultValue={transaction?.description ?? ""} /></label>
    <div className="form-grid"><label className="field">Categoria<select name="category_id" key={type} required defaultValue={transaction?.category_id ?? ""}><option value="" disabled>Selecione uma categoria</option>{available.map((c) => <option key={c.id} value={c.id}>{c.name}{!c.active ? " (arquivada)" : ""}</option>)}</select></label><label className="field">Data<input type="date" name="date" required min="2000-01-01" max="2100-12-31" defaultValue={transaction?.date ?? data.today} /></label></div>
    {!available.length && <p className="info-box">Cadastre uma categoria em <Link href="/configuracoes" className="text-link">Configurações</Link> para continuar.</p>}
    <div className="form-grid"><label className="field">Situação<select name="status" defaultValue={transaction?.status ?? "realized"}><option value="realized">Realizada</option><option value="planned">Prevista</option></select></label>{type === "expense" && <label className="field">Classificação<select name="expense_kind" defaultValue={transaction?.expense_kind ?? "variable"}><option value="variable">Variável</option><option value="fixed">Fixa</option></select></label>}</div>
    {transaction?.recurrence_id && <p className="form-note">Esta alteração vale somente para esta ocorrência e mantém a situação escolhida manualmente. A regra mensal é editada em Planejamento.</p>}
    <ActionMessages {...action} />
    <div className="form-actions"><button type="submit" className="button primary"><Icon name="check" />{action.pending ? "Salvando..." : transaction ? "Salvar alterações" : type === "expense" ? "Salvar despesa" : "Salvar receita"}</button>{onClose ? <button type="button" className="button secondary" onClick={onClose}>Cancelar</button> : <Link href="/dashboard" className="button secondary">Cancelar</Link>}</div>
    </fieldset>
  </form>;
}
