import { redirect } from "next/navigation";
import { FinanceProvider } from "@/components/finance-provider";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const name = typeof user.user_metadata.name === "string" ? user.user_metadata.name : "Você";
  return <FinanceProvider key={user.id} profile={{ name, email: user.email ?? "" }}>{children}</FinanceProvider>;
}
