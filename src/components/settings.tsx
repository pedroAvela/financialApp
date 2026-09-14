"use client";
import Link from "next/link";
import type { FormEvent } from "react";
import { FinanceGate, useFinance } from "./finance-provider";
import { PageHeading } from "./ui";
import { Icon } from "./icon";
import { LogoutButton } from "./logout-button";
import { CategoriesManager } from "./categories-manager";
import { AccountDangerZone } from "./account-danger-zone";
import { ActionMessages, useFinanceAction } from "./finance-action";
export function Settings() { return <FinanceGate><SettingsContent /></FinanceGate>; }
function SettingsContent() {
  const { data, identity } = useFinance();
  const action = useFinanceAction();
  if (!data) return null;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await action.run("profile.save", Object.fromEntries(new FormData(event.currentTarget)), "Perfil atualizado."); }
  return <><PageHeading eyebrow="DO SEU JEITO" title="Configurações" description="Um espaço para deixar seu controle financeiro com a sua cara." />
    <div className="settings-grid"><form className="panel form-panel" onSubmit={submit}><h2>Seu perfil</h2><p className="muted mb-6">Preferências salvas para sua conta.</p><fieldset disabled={action.pending}><legend className="sr-only">Preferências do perfil</legend>
      <label className="field">Nome<input name="name" autoComplete="name" defaultValue={data.profile.name} required maxLength={60} /></label><label className="field">E-mail<input type="email" value={identity.email} readOnly /><small>E-mail da conta autenticada.</small></label>
      <label className="field">Fuso horário<input name="timezone" list="timezones" defaultValue={data.profile.timezone} required maxLength={100} /><datalist id="timezones"><option value="America/Sao_Paulo" /><option value="America/Manaus" /><option value="America/Rio_Branco" /><option value="America/Noronha" /><option value="Europe/Lisbon" /><option value="UTC" /></datalist><small>Identificador IANA. Define a data atual e o mês inicial.</small></label>
      <div className="form-grid"><label className="field">Idioma<input value="Português (Brasil)" readOnly /></label><label className="field">Moeda<input value="Real brasileiro (R$)" readOnly /></label></div><ActionMessages {...action} /><button className="button primary" type="submit"><Icon name="check" />{action.pending ? "Salvando..." : "Salvar alterações"}</button></fieldset></form>
      <div className="space-y-6"><section className="panel form-panel"><span className="small-icon"><Icon name="plan" /></span><h2 className="mt-4">Preferências financeiras</h2><p className="muted mt-2 mb-5">Mês calendário: do primeiro ao último dia. Os limites consideram somente despesas variáveis realizadas.</p><Link href="/planejamento" className="text-link">Ajustar planejamento <Icon name="arrow" size={17} /></Link><Link href="/configuracao-inicial" className="text-link mt-4">Rever configuração inicial <Icon name="arrow" size={17} /></Link></section><section className="info-box"><Icon name="shield" /><div><strong>Sua conta está protegida</strong><p>Os dados financeiros são privados e vinculados à sua conta.</p><LogoutButton /></div></section></div></div>
      <div className="mt-6"><CategoriesManager /></div><AccountDangerZone /></>;
}
