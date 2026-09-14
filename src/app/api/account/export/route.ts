import { NextResponse } from "next/server";
import { authenticatedClient, exportOwnFinance } from "@/lib/finance-server";
import { accountFailure, accountHeaders } from "@/lib/account-http";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { client, user } = await authenticatedClient();
    const financialData = await exportOwnFinance(client, user.id);
    return new NextResponse(JSON.stringify({ version: 1, exported_at: new Date().toISOString(), account: { id: user.id, email: user.email, created_at: user.created_at }, ...financialData }, null, 2), {
      headers: { ...accountHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="meus-dados-financeiros.json"', "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) { return accountFailure(error); }
}
