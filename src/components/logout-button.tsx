"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth";

export function LogoutButton({ className = "text-link mt-4" }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setLoading(true);
    setError("");
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      // A full navigation also discards financial state and the router cache.
      window.location.replace("/login");
    } catch (error) {
      setError(authErrorMessage(error));
      setLoading(false);
    }
  }
  return <><button type="button" className={className} onClick={logout} disabled={loading} aria-busy={loading}><Icon name="logout" size={17} />{loading ? "Saindo..." : "Sair da conta"}</button>{error && <p className="error-message" role="alert">{error}</p>}</>;
}
