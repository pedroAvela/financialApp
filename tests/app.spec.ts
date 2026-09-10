import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "Exige migrações aplicadas e conta confirmada de um projeto de testes.");
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Tudo sob controle/ })).toBeVisible();
});
async function write(page: Page, action: string, data: object) {
  const result = await page.request.post("/api/finance", { headers: { Origin: "http://127.0.0.1:3100" }, data: { action, data } });
  expect(result.ok(), "Gravação pelo contexto autenticado").toBe(true);
}
test("sessão persiste e logout volta a proteger as rotas", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("heading", { name: /Tudo sob controle/ })).toBeVisible();
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Sair da conta" }).filter({ visible: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);
});
test("lançamento persiste, pode ser editado, exportado e excluído com confirmação", async ({ page }) => {
  const id = randomUUID(), label = "Teste " + id.slice(0, 8);
  await write(page, "category.save", { id, name: label, color: "#137968", type: "expense" });
  try {
    await page.goto("/lancamento");
    await page.getByLabel("Valor (R$)", { exact: true }).fill("123,45");
    await page.getByLabel("Descrição (opcional)", { exact: true }).fill(label);
    await page.getByLabel("Categoria", { exact: true }).selectOption(id);
    await page.getByLabel("Data", { exact: true }).fill("2098-07-10");
    await page.getByRole("button", { name: "Salvar despesa", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Lançamento registrado!" })).toBeVisible();
    await page.getByRole("link", { name: "Ver movimentações" }).click();
    await expect(page).toHaveURL(/\/historico$/);
    await page.getByLabel("Buscar movimentações").fill(label);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.reload();
    await page.getByLabel("Mês de referência", { exact: true }).fill("2098-07");
    await page.getByLabel("Buscar movimentações").fill(label);
    await expect(page.locator("tbody")).toContainText("123,45");
    await page.getByRole("button", { name: "Editar " + label, exact: true }).click();
    await page.getByLabel("Valor (R$)", { exact: true }).fill("150,00");
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expect(page.locator("tbody")).toContainText("150,00");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar CSV" }).click()]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString("utf8");
    expect(csv).toContain(label);
    expect(csv).toContain(';"150,00"');
    await page.getByRole("button", { name: "Excluir " + label, exact: true }).click();
    await page.getByRole("button", { name: "Cancelar exclusão" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByRole("button", { name: "Excluir " + label, exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(page.getByRole("heading", { name: "Nenhuma movimentação por aqui" })).toBeVisible();
  } finally {
    await write(page, "category.archive", { id, state: "archived" });
  }
});
test("categorias são criadas, editadas e arquivadas pela interface", async ({ page }) => {
  const name = "Categoria " + randomUUID().slice(0, 8);
  await page.goto("/configuracoes");
  await page.getByLabel("Nome da categoria").fill(name);
  await page.getByRole("button", { name: "Criar categoria", exact: true }).click();
  const row = page.locator(".management-list li").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Nome da categoria").fill(name + " editada");
  await page.getByRole("button", { name: "Salvar categoria", exact: true }).click();
  await expect(row).toContainText("editada");
  await row.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(row).toContainText("Arquivada");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});