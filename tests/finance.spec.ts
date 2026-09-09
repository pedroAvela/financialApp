import { expect, test } from "@playwright/test";
import { moneyToCents, summarize } from "../src/lib/finance";
import { initialSettings, initialTransactions } from "../src/data/mock-data";

test("converte reais para centavos sem perda e rejeita valores ambíguos", () => {
  expect(moneyToCents("1.234,56")).toBe(123456);
  expect(moneyToCents("0,10")).toBe(10);
  expect(moneyToCents("120")).toBe(12000);
  for (const value of ["", "-10", "12.50", "1,001", "abc", "1e6", "9999999999999999999"]) {
    expect(Number.isNaN(moneyToCents(value))).toBe(true);
  }
});

test("calcula o resumo a partir das movimentações, sem somar receita prevista", () => {
  const summary = summarize(initialTransactions, initialSettings, "2026-09");
  expect(summary.income).toBe(850000);
  expect(summary.expenses).toBe(325290);
  expect(summary.balance).toBe(524710);
  expect(summary.available).toBe(374710);
  expect(summary.utilization).toBeCloseTo(54.215);
});

test("filtra o mês e inclui saldo inicial e reserva independentemente das receitas", () => {
  const summary = summarize(initialTransactions, { ...initialSettings, openingBalance: 20000, reserve: 5000 }, "2026-10");
  expect(summary.monthly).toEqual([]);
  expect(summary.income).toBe(0);
  expect(summary.expenses).toBe(0);
  expect(summary.balance).toBe(20000);
  expect(summary.available).toBe(15000);
});

test("preserva saldo negativo e utilização acima de cem por cento", () => {
  const summary = summarize(initialTransactions.filter((item) => item.type === "expense"), { ...initialSettings, monthlyLimit: 100000 }, "2026-09");
  expect(summary.balance).toBe(-325290);
  expect(summary.available).toBe(-475290);
  expect(summary.utilization).toBeGreaterThan(100);
});

test("trata limite zero sem divisão por zero", () => {
  expect(summarize(initialTransactions, { ...initialSettings, monthlyLimit: 0 }, "2026-09").utilization).toBe(0);
});
