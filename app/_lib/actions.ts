/** Shared result shape for server actions driven by useActionState. Serializable, no PHI. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export const idle: ActionResult = { ok: true };

export function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Only allow same-site relative paths in ?next= to avoid open redirects. */
export function safeNext(next: string | null | undefined, fallback = "/setup"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return fallback;
  return next;
}
