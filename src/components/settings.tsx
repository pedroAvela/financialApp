"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useFinance } from "@/components/finance-provider";
import { PageHeading } from "@/components/ui";
import { Icon } from "@/components/icon";

export function Settings() {
  const { settings, updateSettings } = useFinance();
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    if (!name) return setMessage("Informe seu nome.");
    updateSettings({ name, email: String(data.get("email")).trim() });
    setMessage("Perfil de demonstração atualizado nesta sessão.");
  }
  return <>
    <PageHeading eyebrow="DO SEU JEITO" title="Configurações" description="Um espaço para deixar seu controle financeiro com a sua cara." />
    <div className="settings-grid"><form className="panel form-panel" onSubmit={submit} onChange={() => setMessage("")}><h2>Seu perfil</h2><p className="muted mb-6">Informações usadas apenas nesta demonstração.</p><label className="field">Nome<input name="name" autoComplete="name" defaultValue={settings.name} required maxLength={60} /></label><label className="field">E-mail<input type="email" name="email" autoComplete="email" defaultValue={settings.email} required maxLength={120} /></label><div className="form-grid"><label className="field">Idioma<input value="Português (Brasil)" readOnly /></label><label className="field">Moeda<input value="Real brasileiro (R$)" readOnly /></label></div>{message && <p role="status" className="success-message">{message}</p>}<button className="button primary" type="submit"><Icon name="check" />Salvar alterações</button></form>
    <div className="space-y-6"><section className="panel form-panel"><span className="small-icon"><Icon name="plan" /></span><h2 className="mt-4">Preferências financeiras</h2><p className="muted mt-2 mb-5">Revise sua receita prevista, reserva e limites de gastos.</p><Link href="/planejamento" className="text-link">Ajustar planejamento <Icon name="arrow" size={17} /></Link><Link href="/configuracao-inicial" className="text-link mt-4">Rever configuração inicial <Icon name="arrow" size={17} /></Link></section><section className="info-box"><Icon name="shield" /><div><strong>Uma prévia do seu novo controle</strong><p>Login e cadastro são demonstrativos. Os dados voltam ao exemplo inicial ao recarregar a página.</p><Link href="/login" className="text-link mt-4">Voltar ao login <Icon name="logout" size={17} /></Link></div></section></div></div>
  </>;
}

