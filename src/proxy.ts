import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
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
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
