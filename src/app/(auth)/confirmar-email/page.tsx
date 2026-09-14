import type { Metadata } from "next";
import { EmailConfirmation } from "@/components/email-confirmation";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Confirmar e-mail", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ next?: string; recovery?: string }> }) {
  const params = await searchParams;
  return <EmailConfirmation next={safeNext(params.next, "/configuracao-inicial")} recovery={params.recovery === "1"} />;
}
