/**
 * Supabase clients for server code. The cookie-backed client acts as the signed-in user, so RLS
 * applies to everything it touches. Use it to identify the user; PHI reads and writes go
 * through lib/data (service role, audited).
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicEnv } from "@/lib/env";
import { serverRealtimeOptions } from "@/lib/supabase/server_realtime";

export async function supabaseServer() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = publicEnv();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    realtime: serverRealtimeOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

export type SessionUser = { id: string; email: string | null };

/** The Supabase auth user for this request, looked up once and shared by the header, the page and any nested call. */
export const authUser = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/** The signed-in user from the request cookies, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const u = await authUser();
  if (!u) return null;
  return { id: u.id, email: u.email ?? null };
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("not signed in");
    this.name = "UnauthenticatedError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new UnauthenticatedError();
  return u;
}
