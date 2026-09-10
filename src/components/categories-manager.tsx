"use client";
import { useRef, useState, type FormEvent } from "react";
import { useFinance } from "./finance-provider";
import { ActionMessages, useFinanceAction } from "./finance-action";
import type { Category } from "@/types/finance";

export function CategoriesManager() {
  const { data } = useFinance();
  const [editing, setEditing] = useState<Category | null>(null);
  const action = useFinanceAction();
  const id = useRef<string | null>(null);
  if (!data) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    id.current ??= crypto.randomUUID();
    if (await action.run("category.save", { ...Object.fromEntries(new FormData(form)), id: editing?.id ?? id.current, existing: Boolean(editing) }, "Categoria salva.")) {
      setEditing(null); id.current = null; form.reset();
    }
  }
  return <section className="panel form-panel"><h2>Categorias</h2><p className="muted mb-6">Arquivar impede novos lançamentos; o histórico é preservado. O tipo de uma categoria existente não pode ser alterado.</p>
    <form onSubmit={submit} key={editing?.id ?? "new"} aria-busy={action.pending}><fieldset disabled={action.pending}><legend className="sr-only">{editing ? "Editar categoria" : "Nova categoria"}</legend><div className="form-grid">
      <label className="field">Nome da categoria<input name="name" required maxLength={60} defaultValue={editing?.name ?? ""} /></label>
      <label className="field">Tipo de categoria<select name="type" disabled={Boolean(editing)} defaultValue={editing?.type ?? "expense"}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
      <label className="field">Cor<input name="color" type="color" defaultValue={editing?.color ?? "#137968"} /></label>
    </div><div className="form-actions"><button className="button primary" type="submit">{action.pending ? "Salvando..." : editing ? "Salvar categoria" : "Criar categoria"}</button>{editing && <button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancelar edição</button>}</div></fieldset></form>
    <ActionMessages {...action} /><ul className="management-list">{data.categories.map((c) => <li key={c.id}><div><strong><span className="color-dot" style={{ background: c.color }} />{c.name}</strong><small>{c.type === "expense" ? "Despesa" : "Receita"} · {c.active ? "Ativa" : "Arquivada"}</small></div><div className="row-actions"><button className="text-link" disabled={action.pending} onClick={() => setEditing(c)}>Editar</button><button className="text-link" disabled={action.pending} onClick={() => void action.run("category.archive", { id: c.id, state: c.active ? "archived" : "active" }, c.active ? "Categoria arquivada." : "Categoria reativada.")}>{c.active ? "Arquivar" : "Reativar"}</button></div></li>)}</ul>
  </section>;
}