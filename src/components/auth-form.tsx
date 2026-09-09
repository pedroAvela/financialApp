"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useFinance } from "@/components/finance-provider";
import { Icon } from "@/components/icon";

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const { updateSettings } = useFinance();
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (signup) {
      const name = String(data.get("name")).trim();
      if (!name) return setError("Informe seu nome.");
      if (data.get("password") !== data.get("confirmPassword")) return setError("As senhas precisam ser iguais.");
      updateSettings({ name, email: String(data.get("email")).trim() });
    }
    router.push(signup ? "/configuracao-inicial" : "/dashboard");
  }
  return <div className="auth-form-content"><p className="eyebrow">{signup ? "UM NOVO COMEÇO" : "BOM TER VOCÊ POR AQUI"}</p><h1>{signup ? "Mais clareza começa aqui." : "Bem-vindo de volta."}</h1><p className="muted">{signup ? "Crie seu perfil de demonstração e dê o primeiro passo." : "Entre para acompanhar seu dinheiro de perto."}</p><form onSubmit={submit} className="auth-form" onChange={() => setError("")}>
    {signup && <label className="field">Seu nome<input name="name" placeholder="Como podemos chamar você?" autoComplete="name" required maxLength={60} /></label>}
    <label className="field">E-mail<input type="email" name="email" placeholder="voce@exemplo.com" autoComplete="email" required maxLength={120} /></label>
    <label className="field">Senha<input type="password" name="password" placeholder={signup ? "Pelo menos 6 caracteres" : "Digite uma senha de exemplo"} autoComplete={signup ? "new-password" : "current-password"} minLength={6} required /></label>
    {signup && <label className="field">Confirme sua senha<input type="password" name="confirmPassword" placeholder="Repita a senha" autoComplete="new-password" minLength={6} required /></label>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <button className="button primary w-full" type="submit">{signup ? "Criar perfil de demonstração" : "Entrar na demonstração"}<Icon name="arrow" size={18} /></button>
  </form><p className="auth-switch">{signup ? "Já conhece o App Finanças?" : "Ainda não tem um perfil?"} <Link href={signup ? "/login" : "/cadastro"}>{signup ? "Entrar" : "Criar perfil"}</Link></p><div className="auth-demo"><Icon name="shield" size={18} /><p>Modo demonstração. Use dados fictícios. Nenhuma conta é criada e as senhas não são armazenadas.</p></div><Link className="text-link demo-access" href="/dashboard">Explorar sem preencher <Icon name="arrow" size={16} /></Link></div>;
}

