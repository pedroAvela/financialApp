import { expect, test } from "@playwright/test";
import { budgetUsage, csvCell, filterTransactions, moneyToCents, monthBounds, recurrenceDate, summarize, todayInTimezone, transactionsCsv, validDate, validMonth } from "../src/lib/finance";
import { transactionInput } from "../src/lib/finance-validation";
import type { Transaction } from "../src/types/finance";
function entry(overrides: Partial<Transaction> = {}): Transaction {
  return { id: "11111111-1111-4111-8111-111111111111", amount: 10000, type: "expense", category_id: "22222222-2222-4222-8222-222222222222", date: "2026-09-10", status: "realized", expense_kind: "variable", description: "", recurrence_id: null, occurrence_month: null, ...overrides };
}
test("converte centavos com precisão e rejeita entradas inválidas", () => {
  for (const [value, expected] of [["1,00", 100], ["1.234,56", 123456], ["0,01", 1], ["999.999.999,99", 99999999999], ["1,2", 120], [" 10 ", 1000]] as const) expect(moneyToCents(value)).toBe(expected);
  for (const value of ["", "1.23", "1,234", "-1,00", "1e3", "Infinity", "1,000.00", "1.000.000.000,00", "=1+1"]) expect(moneyToCents(value)).toBeNaN();
});
test("mês calendário, ano bissexto e limites de datas", () => {
  expect(monthBounds("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  expect(monthBounds("2025-02").end).toBe("2025-02-28");
  expect(monthBounds("2026-12").end).toBe("2026-12-31");
  expect(validDate("2026-02-30")).toBe(false);
  expect(validDate("2024-02-29")).toBe(true);
  expect(validDate("2026-09-00")).toBe(false);
  expect(validMonth("2026-13")).toBe(false);
  expect(validMonth("1999-12")).toBe(false);
  expect(() => monthBounds("invalid")).toThrow();
});
test("fuso do perfil define data e virada de mês", () => {
  const instant = new Date("2026-10-01T01:00:00Z");
  expect(todayInTimezone("America/Sao_Paulo", instant)).toBe("2026-09-30");
  expect(todayInTimezone("UTC", instant)).toBe("2026-10-01");
  expect(() => todayInTimezone("invalid")).toThrow();
});
test("totais realizados separam previstos e não descontam fixas do orçamento variável", () => {
  const entries = [entry({ type: "income", expense_kind: null, amount: 500000 }), entry({ expense_kind: "fixed", amount: 200000 }),
    entry({ amount: 50000 }), entry({ status: "planned", amount: 10000 }), entry({ status: "planned", type: "income", expense_kind: null, amount: 30000 }),
    entry({ date: "2026-10-01", amount: 99999 })];
  const result = summarize(entries, [{ id: "b", month: "2026-09-01", category_id: null, amount: 100000 }], "2026-09");
  expect(result).toMatchObject({ income: 500000, expenses: 250000, balance: 250000, variableExpenses: 50000, available: 50000, plannedIncome: 30000, plannedExpenses: 10000, percent: 50 });
});
test("orçamento ausente, zero e avisos em 70, 85 e 100 por cento", () => {
  expect(budgetUsage(200, null)).toEqual({ percent: null, available: null, alert: null });
  expect(budgetUsage(0, 0)).toEqual({ percent: 0, available: 0, alert: null });
  expect(budgetUsage(1, 0)).toEqual({ percent: 100, available: -1, alert: 100 });
  for (const [spent, alert] of [[69, null], [70, 70], [84, 70], [85, 85], [99, 85], [100, 100], [120, 100]]) expect(budgetUsage(spent!, 100).alert).toBe(alert);
  expect(summarize([entry()], [], "2026-09").balance).toBe(-10000);
});
test("vencimentos mensais usam o último dia válido", () => {
  expect(recurrenceDate("2024-02", 31)).toBe("2024-02-29");
  expect(recurrenceDate("2025-02", 30)).toBe("2025-02-28");
  expect(recurrenceDate("2026-04", 31)).toBe("2026-04-30");
  expect(recurrenceDate("2026-12", 1)).toBe("2026-12-01");
  expect(() => recurrenceDate("2026-12", 0)).toThrow();
});
test("validação do servidor ignora proprietário enviado e exige valor, categoria e situação", () => {
  const input = { ...entry(), amount: "1.234,56", user_id: "outro-usuario" };
  expect(transactionInput(input)).toMatchObject({ amount: 123456, description: "", status: "realized" });
  expect(transactionInput(input)).not.toHaveProperty("user_id");
  for (const patch of [{ amount: "0" }, { amount: 100 }, { category_id: "alheio" }, { status: "unknown" }, { expense_kind: null }, { date: "2026-02-30" }]) expect(() => transactionInput({ ...input, ...patch })).toThrow();
});
test("CSV usa os mesmos filtros, BOM, ponto e vírgula e neutraliza fórmulas", () => {
  const entries = [entry({ description: '=HYPERLINK("malicioso")' }), entry({ status: "planned", description: "Outra" })];
  const filtered = filterTransactions(entries, { search: "", type: "expense", category: "all", status: "realized", from: "2026-09-01", to: "2026-09-30" });
  expect(filtered).toHaveLength(1);
  const csv = transactionsCsv(filtered, []);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain(';"100,00"\r\n');
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).not.toContain("Outra");
  for (const text of ["=1+1", "+cmd", "-cmd", "@SUM", " \t=cmd", "\ttexto", "\n=cmd"]) expect(csvCell(text).startsWith('"\'')).toBe(true);
  expect(csvCell('aspas " e ; quebra\nlinha')).toBe('"aspas "" e ; quebra\nlinha"');
});