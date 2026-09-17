/**
 * Next.js proxy (formerly middleware): refreshes the Supabase session cookie on every request
 * and redirects signed-out visitors away from app screens. Authorization itself is RLS plus
 * lib/data; this is only the optimistic redirect.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { serverRealtimeOptions } from "@/lib/supabase/server_realtime";

const PUBLIC_PREFIXES = ["/", "/sign-in", "/invite", "/auth", "/share", "/api/inngest", "/api/health", "/_next", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    realtime: serverRealtimeOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
