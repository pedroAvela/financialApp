import type { Metadata } from "next";
import { PasswordForm } from "@/components/password-form";

export const metadata: Metadata = { title: "Recuperar senha" };
export default async function RecoverPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <PasswordForm invalidLink={params.error === "link_invalido"} callbackError={params.error} />;
}
