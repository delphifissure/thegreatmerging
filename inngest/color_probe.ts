/**
 * Prober step (section 6, model call point 2). Invoked once, on entry to `consistency`.
 * Loads this user's full answer set for the domain, this user's own scores (including their
 * own mental-health scores), and their other color answers; never the partner's material.
 * Appends the probes to the session queue.
 */
import { ProberOutputSchema } from "@/lib/llm/schemas";
import { callRole, configureLlm } from "@/lib/llm";
import * as data from "@/lib/data";
import { reduce, type MachineState } from "@/lib/color/machine";
import { loadColorModule } from "@/lib/color/config";
import type { Domain } from "@/instruments/schema";
import { inngest } from "./client";

export const probeColorSession = inngest.createFunction(
  { id: "color-probe", name: "Run the prober for a color session", triggers: [{ event: "color/probe.requested" }], concurrency: [{ key: "event.data.sessionId", limit: 1 }] },
  async ({ event, step }) => {
    const { sessionId, userId, coupleId, domain } = event.data as { sessionId: string; userId: string; coupleId: string; domain: Domain };

    const probes = await step.run("probe", async () => {
      configureLlm({ recorder: new data.DbRecorder(), memo: new data.DbMemo() });
      const session = await data.getColorSession(sessionId);
      if (!session || session.user_id !== userId) throw new Error("session not found");
      const state = session.state as MachineState;
      if (state.probes_loaded) return { probes: [], already: true };
      const all = await data.listOwnColorAnswers(userId, coupleId);
      const mine = all.filter((a) => a.domain === domain);
      const others = all.filter((a) => a.domain !== domain);
      const scores = await data.getOwnScores(userId, coupleId);
      const tags = await data.listOwnTags(userId, coupleId);
      const shape = (a: (typeof all)[number]) => ({ answer_id: a.id, domain: a.domain, step: a.step, question_id: a.question_id, question_text: a.question_text, answer_text: a.answer_text, skipped: a.skipped });
      const out = await callRole(
        "prober",
        { domain, answers: mine.map(shape), other_answers: others.map(shape), scores, tags: tags.map((t) => ({ item_ref: t.item_ref, tag: t.tag, comment: t.comment })) },
        ProberOutputSchema,
        { coupleId, userId, jobStep: `color_probe:${domain}` },
      );
      return { probes: out.probes, already: false };
    });

    await step.run("append", async () => {
      const session = await data.getColorSession(sessionId);
      if (!session) throw new Error("session not found");
      const state = session.state as MachineState;
      if (state.probes_loaded) return { ok: true, appended: 0 };
      const config = loadColorModule(domain);
      const next = reduce(state, { type: "probes_loaded", probes: probes.probes }, config);
      await data.saveColorSession({
        sessionId,
        state: next.state,
        appendTranscript: probes.probes.map((p) => ({ role: "system" as const, content: p.question_text, step: "consistency", at: new Date().toISOString() })),
      });
      return { ok: true, appended: probes.probes.length };
    });

    return { sessionId, probes: probes.probes.length };
  },
);
