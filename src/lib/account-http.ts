import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./supabase/config";
import { AccountDeletionError } from "./account-deletion";
import { FinanceError } from "./finance-server";
import { RequestBodyError } from "./request-body";

export const accountHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export const deletedAccountRedirect = "/login?notice=conta_excluida";

export async function clearAccountCookies(response: NextResponse, request: NextRequest) {
  const prefix = `sb-${new URL(getSupabaseConfig().url).hostname.split(".")[0]}-auth-token`;
  const store = await cookies();
  for (const { name } of [...request.cookies.getAll(), ...store.getAll()]) {
    if (name === prefix || name.startsWith(`${prefix}.`) || name === `${prefix}-code-verifier` || name.startsWith(`${prefix}-code-verifier.`)) {
      response.cookies.set(name, "", { path: "/", maxAge: 0, sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
    }
  }
  return response;
}

export function accountFailure(error: unknown) {
  const known = error instanceof AccountDeletionError || error instanceof FinanceError || error instanceof RequestBodyError;
  return NextResponse.json({ error: known ? error.message : "Não foi possível concluir a operação. Tente novamente." }, {
    status: known ? error.status : 503, headers: accountHeaders,
  });
}
