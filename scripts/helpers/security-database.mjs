import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export const A = "a0000000-0000-4000-8000-000000000001", B = "b0000000-0000-4000-8000-000000000001";
export const personalTables = ["profiles", "categories", "transactions", "recurrences", "budgets", "installment_plans", "installment_requests"];
const identifier = (s) => { if (!/^[a-z_]+$/.test(s)) throw new Error("Identificador de teste inválido"); return `"${s}"`; };

export async function databaseFixture() {
  const db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    grant usage on schema auth,public to anon,authenticated;`);
  const folder = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(folder)).filter((f) => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(name, folder), "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [A,B]);
  // Single PostgreSQL connection: serialize transactions so roles never overlap.
  let queue = Promise.resolve();
  function execute(uid, sql, params = []) {
    const operation = queue.then(async () => {
      await db.exec("reset role; begin");
      try {
        if (uid !== "admin") {
          await db.exec("set local role " + (uid ? "authenticated" : "anon"));
          await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid ?? ""]);
        }
        const result = await db.query(sql, params);
        await db.exec("commit");
        // PostgREST serializes DATE as YYYY-MM-DD; PGlite returns a JS Date.
        for (const row of result.rows) for (const field of result.fields) {
          if (field.dataTypeID === 1082 && row[field.name] instanceof Date) row[field.name] = row[field.name].toISOString().slice(0,10);
        }
        return { data: JSON.parse(JSON.stringify(result.rows, (_, v) => typeof v === "bigint" ? Number(v) : v)), error: null };
      } catch (error) {
        await db.exec("rollback");
        return { data: null, error: { code: error.code } }; // Never log DB payloads or messages.
      }
    });
    queue = operation.then(() => {});
    return operation;
  }
  function client(uid, expired = false) {
    return {
      auth: {
        async getUser() { return { data: { user: uid && !expired ? { id: uid, email: `${uid === A ? "a" : "b"}@example.invalid`, factors: [], user_metadata: {} } : null }, error: expired ? { status: 401 } : null }; },
        async signOut() { uid = null; return { error: null }; },
      },
      from(table) {
        if (!personalTables.includes(table)) throw new Error("Tabela de teste inesperada");
        let action = "select", values, selected = "*", conflict = false, single = false, limit, offset;
        const filters = [], ordering = [];
        const q = {
          select(columns = "*") { selected = columns; return q; },
          insert(row) { action = "insert"; values = row; return q; },
          upsert(row, options) { action = "insert"; values = row; conflict = options.ignoreDuplicates; return q; },
          update(row) { action = "update"; values = row; return q; },
          eq(col, value) { filters.push([col,"=",value]); return q; },
          gte(col, value) { filters.push([col,">=",value]); return q; },
          lte(col, value) { filters.push([col,"<=",value]); return q; },
          is(col, value) { if (value !== null) throw new Error("Filtro inesperado"); filters.push([col,"is null"]); return q; },
          not(col, operator, value) { if (operator!=="is" || value!==null) throw new Error("Filtro inesperado"); filters.push([col,"is not null"]); return q; },
          order(col) { ordering.push(identifier(col)); return q; },
          range(first, last) { offset = first; limit = last-first+1; return q; },
          single() { single = true; return q; }, maybeSingle() { single = true; return q; },
          async then(resolve, reject) {
            try {
              const params = [], bind = (v) => { params.push(v); return `$${params.length}`; };
              const projection = selected === "*" ? "*" : selected.split(",").map(identifier).join(",");
              let sql;
              if (action === "insert") sql = `insert into public.${identifier(table)} (${Object.keys(values).map(identifier)}) values (${Object.values(values).map(bind)})${conflict ? " on conflict(id) do nothing" : ""}`;
              else if (action === "update") sql = `update public.${identifier(table)} set ${Object.entries(values).map(([k,v]) => `${identifier(k)}=${bind(v)}`).join(",")}`;
              else sql = `select ${projection} from public.${identifier(table)}`;
              if (filters.length) sql += " where " + filters.map(([col,op,v]) => `${identifier(col)} ${op}${op.includes("null") ? "" : " " + bind(v)}`).join(" and ");
              if (action !== "select") sql += " returning " + projection;
              if (action === "select") {
                if (ordering.length) sql += " order by " + ordering.join(",");
                if (limit !== undefined) sql += " limit " + bind(limit) + " offset " + bind(offset);
              }
              const result = await execute(uid, sql, params);
              resolve({ ...result, data: single ? result.data?.[0] ?? null : result.data });
            } catch (error) { reject(error); }
          },
        };
        return q;
      },
      async rpc(name, args = {}) {
        const entries = Object.entries(args);
        const result = await execute(uid, `select public.${identifier(name)}(${entries.map(([k],i) => `${identifier(k)} => $${i+1}`).join(",")}) as result`, entries.map(([,v]) => v));
        return { ...result, data: result.data?.[0]?.result ?? null };
      },
    };
  }
  const state = async () => {
    const result = {};
    for (const table of personalTables) result[table] = (await execute("admin", `select to_jsonb(r) as row from public.${identifier(table)} r order by to_jsonb(r)::text`)).data;
    return result;
  };
  return { db, execute, client, state };
}
