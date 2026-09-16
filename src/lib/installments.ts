import { MAX_CENTS, monthBounds, recurrenceDate, validDate, validMonth } from "./finance";
import type { Transaction } from "@/types/finance";

export function offsetMonth(month: string, offset: number) {
  if (!validMonth(month) || !Number.isInteger(offset)) throw new Error("Mês inválido.");
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function installmentSchedule(total: number, count: number, firstDue: string) {
  if (!Number.isSafeInteger(total) || total > MAX_CENTS || !Number.isInteger(count) || count < 2 || count > 60 || total < count) {
    throw new Error("Informe de 2 a 60 parcelas, com pelo menos R$ 0,01 em cada parcela.");
  }
  if (!validDate(firstDue)) throw new Error("Informe um primeiro vencimento válido.");
  const lastMonth = offsetMonth(firstDue.slice(0, 7), count - 1);
  if (!validMonth(lastMonth)) throw new Error("A última parcela deve vencer até dezembro de 2100.");
  const cents = BigInt(total), quantity = BigInt(count);
  const base = cents / quantity, remainder = cents % quantity;
  const originalDay = Number(firstDue.slice(8));
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    due_date: recurrenceDate(offsetMonth(firstDue.slice(0, 7), index), originalDay),
    amount: Number(base + (index === count - 1 ? remainder : BigInt(0))),
  }));
}

/** Separate projection; never add this result to realized expenses. */
export function upcomingInstallments(transactions: Transaction[], referenceMonth: string) {
  monthBounds(referenceMonth);
  return [1, 2, 3].map((offset) => offsetMonth(referenceMonth, offset)).filter(validMonth).map((month) => {
    const rows = transactions.filter((t) => t.installment_plan_id && !t.deleted_at && t.status === "planned" && t.due_date?.slice(0, 7) === month);
    return { month, count: rows.length, amount: rows.reduce((sum, t) => sum + t.amount, 0) };
  });
}
