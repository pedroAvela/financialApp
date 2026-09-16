"use client";
import { useRef, useState, type FormEvent } from "react";
import { currency, inputMoney, moneyToCents } from "@/lib/finance";
import { installmentSchedule } from "@/lib/installments";
import { installmentInput } from "@/lib/finance-validation";
import type { InstallmentPlan } from "@/types/finance";
import { useFinance } from "./finance-provider";
import { ActionMessages, useFinanceAction } from "./finance-action";

const fullDate = (value: string) => value.split("-").reverse().join("/");
export function InstallmentForm({ plan, hasPaid = false, onSaved, onCancel }: {
  plan?: InstallmentPlan; hasPaid?: boolean; onSaved: (total: number, firstDue: string) => void; onCancel: () => void;
}) {
  const { data } = useFinance();
  const action = useFinanceAction();
  const requestId = useRef<string | null>(null);
  const [total, setTotal] = useState(plan ? inputMoney(plan.total_amount_cents) : "");
  const [count, setCount] = useState(String(plan?.installment_count ?? 2));
  const [purchase, setPurchase] = useState(plan?.purchase_date ?? data!.today);
  const [first, setFirst] = useState(plan?.first_due_date ?? data!.today);
  const [error, setError] = useState("");
  if (!data) return null;
  let preview: ReturnType<typeof installmentSchedule> = [];
  let previewError = "";
  if (total) {
    try { preview = installmentSchedule(moneyToCents(total), Number(count), first); }
    catch (error) { previewError = error instanceof Error ? error.message : "Confira os dados das parcelas."; }
  }
  const available = data.categories.filter((c) => c.type === "expense" && (c.active || c.id === plan?.category_id));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.pending) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    try { installmentInput(values); } catch (error) { setError(error instanceof Error ? error.message : "Confira os dados."); return; }
    // Keep the same key after timeouts and retries, including changed inputs.
    // The database rejects conflicting payloads instead of creating duplicates.
    requestId.current ??= crypto.randomUUID();
    const ok = await action.run(plan ? "installment.edit" : "installment.create", {
      ...values, client_request_id: requestId.current, ...(plan ? { id: plan.id, confirmed: values.confirm_edit === "on" } : {}),
    }, plan ? "Parcelamento atualizado." : "Compra parcelada salva.");
    if (ok) onSaved(moneyToCents(String(values.total_amount)), String(values.first_due_date));
  }
  return <form onSubmit={submit} aria-busy={action.pending} className="installment-form">
    <fieldset disabled={action.pending}><legend className="sr-only">{plan ? "Editar parcelamento" : "Compra parcelada"}</legend>
      {!plan && <label className="installment-toggle"><input type="checkbox" checked onChange={onCancel} />Compra parcelada</label>}
      <h2 className="mb-3">{plan ? "Editar parcelamento" : "Planeje sua compra parcelada"}</h2>
      <p className="muted mb-6">O total será dividido em despesas mensais previstas. Cada parcela só entra nos gastos realizados quando você registrar o pagamento.</p>
      {hasPaid && <p className="info-box mb-5">Já há parcelas pagas. Total, quantidade e datas estão protegidos. As outras informações serão atualizadas somente nas parcelas não pagas; o histórico pago será preservado.</p>}
      <div className="form-grid">
        <label className="field">Valor total da compra (R$)<input name="total_amount" inputMode="decimal" required maxLength={16} value={total} onChange={(e) => setTotal(e.target.value)} readOnly={hasPaid} placeholder="0,00" /></label>
        <label className="field">Quantidade de parcelas<input name="installment_count" type="number" min={2} max={60} step={1} required value={count} onChange={(e) => setCount(e.target.value)} readOnly={hasPaid} /></label>
        <label className="field">Data da compra<input name="purchase_date" type="date" min="2000-01-01" max="2100-12-31" required value={purchase} onChange={(e) => setPurchase(e.target.value)} readOnly={hasPaid} /></label>
        <label className="field">Primeiro vencimento<input name="first_due_date" type="date" min={purchase || "2000-01-01"} max="2100-12-31" required value={first} onChange={(e) => setFirst(e.target.value)} readOnly={hasPaid} /></label>
        <label className="field">Categoria<select name="category_id" required defaultValue={plan?.category_id ?? ""}><option value="" disabled>Selecione uma categoria</option>{available.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (arquivada)"}</option>)}</select></label>
        <label className="field">Classificação<select name="expense_kind" defaultValue={plan?.expense_kind ?? "variable"}><option value="variable">Variável</option><option value="fixed">Fixa</option></select></label>
      </div>
      <label className="field">Descrição da compra<input name="description" required maxLength={200} defaultValue={plan?.description ?? ""} placeholder="Ex.: geladeira, computador" /></label>
      <label className="field">Forma de pagamento (opcional)<input name="payment_method" maxLength={60} defaultValue={plan?.payment_method ?? ""} placeholder="Ex.: boleto, cartão" /><small>Apenas uma identificação. Não inclui faturas, fechamento ou limite de cartão.</small></label>
      {!available.length && <p className="info-box">Cadastre uma categoria de despesa em Configurações para continuar.</p>}
      <section className="installment-preview" aria-label="Prévia das parcelas" aria-live="polite">
        <h3>Prévia das parcelas</h3>
        {preview.length ? <><p className="muted mt-3">Total de {currency(moneyToCents(total))} em {count} parcelas de aproximadamente {currency(preview[0].amount)}.</p>
          <p className="form-note">{preview.at(-1)!.amount !== preview[0].amount ? `Ajuste de ${currency(preview.at(-1)!.amount - preview[0].amount)} na última parcela, que será de ${currency(preview.at(-1)!.amount)}.` : "Sem ajuste de centavos na última parcela."} O dia original retorna nos meses em que existe.</p>
          <div className="table-wrap installment-schedule"><table><caption className="sr-only">Prévia de todos os vencimentos e valores</caption><thead><tr><th>Parcela</th><th>Vencimento</th><th className="text-right">Valor previsto</th></tr></thead><tbody>{preview.map((row) => <tr key={row.number}><td>{row.number}/{count}</td><td>{fullDate(row.due_date)}</td><td className="amount">{currency(row.amount)}</td></tr>)}</tbody></table></div>
        </> : <p className="muted mt-3">{previewError || "Informe o valor total, a quantidade e o primeiro vencimento para conferir a divisão."}</p>}
      </section>
      {plan && <label className="installment-toggle mt-5"><input name="confirm_edit" type="checkbox" required />Confirmo a alteração das parcelas não pagas. {hasPaid ? "As pagas permanecerão intactas." : "Alterar total, quantidade ou datas substitui a programação anterior."}</label>}
      {error && <p className="error-message" role="alert">{error}</p>}<ActionMessages {...action} />
      <div className="form-actions"><button className="button primary" type="submit" disabled={!preview.length || !available.length}>{action.pending ? "Salvando..." : plan ? "Salvar alterações do parcelamento" : "Salvar compra parcelada"}</button><button className="button secondary" type="button" onClick={onCancel}>{plan ? "Cancelar edição" : "Voltar à despesa avulsa"}</button></div>
    </fieldset>
  </form>;
}
