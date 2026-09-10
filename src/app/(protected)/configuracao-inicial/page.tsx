import { ThemeToggle } from "@/components/theme-toggle";
import type { Metadata } from "next";
import Link from "next/link";
import { Brand, PageHeading } from "@/components/ui";
import { FinancialForm } from "@/components/financial-form";

export const metadata: Metadata = { title: "Configuração inicial" };
export default function SetupPage() {
  return <main className="onboarding"><header><Link href="/dashboard"><Brand /></Link><div className="header-controls"><span className="demo-badge">Configuração inicial</span><ThemeToggle /></div></header><div className="onboarding-content"><PageHeading eyebrow="SEU PONTO DE PARTIDA" title="Um plano que cabe na sua vida." description="Configure rendas, despesas fixas mensais e orçamento variável. Você pode revisar estes valores depois." /><FinancialForm initial /><Link href="/dashboard" className="text-link mt-6">Ir para o painel →</Link></div></main>;
}

