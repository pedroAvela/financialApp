import "server-only";
import { createClient } from "@/lib/supabase/server";
import { monthBounds, todayInTimezone, validDate } from "@/lib/finance";
import * as v from "@/lib/finance-validation";
import type { FinanceSnapshot, Profile } from "@/types/finance";
import type { SupabaseClient } from "@supabase/supabase-js";

export class FinanceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function dbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "P1101") throw new FinanceError("Esta solicitação já foi usada com outros dados ou a compra foi excluída. Confira seus parcelamentos antes de iniciar outra compra.", 409);
  if (error.code === "P1102") throw new FinanceError("Há parcelas pagas ou canceladas protegidas. Atualize a tela; edite somente as informações futuras ou cancele as parcelas ainda não pagas.", 409);
  if (error.code === "P1104") throw new FinanceError("Parcelamento ou parcela não encontrado para sua conta. Atualize a tela.", 404);
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "")) throw new FinanceError("O banco financeiro ainda não está configurado. Aplique as migrações indicadas no guia do projeto.", 503);
  if (error.code === "23505") throw new FinanceError("Já existe um registro com esses dados. Verifique os registros antes de tentar novamente.", 409);
  if (["23503", "23514", "22P02", "22003"].includes(error.code ?? "")) throw new FinanceError("Verifique os valores, as datas e se a categoria está ativa e corresponde ao tipo escolhido.");
  if (["42501", "PGRST301"].includes(error.code ?? "")) throw new FinanceError("Você não tem permissão para essa operação. Entre novamente.", 403);
  throw new FinanceError("Não foi possível acessar os dados financeiros. Tente novamente.", 503);
}
export async function authenticatedClient() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new FinanceError("Sua sessão expirou. Entre novamente.", 401);
  return { client, user };
}
async function allRows(client: SupabaseClient, table: string, userId: string, configure?: (query: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = client.from(table).select("*").eq("user_id", userId).order(table === "installment_requests" ? "client_request_id" : "id");
    if (configure) query = configure(query);
    const { data, error } = await query.range(offset, offset + 499);
    dbError(error);
    if (!data) throw new FinanceError("A consulta não retornou dados válidos.", 503);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
/** Todos os períodos e registros próprios, incluindo arquivados e ocorrências ocultas. */
export async function exportOwnFinance(client: SupabaseClient, userId: string) {
  const profile = await client.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  dbError(profile.error);
  const [categories, transactions, recurrences, budgets, installmentPlans, installmentRequests] = await Promise.all([
    allRows(client, "categories", userId), allRows(client, "transactions", userId),
    allRows(client, "recurrences", userId), allRows(client, "budgets", userId),
    allRows(client, "installment_plans", userId),
    allRows(client, "installment_requests", userId),
  ]);
  return { profile: profile.data, categories, transactions, recurrences, budgets, installmentPlans, installmentRequests };
}
export async function snapshot(client: SupabaseClient, userId: string, requestedMonth: string | null): Promise<FinanceSnapshot> {
  dbError((await client.rpc("initialize_finance")).error);
  const profileResult = await client.from("profiles").select("*").eq("user_id", userId).single();
  dbError(profileResult.error);
  const profile = profileResult.data as Profile;
  const today = todayInTimezone(profile.timezone);
  const selectedMonth = requestedMonth || today.slice(0, 7);
  v.month(selectedMonth);
  const { start, end } = monthBounds(selectedMonth);
  dbError((await client.rpc("generate_occurrences", { p_month: start })).error);
  const [categories, transactions, recurrences, budgets, installmentPlans, installmentTransactions] = await Promise.all([
    allRows(client, "categories", userId),
    allRows(client, "transactions", userId, (q) => q.gte("date", start).lte("date", end).is("deleted_at", null)),
    allRows(client, "recurrences", userId),
    allRows(client, "budgets", userId, (q) => q.eq("month", start)),
    allRows(client, "installment_plans", userId),
    allRows(client, "transactions", userId, (q) => q.not("installment_plan_id", "is", null)),
  ]);
  return { profile, categories, transactions, recurrences, budgets, installmentPlans, installmentTransactions, month: selectedMonth, today } as FinanceSnapshot;
}
async function updateOwned(client: SupabaseClient, table: string, userId: string, id: string, values: object) {
  let query = client.from(table).update(values).eq("user_id", userId).eq("id", id);
  if (table === "transactions") query = query.is("deleted_at", null).is("installment_plan_id", null);
  const { data, error } = await query.select("id").maybeSingle();
  dbError(error);
  if (!data) throw new FinanceError("Registro não encontrado ou não disponível para sua conta.", 404);
}
export async function mutate(client: SupabaseClient, userId: string, body: unknown) {
  const request = v.object(body);
  const p = v.object(request.data);
  switch (request.action) {
    case "installment.create":
      dbError((await client.rpc("create_installment_plan", { ...v.installmentInput(p), p_request: v.uuid(p.client_request_id) })).error);
      break;
    case "installment.edit":
      if (p.confirmed !== true) throw new v.ValidationError("Confirme a alteração do parcelamento.");
      dbError((await client.rpc("edit_installment_plan", { ...v.installmentInput(p), p_plan: v.uuid(p.id), p_confirmed: true })).error);
      break;
    case "installment.pay": {
      const date = v.text(p.payment_date, "a data do pagamento", 10, true);
      if (!validDate(date)) throw new v.ValidationError("Informe uma data de pagamento válida.");
      dbError((await client.rpc("pay_installment", { p_transaction: v.uuid(p.id), p_date: date, p_amount: v.money(p.amount) })).error);
      break;
    }
    case "installment.cancel":
    case "installment.delete":
      if (p.confirmed !== true) throw new v.ValidationError("Confirme a operação sobre as parcelas.");
      dbError((await client.rpc(request.action === "installment.cancel" ? "cancel_installment_plan" : "delete_installment_plan", { p_plan: v.uuid(p.id), p_confirmed: true })).error);
      break;
    case "transaction.create": {
      const row = { ...v.transactionInput(p), id: v.uuid(p.id), user_id: userId };
      // A client-generated UUID is the idempotency key. Never update an existing
      // transaction during a retried create request.
      const result = await client.from("transactions").upsert(row, { onConflict: "id", ignoreDuplicates: true }).select("id");
      dbError(result.error);
      if (!result.data?.length) {
        const existing = await client.from("transactions").select("*").eq("user_id", userId).eq("id", row.id).is("deleted_at", null).maybeSingle();
        dbError(existing.error);
        if (!existing.data || Object.entries(row).some(([key, value]) => existing.data[key] !== value)) throw new FinanceError("Esse identificador já foi usado em outro lançamento. Reabra o formulário para cadastrar um novo.", 409);
      }
      break;
    }
    case "transaction.update":
      await updateOwned(client, "transactions", userId, v.uuid(p.id), { ...v.transactionInput(p), auto_realize: false });
      break;
    case "transaction.confirm":
      await updateOwned(client, "transactions", userId, v.uuid(p.id), { status: "realized", auto_realize: false });
      break;
    case "transaction.delete": {
      if (p.confirmed !== true) throw new v.ValidationError("Confirme a exclusão.");
      // Tombstones keep recurring occurrence IDs stable even after deletion.
      await updateOwned(client, "transactions", userId, v.uuid(p.id), { deleted_at: new Date().toISOString() });
      break;
    }
    case "category.save": {
      const name = v.text(p.name, "um nome", 60, true);
      const color = v.text(p.color, "uma cor", 7, true);
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new v.ValidationError("Selecione uma cor válida.");
      if (p.existing === true) await updateOwned(client, "categories", userId, v.uuid(p.id), { name, color });
      else dbError((await client.from("categories").insert({ id: v.uuid(p.id), user_id: userId, name, color, type: v.choice(p.type, ["income", "expense"]) })).error);
      break;
    }
    case "category.archive":
      await updateOwned(client, "categories", userId, v.uuid(p.id), { active: v.choice(p.state, ["active", "archived"]) === "active" });
      break;
    case "budget.save":
      dbError((await client.rpc("save_budget", { p_month: v.month(p.month), p_category: p.category_id === null ? null : v.uuid(p.category_id), p_amount: v.money(p.amount, true, true) })).error);
      break;
    case "recurrence.save": {
      const type = v.choice(p.type, ["income", "expense"]);
      const start = v.month(p.start_month);
      const end = p.end_month ? v.month(p.end_month) : null;
      const effective = v.month(p.effective_month);
      if (end && end < start) throw new v.ValidationError("O mês final deve ser igual ou posterior ao inicial.");
      const row = { category_id: v.uuid(p.category_id), type, amount: v.money(p.amount), description: v.text(p.description ?? "", "uma descrição"),
        expense_kind: type === "expense" ? v.choice(p.expense_kind, ["fixed", "variable"]) : null,
        day_of_month: v.day(p.day_of_month), start_month: start, end_month: end, effective_month: effective };
      if (p.existing === true) await updateOwned(client, "recurrences", userId, v.uuid(p.id), row);
      else dbError((await client.from("recurrences").insert({ ...row, id: v.uuid(p.id), user_id: userId })).error);
      break;
    }
    case "recurrence.archive":
      await updateOwned(client, "recurrences", userId, v.uuid(p.id), { active: false, effective_month: v.month(p.effective_month) });
      break;
    case "profile.save": {
      const timezone = v.text(p.timezone, "um fuso horário", 100, true);
      try { todayInTimezone(timezone); } catch { throw new v.ValidationError("Informe um fuso horário válido."); }
      dbError((await client.from("profiles").update({ name: v.text(p.name, "um nome", 60, true), timezone }).eq("user_id", userId)).error);
      break;
    }
    case "setup.save":
      dbError((await client.rpc("save_initial_setup", {
        p_month: v.month(p.month), p_income: v.money(p.income, true), p_fixed: v.money(p.fixed, true), p_budget: v.money(p.budget, true, true),
        p_income_category: p.income_category ? v.uuid(p.income_category) : null, p_fixed_category: p.fixed_category ? v.uuid(p.fixed_category) : null, p_day: v.day(p.day),
      })).error);
      break;
    default: throw new v.ValidationError("Operação inválida.");
  }
}
