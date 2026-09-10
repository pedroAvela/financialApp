import { expect, test } from "@playwright/test";

// Browser requests are intercepted so these tests never create accounts or send email.
test.beforeEach(async ({ page }) => {
  await page.route("**/auth/v1/**", (route) => route.abort());
});

test("API financeira exige sessão e rejeita gravações de outra origem", async ({ request }) => {
  const response = await request.get("/api/finance");
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toContain("sessão");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const post = await request.post("/api/finance", { headers: { Origin: "https://outro.example" }, data: { action: "transaction.create", data: {} } });
  expect(post.status()).toBe(403);
});

test("rotas internas redirecionam visitantes e preservam o destino", async ({ page }) => {
  for (const path of ["/dashboard", "/historico?mes=2026-09", "/lancamento", "/planejamento", "/configuracoes", "/configuracao-inicial"]) {
    await page.goto(path);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe(path);
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta." })).toBeVisible();
  }
});

test("login exibe carregamento e erro de credenciais em português", async ({ page }) => {
  let release!: () => void;
  const responseReady = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/auth/v1/token?**", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ email: "teste@example.com", password: "senha123" });
    await responseReady;
    await route.fulfill({ status: 400, json: { error_code: "invalid_credentials", msg: "Invalid login credentials" } });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  try {
    await expect(page.getByRole("button", { name: "Entrando..." })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator("form").getByRole("alert")).toContainText("E-mail ou senha incorretos.");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
});

test("cadastro valida confirmação e envia o nome como metadado", async ({ page }) => {
  let requests = 0;
  await page.route("**/auth/v1/signup?**", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ email: "marina@example.com", data: { name: "Marina" }, password: "senha123" });
    expect(new URL(route.request().url()).searchParams.get("redirect_to")).toContain("/auth/confirm?next=/configuracao-inicial");
    await route.fulfill({ json: { id: "test-user", email: "marina@example.com", identities: [] } });
  });
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill("Marina");
  await page.getByLabel("E-mail", { exact: true }).fill("marina@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha123");
  await page.getByLabel("Confirme sua senha").fill("diferente123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("As senhas precisam ser iguais");
  expect(requests).toBe(0);
  await page.getByLabel("Confirme sua senha").fill("senha123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Verifique seu e-mail");
  expect(requests).toBe(1);
  await expect(page).toHaveURL(/\/cadastro$/);
});

test("recuperação solicita link sem revelar a existência da conta", async ({ page }) => {
  await page.route("**/auth/v1/recover?**", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("redirect_to")).toContain("/auth/confirm?next=/redefinir-senha");
    await route.fulfill({ json: {} });
  });
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/recuperar-senha$/);
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.com");
  await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
  await expect(page.getByRole("status")).toContainText("Se houver uma conta com este e-mail");
});

test("redefinição e callback sem credenciais válidas não liberam acesso", async ({ page }) => {
  await page.goto("/redefinir-senha");
  await expect(page).toHaveURL(/\/recuperar-senha\?error=link_invalido$/);
  await expect(page.locator("form").getByRole("alert")).toContainText("inválido ou expirou");
  await page.goto("/auth/confirm?next=https://evil.example");
  await expect(page).toHaveURL(/\/login\?error=link_invalido$/);
  await expect(page.locator("form").getByRole("alert")).toContainText("inválido ou expirou");
  await page.goto("/auth/confirm?type=recovery");
  await expect(page).toHaveURL(/\/recuperar-senha\?error=link_invalido$/);
});

test("telas públicas mantêm o layout responsivo", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/login", "/cadastro", "/recuperar-senha"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("tema acompanha o sistema e a escolha manual persiste", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveCSS("background-color", "rgb(20, 34, 27)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("login-dark.png"), fullPage: true });
  await page.getByRole("button", { name: "Ativar modo claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/cadastro");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Ativar modo claro" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("cadastro-dark.png"), fullPage: true });
  expect(errors).toEqual([]);
});
