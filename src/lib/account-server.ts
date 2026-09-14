import "server-only";
import { createClient as createIsolatedClient, type User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { deleteOwnAccount, type AccountIdentity, type OwnedObject } from "./account-deletion";

function identity(user: User | null): AccountIdentity | null {
  return user ? { id: user.id, email: user.email, hasMfa: user.factors?.some((factor) => factor.status === "verified") ?? false } : null;
}

export async function deleteCurrentAccount(body: unknown) {
  const sessionClient = await createClient();
  const { url, key } = getSupabaseConfig();
  const verification = createIsolatedClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  await deleteOwnAccount(body, {
    async getIdentity() {
      const { data, error } = await sessionClient.auth.getUser();
      if (error && error.status && error.status >= 500) throw new Error("Auth indisponível");
      return error ? null : identity(data.user);
    },
    async reauthenticate(email, password) {
      const { data, error } = await verification.auth.signInWithPassword({ email, password });
      return error ? null : identity(data.user);
    },
    async releaseReauthentication() { await verification.auth.signOut({ scope: "local" }); },
    getAdmin() {
      const admin = createAdminClient();
      return {
        async listObjects(userId) {
          const { data, error } = await admin.rpc("account_owned_storage_objects", { p_user_id: userId });
          if (error || !Array.isArray(data)) throw new Error("Inventário indisponível");
          return data as OwnedObject[];
        },
        async removeObjects(bucket, paths) {
          const { error } = await admin.storage.from(bucket).remove(paths);
          if (error) throw new Error("Remoção de arquivos incompleta");
        },
        async deleteUser(userId, softDelete) {
          const { error } = await admin.auth.admin.deleteUser(userId, softDelete);
          // Uma requisição simultânea pode ter concluído a mesma exclusão.
          if (error && error.code !== "user_not_found") throw new Error("Exclusão não concluída");
        },
      };
    },
  });
  try { await sessionClient.auth.signOut({ scope: "local" }); } catch { /* Cookies também são expirados na resposta. */ }
}
