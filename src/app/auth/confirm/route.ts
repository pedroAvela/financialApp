import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeNext } from "@/lib/auth";
import { confirmEmail, confirmationFailure } from "@/lib/auth-confirm";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"), "/configuracao-inicial");
  const recovery = params.get("type") === "recovery" || next === "/redefinir-senha";
  // Keep the browser's host: NextURL normalizes 127.0.0.1 to localhost.
  const origin = `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`;
  const response = NextResponse.redirect(new URL("/login", origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  let destination: string;
  if (!params.has("token_hash") && !params.has("code") && !params.has("error") && !params.has("error_code")) {
    // URL fragments never reach the server. The browser carries the fragment
    // through this redirect and the landing page validates it before navigating.
    destination = `/confirmar-email?next=${encodeURIComponent(next)}${recovery ? "&recovery=1" : ""}`;
  } else {
    try {
      const { url, key } = getSupabaseConfig();
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
        },
      });
      destination = await confirmEmail(params, supabase.auth);
    } catch (error) { destination = confirmationFailure(error, recovery); }
  }
  response.headers.set("Location", new URL(destination, origin).toString());
  return response;
}
