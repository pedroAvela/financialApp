export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Configure a URL e a chave publicável do Supabase no arquivo .env.local.");
  }
  // Only the public key belongs in this shared module. Never use a secret/service_role key.
  if (!key.startsWith("sb_publishable_")) {
    throw new Error("Use a chave publicável do Supabase (sb_publishable_).");
  }
  return { url, key };
}
