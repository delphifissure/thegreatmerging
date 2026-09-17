/**
 * Inngest client and event catalogue. Event payloads carry IDs only, never PHI (section 2).
 */
import { Inngest } from "inngest";

export type Events = {
  "couple/layers.completed": { data: { coupleId: string } };
  "couple/interpretation.completed": { data: { coupleId: string; runId: string } };
  "color/probe.requested": { data: { sessionId: string; userId: string; coupleId: string; domain: string } };
  "couple/color.completed": { data: { coupleId: string } };
  "export/requested": { data: { coupleId: string | null; userId: string; kind: "brief" | "plan" | "profile"; format: "md" | "pdf" } };
  "revisit/reminder.sent": { data: { coupleId: string; revisitId: string } };
};

/**
 * The SDK defaults to Inngest Cloud unless INNGEST_DEV is set, which makes `next dev` fail to send
 * events when no cloud keys exist. Under `next dev` with INNGEST_DEV unset, use the local dev server;
 * an explicit INNGEST_DEV, and every production build, keep the SDK's own resolution.
 */
export function resolveIsDev(env: Record<string, string | undefined> = process.env): boolean | undefined {
  return env.INNGEST_DEV === undefined && env.NODE_ENV === "development" ? true : undefined;
}

const isDev = resolveIsDev();
export const inngest = new Inngest({ id: "the-plan", ...(isDev === undefined ? {} : { isDev }) });
