import { NextResponse, type NextRequest } from "next/server";
import { deleteCurrentAccount } from "@/lib/account-server";
import { AccountDeletionError } from "@/lib/account-deletion";
import { accountFailure, accountHeaders, clearAccountCookies, deletedAccountRedirect } from "@/lib/account-http";
import { isSameOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"), request.nextUrl.protocol)) throw new AccountDeletionError("Origem da solicitação não permitida.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccountDeletionError("Formato inválido.", 415);
    const raw = await request.text();
    if (raw.length > 8192) throw new AccountDeletionError("Solicitação muito grande.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new AccountDeletionError("Dados inválidos."); }
    await deleteCurrentAccount(body);
    return await clearAccountCookies(NextResponse.json({ deleted: true, redirectTo: deletedAccountRedirect }, { headers: accountHeaders }), request);
  } catch (error) {
    const response = accountFailure(error);
    return response.status === 401 ? clearAccountCookies(response, request) : response;
  }
}
