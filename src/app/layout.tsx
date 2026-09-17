import type { Metadata } from "next";
import { headers } from "next/headers";
import { ThemeSync } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "App Finanças", template: "%s | App Finanças" },
  description: "Seu dinheiro, com clareza. Controle financeiro pessoal, com receitas, despesas e planejamento mensal.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <html lang="pt-BR" suppressHydrationWarning><head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: `(function(){var t;try{t=localStorage.getItem('app-financas-theme')}catch(e){}document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()` }} /></head><body><ThemeSync />{children}</body></html>;
}
