import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { contentSecurityPolicy } from "@/lib/security-headers";

export async function proxy(request: NextRequest) {
  const { url, key } = getSupabaseConfig();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, url, process.env.NODE_ENV === "development");
  // Replace untrusted incoming CSP/nonce so Next applies our nonce to its scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Validate with Auth itself, including sessions revoked after logout.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (isProtectedPath(request.nextUrl.pathname) && (error || !user)) {
    const destination = request.nextUrl.clone();
    destination.pathname = request.nextUrl.pathname === "/redefinir-senha" ? "/recuperar-senha" : "/login";
    destination.search = "";
    if (request.nextUrl.pathname === "/redefinir-senha") {
      destination.searchParams.set("error", "link_invalido");
    } else {
      destination.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    }
    const redirect = NextResponse.redirect(destination);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response = redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Content-Security-Policy", policy);
  if (process.env.NODE_ENV === "production" && request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
