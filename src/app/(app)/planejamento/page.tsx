import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { FinancialForm } from "@/components/financial-form";

export const metadata: Metadata = { title: "Planejamento e limites" };
export default function PlanningPage() {
  return <><PageHeading eyebrow="MAIS INTENÇÃO, MENOS IMPREVISTOS" title="Planejamento e limites" description="Dê um destino para o seu dinheiro antes de ele sair." /><FinancialForm /></>;
}

