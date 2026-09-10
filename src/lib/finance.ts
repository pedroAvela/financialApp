import type { Budget, Category, Transaction } from "@/types/finance";

export const MAX_CENTS = 99999999999;
export function currency(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
export function moneyToCents(value: string): number {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ""] = text.replace(/\./g, "").split(",");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : NaN;
}
export function inputMoney(cents: number) { return (cents / 100).toFixed(2).replace(".", ","); }
export function validMonth(value: string) { return /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value); }
export function monthBounds(month: string) {
  if (!validMonth(month)) throw new Error("Selecione um mês válido entre 2000 e 2100.");
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: month + "-01", end: month + "-" + last };
}
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validMonth(date.slice(0, 7))) return false;
  return date >= monthBounds(date.slice(0, 7)).start && date <= monthBounds(date.slice(0, 7)).end;
}
export function todayInTimezone(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return get("year") + "-" + get("month") + "-" + get("day");
}
export function recurrenceDate(month: string, day: number) {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("Dia inválido.");
  return month + "-" + String(Math.min(day, Number(monthBounds(month).end.slice(-2)))).padStart(2, "0");
}
export function dateLabel(date: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z")); }
export function monthLabel(month: string) { return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T12:00:00Z")); }
export function budgetUsage(spent: number, limit: number | null) {
  const percent = limit === null ? null : limit === 0 ? (spent > 0 ? 100 : 0) : spent / limit * 100;
  const alert = percent === null || percent < 70 ? null : percent >= 100 ? 100 : percent >= 85 ? 85 : 70;
  return { percent, alert, available: limit === null ? null : limit - spent };
}
export function summarize(transactions: Transaction[], budgets: Budget[], month: string) {
  const monthly = transactions.filter((item) => item.date.slice(0, 7) === month);
  const sum = (type: string, status: string) => monthly.filter((t) => t.type === type && t.status === status).reduce((total, t) => total + t.amount, 0);
  const income = sum("income", "realized"), expenses = sum("expense", "realized");
  const variableExpenses = monthly.filter((t) => t.type === "expense" && t.status === "realized" && t.expense_kind === "variable").reduce((s, t) => s + t.amount, 0);
  const limit = budgets.find((b) => b.category_id === null && b.month.slice(0, 7) === month)?.amount ?? null;
  return { monthly, income, expenses, balance: income - expenses, variableExpenses, plannedIncome: sum("income", "planned"), plannedExpenses: sum("expense", "planned"), limit, ...budgetUsage(variableExpenses, limit) };
}
export interface TransactionFilters { search: string; type: string; category: string; status: string; from: string; to: string }
export function filterTransactions(transactions: Transaction[], filters: TransactionFilters) {
  return transactions.filter((t) => t.description.toLocaleLowerCase("pt-BR").includes(filters.search.toLocaleLowerCase("pt-BR")) &&
    (filters.type === "all" || t.type === filters.type) && (filters.category === "all" || t.category_id === filters.category) &&
    (filters.status === "all" || t.status === filters.status) && (!filters.from || t.date >= filters.from) && (!filters.to || t.date <= filters.to));
}
export function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function transactionsCsv(transactions: Transaction[], categories: Category[]) {
  const rows = [["Data", "Tipo", "Situação", "Classificação", "Categoria", "Descrição", "Valor (R$)"], ...transactions.map((t) => [
    t.date.split("-").reverse().join("/"), t.type === "income" ? "Receita" : "Despesa", t.status === "realized" ? "Realizada" : "Prevista",
    t.expense_kind === "fixed" ? "Fixa" : t.expense_kind === "variable" ? "Variável" : "", categories.find((c) => c.id === t.category_id)?.name ?? "", t.description, inputMoney(t.amount),
  ])];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}