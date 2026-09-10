"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, safeNext } from "@/lib/auth";

export function AuthForm({ signup = false, next, invalidLink = false }: { signup?: boolean; next?: string; invalidLink?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState(invalidLink ? "Este link é inválido ou expirou. Tente entrar ou solicite um novo link de recuperação." : "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setError("");
    setMessage("");
    if (signup) {
      if (!name) return setError("Informe seu nome.");
      if (data.get("password") !== data.get("confirmPassword")) return setError("As senhas precisam ser iguais.");
    }
    setLoading(true);
    try {
      const supabase = createClient();
      if (signup) {
        const { data: result, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name }, emailRedirectTo: `${window.location.origin}/auth/confirm?next=/configuracao-inicial` },
        });
        if (error) throw error;
        if (result.session) {
          router.replace("/configuracao-inicial");
          router.refresh();
          return;
        }
        setMessage("Verifique seu e-mail para confirmar o cadastro. Se você já tem uma conta, entre ou recupere sua senha.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(safeNext(next));
        router.refresh();
        return;
      }
    } catch (error) {
      setError(authErrorMessage(error));
    }
    setLoading(false);
  }
  return <div className="auth-form-content"><p className="eyebrow">{signup ? "UM NOVO COMEÇO" : "BOM TER VOCÊ POR AQUI"}</p><h1>{signup ? "Mais clareza começa aqui." : "Bem-vindo de volta."}</h1><p className="muted">{signup ? "Crie sua conta e dê o primeiro passo." : "Entre para acompanhar seu dinheiro de perto."}</p><form onSubmit={submit} className="auth-form" aria-busy={loading} onChange={() => setError("")}>
    {signup && <label className="field">Seu nome<input name="name" placeholder="Como podemos chamar você?" autoComplete="name" required maxLength={60} /></label>}
    <label className="field">E-mail<input type="email" name="email" placeholder="voce@exemplo.com" autoComplete="email" required maxLength={120} /></label>
    <label className="field">Senha<input type="password" name="password" placeholder={signup ? "Pelo menos 6 caracteres" : "Digite sua senha"} autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 6 : undefined} required /></label>
    {signup && <label className="field">Confirme sua senha<input type="password" name="confirmPassword" placeholder="Repita a senha" autoComplete="new-password" minLength={6} required /></label>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p className="success-message" role="status">{message}</p>}
    <button className="button primary w-full" type="submit" disabled={loading}>{loading ? (signup ? "Criando conta..." : "Entrando...") : (signup ? "Criar conta" : "Entrar")}<Icon name="arrow" size={18} /></button>
  </form>{!signup && <Link className="text-link mt-4" href="/recuperar-senha">Esqueci minha senha</Link>}<p className="auth-switch">{signup ? "Já conhece o App Finanças?" : "Ainda não tem uma conta?"} <Link href={signup ? "/login" : "/cadastro"}>{signup ? "Entrar" : "Criar conta"}</Link></p><div className="auth-demo"><Icon name="shield" size={18} /><p>Sua conta tem acesso protegido. Seus dados financeiros ficam vinculados à sua conta.</p></div></div>;
}

