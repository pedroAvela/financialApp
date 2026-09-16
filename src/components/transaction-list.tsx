"use client";
import { useState } from "react";
import { currency, dateLabel } from "@/lib/finance";
import { Icon } from "./icon";
import { useFinance } from "./finance-provider";
import { ActionMessages, useFinanceAction } from "./finance-action";
import { TransactionForm } from "./transaction-form";
import { InstallmentDetails } from "./installment-details";
import type { Transaction } from "@/types/finance";

export function TransactionList({ transactions, editable = false }: { transactions: Transaction[]; editable?: boolean }) {
  const { data } = useFinance();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [installment, setInstallment] = useState<{ planId: string; paymentId?: string } | null>(null);
  const action = useFinanceAction();
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  if (installment) return <InstallmentDetails key={installment.planId} planId={installment.planId} initialPaymentId={installment.paymentId} onClose={() => setInstallment(null)} />;
  if (editing) return <section aria-label="Editar lançamento"><h2 className="mb-5">Editar lançamento</h2><TransactionForm key={editing.id} transaction={editing} onClose={() => setEditing(null)} /></section>;
  return <><ActionMessages {...action} />
    {deleting && <section className="info-box" aria-label="Confirmar exclusão"><div><h3>Excluir este lançamento?</h3><p>{deleting.description || "Sem descrição"} · {currency(deleting.amount)}. A exclusão não pode ser desfeita pela interface.</p><div className="form-actions"><button className="button primary" disabled={action.pending} onClick={async () => { if (await action.run("transaction.delete", { id: deleting.id, confirmed: true }, "Lançamento excluído.")) setDeleting(null); }}>Confirmar exclusão</button><button className="button secondary" disabled={action.pending} onClick={() => setDeleting(null)}>Cancelar exclusão</button></div></div></section>}
    {!sorted.length ? <div className="empty-state"><Icon name="history" size={32} /><h3>Nenhuma movimentação por aqui</h3><p>Adicione um lançamento ou experimente outro filtro.</p></div> :
    <div className="table-wrap"><table><caption className="sr-only">Movimentações financeiras</caption><thead><tr><th>Descrição</th><th className="category-column">Categoria</th><th>Data</th><th className="text-right">Valor</th>{editable && <th>Ações</th>}</tr></thead><tbody>{sorted.map((item) => {
      const category = data?.categories.find((c) => c.id === item.category_id);
      return <tr key={item.id}><td><div className="transaction-name"><span className={"transaction-icon " + item.type}><Icon name={item.type === "income" ? "up" : "down"} size={17} /></span><div><strong>{item.description || category?.name || "Sem descrição"}</strong><small>{item.status === "planned" ? "Prevista" : item.installment_plan_id ? "Paga" : item.auto_realize ? "Realizada pela data" : "Realizada"}{item.expense_kind ? " · " + (item.expense_kind === "fixed" ? "Fixa" : "Variável") : ""}{item.recurrence_id ? " · Recorrente" : ""}</small>{item.installment_plan_id && <button type="button" className="text-link mt-2" onClick={() => setInstallment({ planId: item.installment_plan_id! })}>Parcela {item.installment_number}/{item.total_installments}</button>}</div></div></td><td className="category-column"><span className="category-tag"><i style={{ background: category?.color }} />{category?.name}</span></td><td className="date-cell">{dateLabel(item.date)}{item.due_date && <small className="installment-row-note">Vence: {item.due_date.split("-").reverse().join("/")}</small>}{item.payment_date && <small className="installment-row-note">Paga: {item.payment_date.split("-").reverse().join("/")}</small>}</td><td className={"amount " + (item.type === "income" ? "positive" : "")}>{item.type === "income" ? "+" : "−"} {currency(item.amount)}</td>{editable && <td><div className="row-actions">{item.installment_plan_id ? <><button className="text-link" onClick={() => setInstallment({ planId: item.installment_plan_id! })}>Ver compra</button>{item.status === "planned" && <button className="text-link" onClick={() => setInstallment({ planId: item.installment_plan_id!, paymentId: item.id })}>Pagar</button>}</> : <><button className="text-link" disabled={action.pending} aria-label={"Editar " + (item.description || "lançamento")} onClick={() => setEditing(item)}>Editar</button>{item.status === "planned" && <button className="text-link" disabled={action.pending} onClick={() => void action.run("transaction.confirm", { id: item.id }, "Ocorrência confirmada.")}>{item.type === "income" ? "Receber" : "Pagar"}</button>}<button className="text-link" disabled={action.pending} aria-label={"Excluir " + (item.description || "lançamento")} onClick={() => setDeleting(item)}>Excluir</button></>}</div></td>}</tr>;
    })}</tbody></table></div>}</>;
}
