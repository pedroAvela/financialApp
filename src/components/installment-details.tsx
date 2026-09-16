"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { InstallmentPlan, Transaction } from "@/types/finance";
import { currency, inputMoney } from "@/lib/finance";
import { useFinance } from "./finance-provider";
import { ActionMessages, useFinanceAction } from "./finance-action";
import { InstallmentForm } from "./installment-form";

const fullDate = (value?: string | null) => value?.split("-").reverse().join("/") ?? "—";

export function InstallmentDetails({ planId, onClose, initialPaymentId }: { planId: string; onClose: () => void; initialPaymentId?: string }) {
  const { data } = useFinance();
  const action = useFinanceAction();
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState<"cancel" | "delete" | null>(null);
  const [paying, setPaying] = useState(initialPaymentId ?? null);
  const plan = data?.installmentPlans.find((p) => p.id === planId);
  if (!data || !plan) return <section className="panel form-panel"><p role="status">Este parcelamento não está mais disponível.</p><button className="button secondary mt-4" onClick={onClose}>Voltar</button></section>;
  const rows = data.installmentTransactions.filter((t) => t.installment_plan_id === planId).sort((a, b) => a.installment_number! - b.installment_number!);
  const paid = rows.filter((t) => t.status === "realized");
  const pending = rows.filter((t) => t.status === "planned" && !t.deleted_at);
  const payment = pending.find((t) => t.id === paying);
  if (editing) return <section className="panel form-panel"><InstallmentForm key={plan.id} plan={plan} hasPaid={paid.length > 0} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} /></section>;
  if (payment) return <PaymentForm key={payment.id} transaction={payment} plan={plan} onClose={() => setPaying(null)} />;
  return <section className="panel form-panel" aria-label="Detalhes do parcelamento">
    <div className="section-title"><div><h2>{plan.description}</h2><p className="muted">Compra em {fullDate(plan.purchase_date)} · {plan.installment_count} parcelas · {plan.status === "cancelled" ? "Futuras canceladas" : paid.length === plan.installment_count ? "Quitada" : "Em andamento"}</p></div></div>
    <p className="muted mb-5">{data.categories.find((c) => c.id === plan.category_id)?.name} · {plan.expense_kind === "fixed" ? "Fixa" : "Variável"}{plan.payment_method ? " · " + plan.payment_method : ""}</p>
    <div className="history-summary"><span>Total da compra<strong>{currency(plan.total_amount_cents)}</strong></span><span>Valor efetivamente pago<strong>{currency(paid.reduce((sum, t) => sum + t.amount, 0))}</strong></span><span>Parcelas ainda previstas<strong>{currency(pending.reduce((sum, t) => sum + t.amount, 0))}</strong></span></div>
    <div className="table-wrap mt-6"><table><caption className="sr-only">Todas as parcelas da compra</caption><thead><tr><th>Parcela</th><th>Vencimento</th><th>Pagamento</th><th>Valor</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{rows.map((t) => <tr key={t.id}>
      <td>{t.installment_number}/{t.total_installments}<small className="installment-row-note">{t.description}</small></td><td>{fullDate(t.due_date)}</td><td>{fullDate(t.payment_date)}</td><td>{currency(t.amount)}{t.status === "realized" && t.amount !== t.scheduled_amount_cents && <small className="installment-row-note">Previsto: {currency(t.scheduled_amount_cents!)}</small>}</td><td>{t.deleted_at ? "Cancelada" : t.status === "realized" ? "Paga" : "Prevista"}</td><td>{!t.deleted_at && t.status === "planned" ? <button className="text-link" disabled={action.pending} onClick={() => setPaying(t.id)} aria-label={`Pagar parcela ${t.installment_number}`}>Pagar</button> : "—"}</td>
    </tr>)}</tbody></table></div>
    {confirmation && <section className="info-box mt-6" aria-label="Confirmar ação no parcelamento"><div><h3>{confirmation === "delete" ? "Excluir a compra e todas as parcelas?" : "Cancelar todas as parcelas não pagas?"}</h3><p>{confirmation === "delete" ? "A compra será removida por inteiro. Essa ação não pode ser desfeita." : "Todas as parcelas ainda previstas, inclusive vencidas, serão canceladas. As parcelas pagas e seus valores serão preservados. Essa ação não pode ser desfeita."}</p><div className="form-actions"><button className="button primary" disabled={action.pending} onClick={async () => {
      if (await action.run("installment." + confirmation, { id: plan.id, confirmed: true }, confirmation === "delete" ? "Compra excluída." : "Parcelas futuras canceladas.")) {
        setConfirmation(null); if (confirmation === "delete") onClose();
      }
    }}>{action.pending ? "Aguarde..." : confirmation === "delete" ? "Confirmar exclusão da compra" : "Confirmar cancelamento das futuras"}</button><button className="button secondary" disabled={action.pending} onClick={() => setConfirmation(null)}>Voltar sem alterar</button></div></div></section>}
    <ActionMessages {...action} />
    {!confirmation && <div className="form-actions">{plan.status === "active" && pending.length > 0 && <><button className="button secondary" onClick={() => setEditing(true)}>Editar parcelamento</button><button className="button secondary" onClick={() => setConfirmation("cancel")}>Cancelar parcelas futuras</button></>}{paid.length === 0 && <button className="button secondary" onClick={() => setConfirmation("delete")}>Excluir compra inteira</button>}<button className="button secondary" onClick={onClose}>Voltar</button></div>}
  </section>;
}

function PaymentForm({ transaction, plan, onClose }: { transaction: Transaction; plan: InstallmentPlan; onClose: () => void }) {
  const { data } = useFinance();
  const action = useFinanceAction();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await action.run("installment.pay", { ...Object.fromEntries(new FormData(event.currentTarget)), id: transaction.id }, "Pagamento registrado.")) onClose();
  }
  return <form className="panel form-panel" onSubmit={submit} aria-busy={action.pending}><h2>Registrar pagamento da parcela {transaction.installment_number}/{transaction.total_installments}</h2><p className="muted mt-3 mb-6">{transaction.description} · Vencimento original: {fullDate(transaction.due_date)} · Previsto: {currency(transaction.scheduled_amount_cents!)}. O gasto será contabilizado no mês do pagamento.</p>
    <fieldset disabled={action.pending}><legend className="sr-only">Dados do pagamento</legend><div className="form-grid"><label className="field">Valor pago (R$)<input name="amount" inputMode="decimal" required maxLength={16} defaultValue={inputMoney(transaction.amount)} /></label><label className="field">Data do pagamento<input name="payment_date" type="date" min={plan.purchase_date} max={data!.today} defaultValue={data!.today} required /></label></div><p className="form-note">Confira os dados. Após confirmar, esta parcela será preservada como histórico pago.</p><ActionMessages {...action} /><div className="form-actions"><button className="button primary" type="submit">{action.pending ? "Registrando..." : "Confirmar pagamento"}</button><button className="button secondary" type="button" onClick={onClose}>Cancelar pagamento</button></div></fieldset>
  </form>;
}

export function InstallmentsManager() {
  const { data } = useFinance();
  const [selected, setSelected] = useState<string | null>(null);
  if (!data) return null;
  if (selected) return <InstallmentDetails key={selected} planId={selected} onClose={() => setSelected(null)} />;
  return <section className="panel form-panel" aria-label="Compras parceladas"><div className="section-title"><div><h2>Compras parceladas</h2><p>Compromissos de todos os períodos, separados das regras recorrentes mensais.</p></div></div>
    {!data.installmentPlans.length ? <div className="empty-state"><p>Você ainda não tem compras parceladas.</p><Link href="/lancamento" className="text-link mt-4">Adicionar uma compra</Link></div> : <ul className="management-list">{[...data.installmentPlans].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((plan) => {
      const paid = data.installmentTransactions.filter((t) => t.installment_plan_id === plan.id && t.status === "realized").length;
      return <li key={plan.id}><div><strong>{plan.description}</strong><p className="muted mt-2">{currency(plan.total_amount_cents)} · {plan.installment_count} parcelas · {paid} pagas{plan.status === "cancelled" ? " · Futuras canceladas" : paid === plan.installment_count ? " · Quitada" : ""}</p></div><button className="text-link" onClick={() => setSelected(plan.id)} aria-label={"Ver parcelamento " + plan.description}>Ver detalhes</button></li>;
    })}</ul>}
  </section>;
}
