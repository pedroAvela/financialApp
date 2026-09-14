import { test, expect } from "@playwright/test";
import { confirmEmail, confirmationFailure } from "../src/lib/auth-confirm";

function mockAuth(error: unknown = null, session = true) {
  const calls: unknown[] = [];
  const result = { data: { session: session ? { access_token: "test-only" } : null }, error };
  const auth = {
    verifyOtp: async (input: unknown) => { calls.push(input); return result; },
    exchangeCodeForSession: async (input: unknown) => { calls.push(input); return result; },
  } as unknown as Parameters<typeof confirmEmail>[1];
  return { auth, calls };
}

test("confirma signup, email e recuperação uma única vez", async () => {
  for (const type of ["signup", "email", "recovery"]) {
    const { auth, calls } = mockAuth();
    expect(await confirmEmail(new URLSearchParams({ token_hash: "test-hash", type }), auth)).toBe(type === "recovery" ? "/redefinir-senha" : "/configuracao-inicial");
    expect(calls).toEqual([{ token_hash: "test-hash", type }]);
  }
});

test("código PKCE válido respeita somente destinos internos", async () => {
  for (const [next, expected] of [["/historico", "/historico"], ["https://evil.example", "/configuracao-inicial"], ["/redefinir-senha", "/redefinir-senha"]]) {
    const { auth, calls } = mockAuth();
    expect(await confirmEmail(new URLSearchParams({ code: "test-code", next }), auth)).toBe(expected);
    expect(calls).toEqual(["test-code"]);
  }
});

test("falta de verificador PKCE não é apresentada como e-mail expirado", async () => {
  for (const code of ["pkce_code_verifier_not_found", "bad_code_verifier", "flow_state_not_found", "flow_state_expired"]) {
    const { auth } = mockAuth({ code });
    expect(await confirmEmail(new URLSearchParams({ code: "test-code" }), auth)).toBe("/login?notice=confirmacao_sem_sessao");
    expect(confirmationFailure({ code }, true)).toBe("/recuperar-senha?error=confirmacao_sem_sessao");
  }
});

test("link consumido e falha de rede têm destinos diferentes", async () => {
  for (const [error, expected] of [[{ code: "otp_expired" }, "link_invalido"], [new Error("test-secret"), "confirmacao_falhou"]] as const) {
    const { auth } = mockAuth(error);
    const destination = await confirmEmail(new URLSearchParams({ token_hash: "test-hash", type: "email" }), auth);
    expect(destination).toBe("/login?error=" + expected);
    expect(destination).not.toContain("test-secret");
    expect(destination).not.toContain("test-hash");
  }
});

test("confirmação sem sessão orienta login, sem liberar área interna", async () => {
  const { auth } = mockAuth(null, false);
  expect(await confirmEmail(new URLSearchParams({ token_hash: "test-hash", type: "email" }), auth)).toBe("/login?notice=email_confirmado");
  expect(await confirmEmail(new URLSearchParams({ token_hash: "test-hash", type: "recovery" }), auth)).toBe("/recuperar-senha?error=confirmacao_sem_sessao");
});

test("parâmetros ausentes ou tipo não permitido não consomem tokens", async () => {
  const cases: Record<string, string>[] = [{}, { token_hash: "test-hash", type: "sms" }, { type: "signup" }];
  for (const params of cases) {
    const { auth, calls } = mockAuth();
    expect(await confirmEmail(new URLSearchParams(params), auth)).toBe("/login?error=link_invalido");
    expect(calls).toEqual([]);
  }
});

test("erros enviados pelo provedor não viram sucesso nem são refletidos", async () => {
  const { auth, calls } = mockAuth();
  expect(await confirmEmail(new URLSearchParams({ error: "access_denied", error_code: "otp_expired", error_description: "test-secret", type: "recovery" }), auth)).toBe("/recuperar-senha?error=link_invalido");
  expect(calls).toEqual([]);
});
