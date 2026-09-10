export const internalRoutes = [
  "/dashboard", "/historico", "/lancamento", "/planejamento",
  "/configuracoes", "/configuracao-inicial",
];

export function isProtectedPath(pathname: string) {
  return [...internalRoutes, "/redefinir-senha"].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function safeNext(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  const url = new URL(value, "https://app.invalid");
  if (url.origin !== "https://app.invalid" || ![...internalRoutes, "/redefinir-senha"].includes(url.pathname)) return fallback;
  return `${url.pathname}${url.search}`;
}

export function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    invalid_credentials: "E-mail ou senha incorretos.",
    email_not_confirmed: "Confirme seu e-mail antes de entrar. Verifique também a pasta de spam.",
    user_already_exists: "Não foi possível criar a conta. Tente entrar ou recuperar sua senha.",
    email_exists: "Não foi possível criar a conta. Tente entrar ou recuperar sua senha.",
    weak_password: "A senha não atende aos requisitos de segurança. Use uma senha mais forte.",
    same_password: "Escolha uma senha diferente da senha atual.",
    over_email_send_rate_limit: "Muitos e-mails solicitados. Aguarde alguns minutos e tente novamente.",
    over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    email_address_invalid: "Informe um e-mail válido.",
    signup_disabled: "O cadastro está temporariamente indisponível.",
    otp_expired: "Este link expirou ou já foi usado. Solicite um novo link.",
    session_not_found: "Sua sessão expirou. Entre novamente ou solicite um novo link.",
    reauthentication_needed: "Entre novamente antes de alterar a senha.",
  };
  return messages[code] ?? "Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.";
}
