"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFinance } from "@/components/finance-provider";
import { Icon, type IconName } from "@/components/icon";
import { Brand } from "@/components/ui";

const navigation: { href: string; label: string; mobile: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Visão geral", mobile: "Início", icon: "dashboard" },
  { href: "/historico", label: "Movimentações", mobile: "Histórico", icon: "history" },
  { href: "/planejamento", label: "Planejamento", mobile: "Limites", icon: "plan" },
  { href: "/configuracoes", label: "Configurações", mobile: "Ajustes", icon: "settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { settings, month, setMonth } = useFinance();
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
    <aside className="sidebar">
      <Link href="/dashboard" aria-label="App Finanças — início"><Brand /></Link>
      <p className="nav-caption">MEU ESPAÇO</p>
      <nav aria-label="Navegação principal">{navigation.map((item) => <Link key={item.href} href={item.href} className={`nav-link ${pathname === item.href ? "active" : ""}`} aria-current={pathname === item.href ? "page" : undefined}><Icon name={item.icon} />{item.label}</Link>)}</nav>
      <div className="sidebar-tip"><Icon name="spark" /><strong>Um passo de cada vez.</strong><p>Organizar o presente é cuidar do seu futuro.</p></div>
      <div className="sidebar-bottom"><span className="demo-dot" /> Ambiente de demonstração<Link href="/login" className="nav-link"><Icon name="logout" />Voltar ao login</Link></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="desktop-breadcrumb">Meu espaço <span>/</span> <strong>{navigation.find((item) => item.href === pathname)?.label ?? "Novo lançamento"}</strong></div><Link href="/dashboard" className="mobile-brand"><Brand /></Link><div className="topbar-actions"><label className="month-control"><Icon name="calendar" size={17} /><span className="sr-only">Mês de referência</span><input type="month" aria-label="Mês de referência" value={month} min="2000-01" max="2100-12" onChange={(event) => { if (/^\d{4}-\d{2}$/.test(event.target.value) && event.target.validity.valid) setMonth(event.target.value); }} /></label><Link className="avatar" href="/configuracoes" aria-label="Editar perfil">{settings.name.slice(0, 2).toUpperCase()}</Link></div></header>
      <main id="main-content" className="main-content">{children}<footer className="page-footer">App Finanças <span>Feito para uma vida financeira mais leve.</span><span className="demo-badge">Dados simulados</span></footer></main>
    </div>
    {pathname !== "/lancamento" && <Link href="/lancamento" className="floating-add" aria-label="Lançar despesa rápida"><Icon name="plus" size={25} /></Link>}
    <nav className="mobile-nav" aria-label="Navegação no celular">{navigation.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined}><Icon name={item.icon} size={21} /><span>{item.mobile}</span></Link>)}</nav>
  </div>;
}
