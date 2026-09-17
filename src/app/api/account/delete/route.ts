import { NextResponse, type NextRequest } from "next/server";
import { deleteCurrentAccount } from "@/lib/account-server";
import { AccountDeletionError } from "@/lib/account-deletion";
import { accountFailure, accountHeaders, clearAccountCookies, deletedAccountRedirect } from "@/lib/account-http";
import { isSameOrigin } from "@/lib/request-origin";
import { readJsonBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"), request.nextUrl.protocol)) throw new AccountDeletionError("Origem da solicitação não permitida.", 403);
    const body = await readJsonBody(request, 8192);
    await deleteCurrentAccount(body);
    return await clearAccountCookies(NextResponse.json({ deleted: true, redirectTo: deletedAccountRedirect }, { headers: accountHeaders }), request);
  } catch (error) {
    const response = accountFailure(error);
    return response.status === 401 ? clearAccountCookies(response, request) : response;
  }
}
