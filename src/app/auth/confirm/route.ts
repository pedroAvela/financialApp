import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  const next = safeNext(params.get("next"));
  const recovery = type === "recovery" || next === "/redefinir-senha";
  let destination = `${recovery ? "/recuperar-senha" : "/login"}?error=link_invalido`;

  try {
    const supabase = await createClient();
    if (tokenHash && (type === "signup" || type === "recovery")) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) destination = type === "recovery" ? "/redefinir-senha" : safeNext(params.get("next"), "/configuracao-inicial");
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) destination = next;
    }
  } catch {
    // Never include tokens or raw provider errors in redirects or logs.
  }
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
