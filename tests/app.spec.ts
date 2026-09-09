import { expect, test } from "@playwright/test";

test("dashboard responsivo, dados e navegação", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("heading", { name: "Olá, Pedro. Tudo sob controle?" })).toBeVisible();
  await expect(page.locator(".metric-value").nth(0)).toContainText("8.500,00");
  await expect(page.locator(".metric-value").nth(3)).toContainText("3.747,10");
  await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "54");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const floating = page.getByRole("link", { name: "Lançar despesa rápida" });
  if (testInfo.project.name === "celular") {
    await expect(floating).toBeVisible();
    await floating.click();
    await expect(page.getByRole("button", { name: "Despesa", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/dashboard");
  } else {
    await expect(floating).toBeHidden();
  }
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
  await page.getByRole("link", { name: "Ver todas", exact: true }).click();
  await expect(page).toHaveURL(/historico/);
  expect(errors).toEqual([]);
});

test("registra despesa e receita, filtra histórico e mantém valores entre telas", async ({ page }) => {
  await page.goto("/lancamento");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("125,90");
  await page.getByLabel("Descrição", { exact: true }).fill("Mercado de teste");
  await page.getByRole("combobox", { name: "Categoria", exact: true }).selectOption("food");
  await page.getByLabel("Data", { exact: true }).fill("2026-09-10");
  await page.getByRole("button", { name: "Salvar despesa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lançamento registrado!" })).toBeVisible();
  await page.getByRole("link", { name: "Ver movimentações" }).click();
  await page.getByRole("textbox", { name: "Buscar movimentações" }).fill("Mercado de teste");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("125,90");
  await page.getByRole("combobox", { name: "Filtrar por tipo" }).selectOption("income");
  await expect(page.getByRole("heading", { name: "Nenhuma movimentação por aqui" })).toBeVisible();
  await page.getByRole("link", { name: "Novo lançamento", exact: true }).click();
  await page.getByRole("button", { name: "Receita", exact: true }).click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("200,00");
  await page.getByLabel("Descrição", { exact: true }).fill("Extra de teste");
  await page.getByRole("combobox", { name: "Categoria", exact: true }).selectOption("freelance");
  await page.getByRole("button", { name: "Salvar receita", exact: true }).click();
  await page.getByRole("link", { name: "Ver movimentações" }).click();
  await expect(page.locator("tbody")).toContainText("Extra de teste");
  await expect(page.locator(".history-summary")).toContainText("8.700,00");
  await page.getByLabel("Mês de referência", { exact: true }).fill("2026-10");
  await expect(page.getByRole("heading", { name: "Nenhuma movimentação por aqui" })).toBeVisible();
  await page.reload();
  await expect(page.locator("tbody")).not.toContainText("Extra de teste");
});

test("login simulado e cadastro com confirmação de senha", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("teste@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("exemplo123");
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill("Marina");
  await page.getByLabel("E-mail", { exact: true }).fill("marina@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("exemplo123");
  await page.getByLabel("Confirme sua senha").fill("diferente123");
  await page.getByRole("button", { name: "Criar perfil de demonstração" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("As senhas precisam ser iguais");
  await page.getByLabel("Confirme sua senha").fill("exemplo123");
  await page.getByRole("button", { name: "Criar perfil de demonstração" }).click();
  await expect(page).toHaveURL(/configuracao-inicial/);
  await page.getByLabel("Saldo inicial do mês (R$)", { exact: true }).fill("100,00");
  await page.getByRole("button", { name: "Começar meu controle" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Marina. Tudo sob controle?" })).toBeVisible();
  await expect(page.locator(".metric-value").nth(2)).toContainText("5.347,10");
});

test("salva planejamento, trata limite excedido e valida valores", async ({ page }) => {
  await page.goto("/planejamento");
  await page.getByLabel("Limite mensal de despesas (R$)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("maior que zero");
  await page.getByLabel("Limite mensal de despesas (R$)", { exact: true }).fill("3.000,00");
  await page.getByLabel("Limite de alimentação (R$)", { exact: true }).fill("400,00");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();
  await expect(page.getByRole("status")).toContainText("Planejamento salvo");
  await expect(page.getByRole("progressbar", { name: "Limite de Alimentação" })).toHaveAttribute("aria-valuenow", "100");
  await page.locator(".sidebar nav, .mobile-nav").getByRole("link", { name: /Visão geral|Início/ }).filter({ visible: true }).click();
  await expect(page.locator(".limit-copy")).toContainText("Limite excedido");
});

test("edita perfil e verifica todas as telas sem transbordamento", async ({ page }, testInfo) => {
  await page.goto("/configuracoes");
  await page.getByLabel("Nome", { exact: true }).fill("Ana");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("atualizado");
  await page.locator(".sidebar nav, .mobile-nav").getByRole("link", { name: /Visão geral|Início/ }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Olá, Ana. Tudo sob controle?" })).toBeVisible();
  for (const route of ["/login", "/cadastro", "/configuracao-inicial", "/historico", "/lancamento", "/planejamento", "/configuracoes"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true);
    if (route === "/login" || route === "/planejamento") await page.screenshot({ path: testInfo.outputPath(route.slice(1) + ".png"), fullPage: true });
  }
});
