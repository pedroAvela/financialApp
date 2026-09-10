import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Redefinir senha" };
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/recuperar-senha?error=link_invalido");
  return <PasswordForm reset />;
}
