import { NextResponse, type NextRequest } from "next/server";
import { authenticatedClient, FinanceError, mutate, snapshot } from "@/lib/finance-server";
import { ValidationError } from "@/lib/finance-validation";
import { isSameOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const status = error instanceof FinanceError ? error.status : error instanceof ValidationError ? 400 : 503;
  return NextResponse.json({ error: error instanceof FinanceError || error instanceof ValidationError ? error.message : "Não foi possível concluir a operação. Tente novamente." }, { status, headers });
}
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authenticatedClient();
    return NextResponse.json(await snapshot(client, user.id, request.nextUrl.searchParams.get("month")), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    // NextURL normalizes loopback IPs to localhost; Host preserves the actual origin.
    if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"), request.nextUrl.protocol)) throw new FinanceError("Origem da solicitação não permitida.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new FinanceError("Formato inválido.", 415);
    const { client, user } = await authenticatedClient();
    const raw = await request.text();
    if (raw.length > 65536) throw new FinanceError("Solicitação muito grande.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new ValidationError("Dados inválidos."); }
    await mutate(client, user.id, body);
    return NextResponse.json({ saved: true }, { headers });
  } catch (error) { return failure(error); }
}
