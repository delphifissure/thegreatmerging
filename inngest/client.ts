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

export const inngest = new Inngest({ id: "the-plan" });
