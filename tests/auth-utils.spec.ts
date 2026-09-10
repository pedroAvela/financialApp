import { expect, test } from "@playwright/test";
import { authErrorMessage, internalRoutes, isProtectedPath, safeNext } from "../src/lib/auth";

test("redirecionamentos aceitam somente destinos internos conhecidos", () => {
  for (const value of [undefined, null, ["/historico"], "https://evil.example", "//evil.example", "/\\evil.example", "/login", "/auth/confirm", "/%2f%2fevil.example", "/dashboard\r\nLocation: https://evil.example"]) {
    expect(safeNext(value)).toBe("/dashboard");
  }
  expect(safeNext("/historico?mes=2026-09")).toBe("/historico?mes=2026-09");
  expect(safeNext(null, "/configuracao-inicial")).toBe("/configuracao-inicial");
});

test("todas as rotas internas e a redefinição exigem autenticação", () => {
  for (const route of [...internalRoutes, "/redefinir-senha"]) {
    expect(isProtectedPath(route)).toBe(true);
    expect(isProtectedPath(`${route}/subpagina`)).toBe(true);
  }
  for (const route of ["/login", "/cadastro", "/recuperar-senha", "/auth/confirm"]) expect(isProtectedPath(route)).toBe(false);
});

test("mensagens não repassam detalhes brutos do provedor", () => {
  expect(authErrorMessage({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
  expect(authErrorMessage({ code: "email_not_confirmed" })).toContain("Confirme seu e-mail");
  expect(authErrorMessage(new Error("secret-token-123"))).not.toContain("secret-token-123");
});
