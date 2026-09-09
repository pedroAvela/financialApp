import type { FinancialSettings, Transaction } from "@/types/finance";

export function currency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function moneyToCents(value: string): number {
  const trimmed = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(trimmed)) return NaN;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents <= 99999999999 ? cents : NaN;
}

export function inputMoney(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
}

export function summarize(transactions: Transaction[], settings: FinancialSettings, month: string) {
  const monthly = transactions.filter((item) => item.date.startsWith(`${month}-`));
  const income = monthly.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = monthly.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const balance = settings.openingBalance + income - expenses;
  const available = balance - settings.reserve;
  const utilization = settings.monthlyLimit > 0 ? expenses / settings.monthlyLimit * 100 : 0;
  return { monthly, income, expenses, balance, available, utilization };
}
