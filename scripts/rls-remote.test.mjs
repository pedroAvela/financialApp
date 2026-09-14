import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Deliberately opt-in. This script writes only to two dedicated test accounts.
// No service_role key, SQL Editor, admin API, or account creation is used.
const required = ["RLS_URL", "RLS_PUBLISHABLE_KEY", "RLS_A_EMAIL", "RLS_A_PASSWORD", "RLS_B_EMAIL", "RLS_B_PASSWORD"];
const enabled = process.env.RUN_REMOTE_RLS === "1" && required.every((name) => process.env[name]);
test("RLS remoto: duas contas, visitante e geração concorrente", { skip: enabled ? false : "Configure as duas contas de teste e RUN_REMOTE_RLS=1 conforme docs/financial-mvp.md." }, async () => {
  assert.ok(process.env.RLS_PUBLISHABLE_KEY.startsWith("sb_publishable_"), "Use somente a chave publicável.");
  const makeClient = () => createClient(process.env.RLS_URL, process.env.RLS_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const a = makeClient(), b = makeClient(), anon = makeClient();
  const check = (result) => { assert.equal(result.error, null, "A operação própria deveria ser permitida."); return result.data; };
  const denied = (result) => { assert.ok(result.error || !result.data?.length, "A operação alheia deveria ser negada ou não atingir linhas."); };
  for (const [client, prefix] of [[a, "RLS_A"], [b, "RLS_B"]]) {
    check(await client.auth.signInWithPassword({ email: process.env[prefix + "_EMAIL"], password: process.env[prefix + "_PASSWORD"] }));
    check(await client.rpc("initialize_finance"));
  }
  const ua = check(await a.auth.getUser()).user.id, ub = check(await b.auth.getUser()).user.id;
  assert.notEqual(ua, ub, "Use duas contas distintas.");
  const ca = randomUUID(), cb = randomUUID(), tx = randomUUID(), rule = randomUUID(), budget = randomUUID();
  const month = "2099-02-01";
  try {
    check(await a.from("categories").insert({ id: ca, name: "Teste RLS " + ca, type: "expense" }));
    check(await b.from("categories").insert({ id: cb, name: "Teste RLS " + cb, type: "expense" }));
    check(await a.from("transactions").insert({ id: tx, category_id: ca, type: "expense", amount: 123, expense_kind: "variable", date: month }));
    check(await a.from("recurrences").insert({ id: rule, category_id: ca, type: "expense", amount: 456, expense_kind: "fixed", day_of_month: 31, start_month: month, end_month: month, effective_month: month }));
    check(await a.from("budgets").insert({ id: budget, category_id: ca, month, amount: 1000 }));
    for (const [table, id] of [["categories", ca], ["transactions", tx], ["recurrences", rule], ["budgets", budget]]) {
      assert.equal(check(await b.from(table).select("*").eq("id", id)).length, 0, "B não deve ler IDs de A.");
      denied(await b.from(table).update({ user_id: ub }).eq("id", id).select("id"));
      denied(await b.from(table).delete().eq("id", id).select("id"));
      denied(await a.from(table).update({ user_id: ub }).eq("id", id).select("id"));
    }
    assert.equal(check(await b.from("profiles").select("*").eq("user_id", ua)).length, 0);
    denied(await b.from("profiles").update({ name: "invasão" }).eq("user_id", ua).select("user_id"));
    denied(await b.from("profiles").delete().eq("user_id", ua).select("user_id"));
    denied(await a.from("profiles").update({ user_id: ub }).eq("user_id", ua).select("user_id"));
    const foreignRows = [
      ["profiles", { user_id: ua }],
      ["categories", { user_id: ua, name: "Invasão", type: "expense" }],
      ["transactions", { category_id: ca, type: "expense", amount: 1, expense_kind: "variable", date: month }],
      ["budgets", { category_id: ca, month, amount: 1 }],
      ["recurrences", { category_id: ca, type: "expense", amount: 1, expense_kind: "fixed", day_of_month: 1, start_month: month, effective_month: month }],
    ];
    const testIds = { profiles: ua, categories: ca, transactions: tx, budgets: budget, recurrences: rule };
    for (const [table, row] of foreignRows) {
      const idColumn = table === "profiles" ? "user_id" : "id";
      denied(await b.from(table).insert(row).select("*"));
      denied(await anon.from(table).select("*").eq(idColumn, testIds[table]));
      denied(await anon.from(table).insert(row).select("*"));
      denied(await anon.from(table).update({ user_id: ua }).eq(idColumn, testIds[table]).select("*"));
      denied(await anon.from(table).delete().eq(idColumn, testIds[table]).select("*"));
    }
    denied(await a.from("transactions").update({ category_id: cb }).eq("id", tx).select("id"));
    denied(await a.from("budgets").update({ category_id: cb }).eq("id", budget).select("id"));
    denied(await a.from("recurrences").update({ category_id: cb }).eq("id", rule).select("id"));
    denied(await b.from("transactions").insert({ category_id: cb, type: "expense", amount: 1, expense_kind: "fixed", date: month, recurrence_id: rule, occurrence_month: month }).select("id"));
    assert.ok((await anon.rpc("initialize_finance")).error);
    assert.ok((await anon.rpc("generate_occurrences", { p_month: month })).error);
    assert.ok((await anon.rpc("save_budget", { p_month: month, p_category: ca, p_amount: 10 })).error);
    // This is actual concurrent HTTP traffic to Postgres, unlike a serial in-memory connection.
    for (const result of await Promise.all(Array.from({ length: 6 }, () => a.rpc("generate_occurrences", { p_month: month })))) check(result);
    const occurrences = check(await a.from("transactions").select("*").eq("recurrence_id", rule).eq("occurrence_month", month));
    assert.equal(occurrences.length, 1);
    assert.equal(occurrences[0].date, "2099-02-28");
    const occurrence = occurrences[0].id;
    check(await a.from("transactions").update({ status: "realized" }).eq("id", occurrence));
    check(await a.from("recurrences").update({ amount: 789, effective_month: month }).eq("id", rule));
    const realized = check(await a.from("transactions").select("*").eq("id", occurrence).single());
    assert.equal(realized.amount, 456);
    assert.equal(realized.status, "realized");
    check(await a.from("transactions").update({ description: "Atualização própria" }).eq("id", tx));
    check(await a.from("budgets").update({ amount: 2000 }).eq("id", budget));
    assert.equal(check(await a.from("transactions").delete().eq("id", tx).select("id")).length, 1);
    assert.equal(check(await a.from("budgets").delete().eq("id", budget).select("id")).length, 1);
  } finally {
    // Categories/rules have no DELETE grant. Archive these test-only records.
    await a.from("recurrences").update({ active: false, effective_month: month }).eq("id", rule);
    await a.from("transactions").delete().eq("recurrence_id", rule);
    await a.from("transactions").delete().eq("id", tx);
    await a.from("budgets").delete().eq("id", budget);
    await a.from("categories").update({ active: false }).eq("id", ca);
    await b.from("categories").update({ active: false }).eq("id", cb);
    await Promise.all([a.auth.signOut({ scope: "local" }), b.auth.signOut({ scope: "local" })]);
  }
});
