import Link from "next/link";
import { Brand } from "@/components/ui";
import { Icon } from "@/components/icon";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="auth-layout"><section className="auth-story"><Link href="/dashboard"><Brand /></Link><div className="auth-story-content"><span className="story-label"><span className="live-dot" /> MENOS COMPLICAÇÃO. MAIS VIDA.</span><h2>Seu dinheiro<br />em ordem.<br /><em>Seus planos<br />em movimento.</em></h2><p>Entenda seus gastos, encontre seu equilíbrio e abra espaço para o que importa.</p><div className="story-preview"><span className="small-icon"><Icon name="check" /></span><div><strong>Clareza para o seu dia a dia</strong><p>Um lançamento de cada vez.</p></div><div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /></div></div></div><p className="story-footer">App Finanças · Seu dinheiro, com clareza.</p><div className="story-orbit" aria-hidden="true" /></section><section className="auth-form-side"><Link href="/dashboard" className="auth-mobile-brand"><Brand /></Link>{children}<p className="auth-bottom">Controle simples. Escolhas mais conscientes.</p></section></main>;
}

