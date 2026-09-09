import type { Metadata } from "next";
import { FinanceProvider } from "@/components/finance-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "App Finanças", template: "%s | App Finanças" },
  description: "Seu dinheiro, com clareza. Controle financeiro pessoal com dados simulados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body><FinanceProvider>{children}</FinanceProvider></body></html>;
}
