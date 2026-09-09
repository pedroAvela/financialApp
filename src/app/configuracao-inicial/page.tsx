import type { Metadata } from "next";
import Link from "next/link";
import { Brand, PageHeading } from "@/components/ui";
import { FinancialForm } from "@/components/financial-form";

export const metadata: Metadata = { title: "Configuração inicial" };
export default function SetupPage() {
  return <main className="onboarding"><header><Link href="/dashboard"><Brand /></Link><span className="demo-badge">Configuração inicial</span></header><div className="onboarding-content"><PageHeading eyebrow="SEU PONTO DE PARTIDA" title="Um plano que cabe na sua vida." description="Conte um pouco sobre seu mês. Estes valores vão guiar seu controle financeiro de demonstração." /><FinancialForm initial /><Link href="/dashboard" className="text-link mt-6">Explorar com os valores de exemplo →</Link></div></main>;
}

