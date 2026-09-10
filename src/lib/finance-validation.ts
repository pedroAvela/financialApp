import { MAX_CENTS, moneyToCents, validDate, validMonth } from "./finance";
export class ValidationError extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Dados inválidos.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 200, required = false) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new ValidationError("Informe " + label + " válido.");
  return value.trim();
}
export function uuid(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ValidationError("Identificador inválido.");
  return value;
}
export function money(value: unknown, zero = false, nullable = false) {
  if (nullable && (value === "" || value === null)) return null;
  const cents = typeof value === "string" ? moneyToCents(value) : NaN;
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS || cents < (zero ? 0 : 1)) throw new ValidationError("Informe um valor " + (zero ? "não negativo" : "maior que zero") + ", como 1.234,56.");
  return cents;
}
export function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new ValidationError("Selecione uma opção válida.");
  return value as T;
}
export function month(value: unknown) {
  if (typeof value !== "string" || !validMonth(value)) throw new ValidationError("Selecione um mês válido.");
  return value + "-01";
}
export function day(value: unknown) {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 31) throw new ValidationError("Informe um dia de 1 a 31.");
  return n;
}
export function transactionInput(input: Record<string, unknown>) {
  const type = choice(input.type, ["income", "expense"]);
  const date = text(input.date, "uma data", 10, true);
  if (!validDate(date)) throw new ValidationError("Informe uma data válida.");
  return { type, amount: money(input.amount)!, description: text(input.description ?? "", "uma descrição"), category_id: uuid(input.category_id), date,
    status: choice(input.status, ["planned", "realized"]), expense_kind: type === "expense" ? choice(input.expense_kind, ["fixed", "variable"]) : null };
}