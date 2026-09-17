/**
 * Server-side session helpers. Every page and server action identifies the signed-in user here,
 * makes sure a users row exists (display name from auth metadata or the email local-part on first
 * visit only, so later edits are kept), and loads couple membership through lib/data.
 */
import { redirect } from "next/navigation";
import { cache } from "react";
import * as data from "@/lib/data";
import { authUser, UnauthenticatedError } from "@/lib/supabase/server";

export type CoupleRow = NonNullable<Awaited<ReturnType<typeof data.getCouple>>>;

export type AppUser = {
  id: string;
  email: string | null;
  displayName: string;
  couple: CoupleRow | null;
  side: "a" | "b" | null;
  role: "partner" | "caregiver" | "child_proxy" | null;
};

function nameFromAuth(meta: Record<string, unknown> | undefined, email: string | null): string {
  for (const key of ["display_name", "full_name", "name"]) {
    const v = meta?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (email && email.includes("@")) return email.split("@")[0];
  return "You";
}

/** Cached per request: a page and its layout share one lookup. */
export const requireAppUser = cache(async (): Promise<AppUser> => {
  const auth = await authUser();
  if (!auth) throw new UnauthenticatedError();
  const id = auth.id;
  const email = auth.email ?? null;
  const [existing, membership] = await Promise.all([data.getUser(id), data.getCoupleForUser(id)]);
  const row = existing ?? (await data.ensureUser({ id, displayName: nameFromAuth(auth.user_metadata as Record<string, unknown> | undefined, email) }));
  return {
    id,
    email,
    displayName: row.display_name,
    couple: membership?.couple ?? null,
    side: membership?.side ?? null,
    role: membership?.role === "partner" ? "partner" : membership?.role === "caregiver" ? "caregiver" : membership?.role === "child_proxy" ? "child_proxy" : null,
  };
});

/** A signed-in partner with a couple; otherwise send them to setup. */
export async function requirePartner(): Promise<AppUser & { couple: CoupleRow; side: "a" | "b" }> {
  const user = await requireAppUser();
  if (!user.couple || !user.side) redirect("/setup");
  return { ...user, couple: user.couple, side: user.side };
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
