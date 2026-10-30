import { NextResponse, type NextRequest } from "next/server";
import { authenticatedClient, FinanceError, installmentRows, mutate, snapshot } from "@/lib/finance-server";
import { ValidationError } from "@/lib/finance-validation";
import { isSameOrigin } from "@/lib/request-origin";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const status = error instanceof FinanceError || error instanceof RequestBodyError ? error.status : error instanceof ValidationError ? 400 : 503;
  return NextResponse.json({ error: error instanceof FinanceError || error instanceof ValidationError || error instanceof RequestBodyError ? error.message : "Não foi possível concluir a operação. Tente novamente." }, { status, headers });
}
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authenticatedClient();
    const plan = request.nextUrl.searchParams.get("plan");
    if (plan !== null) return NextResponse.json(await installmentRows(client, user.id, plan), { headers });
    return NextResponse.json(await snapshot(client, user.id, request.nextUrl.searchParams.get("month")), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    // NextURL normalizes loopback IPs to localhost; Host preserves the actual origin.
    if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"), request.nextUrl.protocol)) throw new FinanceError("Origem da solicitação não permitida.", 403);
    const { client, user } = await authenticatedClient();
    const body = await readJsonBody(request, 65536);
    await mutate(client, user.id, body);
    // Return the refreshed month in the same request. A refresh failure must not
    // turn a committed write into an error that invites a duplicate submission.
    const month = (body as { month?: unknown }).month;
    try {
      return NextResponse.json({ saved: true, snapshot: await snapshot(client, user.id, typeof month === "string" && month ? month : null) }, { headers });
    } catch {
      return NextResponse.json({ saved: true }, { headers });
    }
  } catch (error) { return failure(error); }
}
