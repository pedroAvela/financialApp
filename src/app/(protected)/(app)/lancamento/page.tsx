import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { TransactionForm } from "@/components/transaction-form";

export const metadata: Metadata = { title: "Novo lançamento" };
export default function TransactionPage() {
  return <div className="narrow-content"><PageHeading eyebrow="SEU CONTROLE EM DIA" title="Novo lançamento" description="Um pequeno registro. Mais clareza sobre o seu dinheiro." /><TransactionForm /></div>;
}

