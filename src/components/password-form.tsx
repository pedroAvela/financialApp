"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth";

export function PasswordForm({ reset = false, invalidLink = false }: { reset?: boolean; invalidLink?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(invalidLink ? "Este link é inválido ou expirou. Solicite um novo link abaixo." : "");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    setError("");
    setMessage("");
    if (reset && password !== data.get("confirmPassword")) return setError("As senhas precisam ser iguais.");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = reset
        ? await supabase.auth.updateUser({ password })
        : await supabase.auth.resetPasswordForEmail(String(data.get("email") ?? "").trim(), {
          redirectTo: `${window.location.origin}/auth/confirm?next=/redefinir-senha`,
        });
      if (error) throw error;
      form.reset();
      setMessage(reset ? "Senha atualizada com sucesso. Você já pode continuar para seu painel." : "Se houver uma conta com este e-mail, você receberá um link para redefinir sua senha. Verifique também a pasta de spam.");
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return <div className="auth-form-content">
    <p className="eyebrow">ACESSO À SUA CONTA</p>
    <h1>{reset ? "Crie uma nova senha." : "Esqueceu sua senha?"}</h1>
    <p className="muted">{reset ? "Escolha uma senha segura para proteger sua conta." : "Informe seu e-mail para receber o link de recuperação."}</p>
    <form className="auth-form" onSubmit={submit} aria-busy={loading} onChange={() => setError("")}>
      {reset ? <>
        <label className="field">Nova senha<input type="password" name="password" placeholder="Pelo menos 6 caracteres" autoComplete="new-password" minLength={6} required /></label>
        <label className="field">Confirme sua senha<input type="password" name="confirmPassword" placeholder="Repita a nova senha" autoComplete="new-password" minLength={6} required /></label>
      </> : <label className="field">E-mail<input type="email" name="email" placeholder="voce@exemplo.com" autoComplete="email" maxLength={120} required /></label>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}
      {!(reset && message) && <button className="button primary w-full" type="submit" disabled={loading}>{loading ? "Aguarde..." : reset ? "Salvar nova senha" : "Enviar link de recuperação"}<Icon name="arrow" size={18} /></button>}
    </form>
    <p className="auth-switch"><Link href={reset && message ? "/dashboard" : "/login"}>{reset && message ? "Ir para o painel" : "Voltar ao login"}</Link></p>
  </div>;
}
