"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth";
import { confirmationFailure } from "@/lib/auth-confirm";

export function EmailConfirmation({ next, recovery }: { next: string; recovery: boolean }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    // Remove credentials before creating the client, preventing automatic URL
    // detection from consuming the same session twice, or leaving it in history.
    window.history.replaceState(null, "", window.location.pathname);
    const isRecovery = recovery || fragment.get("type") === "recovery";
    async function finish() {
      let destination = `${isRecovery ? "/recuperar-senha" : "/login"}?error=link_invalido`;
      try {
        if (fragment.has("error") || fragment.has("error_code")) {
          destination = confirmationFailure({ code: fragment.get("error_code") }, isRecovery);
        } else {
          const access_token = fragment.get("access_token");
          const refresh_token = fragment.get("refresh_token");
          if (access_token && refresh_token) {
            const supabase = createClient();
            const session = await supabase.auth.setSession({ access_token, refresh_token });
            if (session.error) throw session.error;
            const verified = await supabase.auth.getUser();
            if (verified.error) throw verified.error;
            if (verified.data.user) destination = isRecovery ? "/redefinir-senha" : safeNext(next, "/configuracao-inicial");
          }
        }
      } catch (error) { destination = confirmationFailure(error, isRecovery); }
      window.location.replace(destination);
    }
    void finish();
  }, [next, recovery]);
  return <div className="auth-form-content"><p className="eyebrow">ACESSO À SUA CONTA</p><h1>Concluindo a confirmação.</h1><p className="muted" role="status">Validando seu acesso. Aguarde um instante...</p></div>;
}
