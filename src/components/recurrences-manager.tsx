"use client";
import { useRef, useState, type FormEvent } from "react";
import { useFinance } from "./finance-provider";
import { ActionMessages, useFinanceAction } from "./finance-action";
import { currency, inputMoney } from "@/lib/finance";
import type { Recurrence, TransactionType } from "@/types/finance";

export function RecurrencesManager() {
  const { data, month } = useFinance();
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [type, setType] = useState<TransactionType>("expense");
  const [ending, setEnding] = useState<Recurrence | null>(null);
  const id = useRef<string | null>(null);
  const action = useFinanceAction();
  if (!data) return null;
  const currentMonth = data.today.slice(0, 7);
  const effective = month > currentMonth ? month : currentMonth;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    id.current ??= crypto.randomUUID();
    if (await action.run("recurrence.save", { ...Object.fromEntries(new FormData(form)), type, id: editing?.id ?? id.current, existing: Boolean(editing) }, "Regra mensal salva. Previsões atualizadas.")) {
      setEditing(null); id.current = null; form.reset();
    }
  }
  return <section className="panel form-panel"><h2>Receitas e despesas recorrentes</h2><p className="muted mb-6">Os lançamentos são gerados ao consultar cada mês. Receitas com data até hoje entram como realizadas; futuras ficam previstas. Despesas precisam de confirmação no histórico, onde você também pode corrigir a situação de uma receita. Dias inexistentes usam o último dia do mês.</p>
    <form key={(editing?.id ?? "new") + type} onSubmit={submit}><fieldset disabled={action.pending}><legend className="sr-only">{editing ? "Editar regra mensal" : "Nova regra mensal"}</legend>
    <div className="form-grid"><label className="field">Tipo de recorrência<select value={type} disabled={Boolean(editing)} onChange={(e) => { setType(e.target.value as TransactionType); id.current = null; }}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
    <label className="field">Valor mensal (R$)<input name="amount" inputMode="decimal" required maxLength={16} defaultValue={editing ? inputMoney(editing.amount) : ""} /></label>
    <label className="field">Categoria da recorrência<select name="category_id" required defaultValue={editing?.category_id ?? ""}><option value="" disabled>Selecione</option>{data.categories.filter((c) => c.type === type && (c.active || c.id === editing?.category_id)).map((c) => <option key={c.id} value={c.id}>{c.name}{!c.active ? " (arquivada)" : ""}</option>)}</select></label>
    <label className="field">Dia de vencimento<input name="day_of_month" type="number" min={1} max={31} required defaultValue={editing?.day_of_month ?? 5} /></label>
    <label className="field">Mês inicial<input name="start_month" type="month" min="2000-01" max="2100-12" required defaultValue={editing?.start_month.slice(0, 7) ?? month} /></label>
    <label className="field">Mês final (opcional)<input name="end_month" type="month" min="2000-01" max="2100-12" defaultValue={editing?.end_month?.slice(0, 7) ?? ""} /></label>
    {type === "expense" && <label className="field">Classificação da recorrência<select name="expense_kind" defaultValue={editing?.expense_kind ?? "fixed"}><option value="fixed">Fixa</option><option value="variable">Variável</option></select></label>}
    <label className="field">Aplicar alterações a partir de<input name="effective_month" type="month" min={currentMonth} max="2100-12" required defaultValue={effective} /><small>Somente previsões deste mês em diante. Realizadas não serão alteradas.</small></label></div>
    <label className="field">Descrição da recorrência (opcional)<input name="description" maxLength={200} defaultValue={editing?.description ?? ""} /></label>
    <div className="form-actions"><button className="button primary" type="submit">{action.pending ? "Salvando..." : editing ? "Salvar regra" : "Criar recorrência"}</button>{editing && <button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancelar edição</button>}</div></fieldset></form>
    <ActionMessages {...action} />
    {ending && <form className="info-box" onSubmit={async (e) => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); if (await action.run("recurrence.archive", { ...values, id: ending.id }, "Regra encerrada. Histórico realizado preservado.")) setEnding(null); }}><div><h3>Encerrar esta recorrência?</h3><p>As previsões não realizadas a partir do mês abaixo serão removidas. Ocorrências realizadas serão preservadas.</p><label className="field">Encerrar a partir de<input type="month" name="effective_month" min={currentMonth} max="2100-12" defaultValue={effective} required /></label><div className="form-actions"><button className="button primary" disabled={action.pending}>Confirmar encerramento</button><button className="button secondary" type="button" disabled={action.pending} onClick={() => setEnding(null)}>Cancelar</button></div></div></form>}
    {!data.recurrences.length ? <div className="empty-state"><h3>Nenhuma regra mensal cadastrada</h3><p>Comece com uma renda ou despesa fixa no formulário acima.</p></div> : <ul className="management-list">{data.recurrences.map((r) => <li key={r.id}><div><strong>{r.description || data.categories.find((c) => c.id === r.category_id)?.name}</strong><small>{r.type === "income" ? "Receita" : "Despesa"} · {currency(r.amount)} · dia {r.day_of_month} · {r.active ? "Ativa" : "Encerrada"}</small></div><div className="row-actions">{r.active && <><button className="text-link" disabled={action.pending} onClick={() => { setEditing(r); setType(r.type); }}>Editar regra</button><button className="text-link" disabled={action.pending} onClick={() => setEnding(r)}>Encerrar</button></>}</div></li>)}</ul>}
  </section>;
}