import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNext } from "./auth";

type CallbackAuth = Pick<SupabaseClient["auth"], "verifyOtp" | "exchangeCodeForSession">;

export function confirmationFailure(error: unknown, recovery = false) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const base = recovery ? "/recuperar-senha" : "/login";
  if (["pkce_code_verifier_not_found", "bad_code_verifier", "flow_state_not_found", "flow_state_expired"].includes(code)) {
    return `${base}?${recovery ? "error" : "notice"}=confirmacao_sem_sessao`;
  }
  if (["otp_expired", "bad_jwt", "invalid_credentials", "refresh_token_not_found", "refresh_token_already_used", "session_not_found"].includes(code)) {
    return `${base}?error=link_invalido`;
  }
  return `${base}?error=confirmacao_falhou`;
}

export async function confirmEmail(params: URLSearchParams, auth: CallbackAuth) {
  const type = params.get("type");
  const next = safeNext(params.get("next"), "/configuracao-inicial");
  const recovery = type === "recovery" || next === "/redefinir-senha";
  if (params.has("error") || params.has("error_code")) return confirmationFailure({ code: params.get("error_code") }, recovery);
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  try {
    if (tokenHash && (type === "signup" || type === "email" || type === "recovery")) {
      const result = await auth.verifyOtp({ token_hash: tokenHash, type });
      if (result.error) return confirmationFailure(result.error, recovery);
      if (!result.data.session) return recovery ? "/recuperar-senha?error=confirmacao_sem_sessao" : "/login?notice=email_confirmado";
      return recovery ? "/redefinir-senha" : next;
    }
    if (code && !tokenHash) {
      const result = await auth.exchangeCodeForSession(code);
      if (result.error) return confirmationFailure(result.error, recovery);
      if (!result.data.session) return recovery ? "/recuperar-senha?error=confirmacao_sem_sessao" : "/login?notice=confirmacao_sem_sessao";
      return recovery ? "/redefinir-senha" : next;
    }
  } catch (error) { return confirmationFailure(error, recovery); }
  return `${recovery ? "/recuperar-senha" : "/login"}?error=link_invalido`;
}
