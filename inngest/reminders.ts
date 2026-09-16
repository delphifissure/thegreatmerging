/**
 * Revisit reminders (phase 7). Runs daily; marks due revisits as reminded and emits an event
 * per item. Delivery (email) is a hook: the app shows due items on /revisit regardless.
 */
import { and, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db/client";
import * as data from "@/lib/data";
import { inngest } from "./client";

export const revisitReminders = inngest.createFunction(
  { id: "revisit-reminders", name: "Daily revisit reminders", triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    const due = await step.run("find_due", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db()
        .select({ id: schema.revisits.id, couple_id: schema.revisits.couple_id })
        .from(schema.revisits)
        .where(and(lte(schema.revisits.due_date, today), isNull(schema.revisits.completed_at), isNull(schema.revisits.reminder_sent_at), eq(schema.revisits.deleted_at, schema.revisits.deleted_at)));
      return rows;
    });
    for (const r of due) {
      await step.run(`remind:${r.id}`, async () => {
        await data.markReminderSent(r.id);
        await data.audit({ actorUserId: null, actorKind: "job", action: "revisit.reminder", targetTable: "revisits", targetId: r.id });
        return { ok: true };
      });
      await step.sendEvent(`event:${r.id}`, { name: "revisit/reminder.sent", data: { coupleId: r.couple_id, revisitId: r.id } });
    }
    return { reminded: due.length };
  },
);
