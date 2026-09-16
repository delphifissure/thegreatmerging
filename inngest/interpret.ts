/**
 * Interpretation job (section 2a). Triggered by `couple/layers.completed` when the second
 * partner finishes Layer 1.
 *
 * Steps: score_and_persist (load both partners' responses through lib/data, decrypt mental-health
 * values only inside this step, run stage 1, persist; returns IDs and a hash only), interpret
 * (stage 2 with mental-health masked unless consented; batch API when enabled), private_results
 * (per-user results and individual profiles), notify. Each step is idempotent; the job is safe to rerun.
 */
import { LLM_CONFIG } from "@/config/llm";
import { hashInput } from "@/lib/hash";
import { runStage1, FLAG_RULES } from "@/lib/interpretation/stage1";
import { buildInterpreterInput, interpreterOutputSchemaFor, privateResultsFor } from "@/lib/interpretation/stage2";
import { InterpreterOutputSchema, type InterpreterOutput } from "@/lib/llm/schemas";
import { batchStatus, callRole, collectBatch, configureLlm, submitBatch } from "@/lib/llm";
import * as data from "@/lib/data";
import { buildProfile } from "@/lib/profile/build";
import { inngest } from "./client";

function useDb() {
  configureLlm({ recorder: new data.DbRecorder(), memo: new data.DbMemo() });
}

export const interpretCouple = inngest.createFunction(
  { id: "interpret-couple", name: "Interpret a couple's completed layers", triggers: [{ event: "couple/layers.completed" }], concurrency: [{ key: "event.data.coupleId", limit: 1 }] },
  async ({ event, step }) => {
    const coupleId = event.data.coupleId as string;

    const scored = await step.run("score_and_persist", async () => {
      const couple = await data.getCouple(coupleId);
      if (!couple || !couple.partner_b_id) throw new Error("couple is not active");
      const done = await data.coupleCompletionStatus(coupleId);
      if (!done.both) return { skipped: "not_both_complete" as const };
      const a = await data.listAllResponsesForJob(couple.partner_a_id, coupleId, "interpret");
      const b = await data.listAllResponsesForJob(couple.partner_b_id, coupleId, "interpret");
      const inputHash = hashInput({ a, b, hasChildren: couple.has_children, rules: FLAG_RULES.version });
      const { run, created } = await data.createOrGetRun({ coupleId, inputHash, rulesVersion: FLAG_RULES.version });
      if (!created && run.status === "complete") return { skipped: "memoized" as const, runId: run.id };
      const output = runStage1({ hasChildren: couple.has_children, a, b });
      await data.persistStage1({ runId: run.id, coupleId, aId: couple.partner_a_id, bId: couple.partner_b_id, output });
      await data.markRun(run.id, { status: "running", distress_context: output.distress_context });
      return { runId: run.id, inputHash, domains: output.domains.map((d) => d.domain), distress: output.distress_context };
    });
    if ("skipped" in scored) return scored;

    const interpreted = await step.run("interpret", async () => {
      useDb();
      const couple = (await data.getCouple(coupleId))!;
      const aId = couple.partner_a_id;
      const bId = couple.partner_b_id!;
      // Rebuild stage 1 inside the step (pure) so no mental-health values ever sit in a step payload.
      const a = await data.listAllResponsesForJob(aId, coupleId, "interpret.stage2");
      const b = await data.listAllResponsesForJob(bId, coupleId, "interpret.stage2");
      const stage1 = runStage1({ hasChildren: couple.has_children, a, b });
      const consentA = await data.getConsent(aId, coupleId);
      const consentB = await data.getConsent(bId, coupleId);
      const input = buildInterpreterInput(stage1, { a, b }, { a: consentA, b: consentB });
      const ctx = { coupleId, jobStep: "interpret" };
      const schema = interpreterOutputSchemaFor(input);
      let output: InterpreterOutput;
      if (process.env.LLM_USE_BATCH !== "0" && LLM_CONFIG.interpreter.batchable) {
        const item = { custom_id: `interp:${scored.runId}`, role: "interpreter" as const, input, schema, ctx };
        const { batch_id } = await submitBatch([item]);
        if (batch_id) {
          // Poll inside the step with a bounded wait; Inngest retries the step if it times out.
          const deadline = Date.now() + 50 * 60 * 1000;
          while ((await batchStatus(batch_id)) !== "ended") {
            if (Date.now() > deadline) throw new Error("batch did not finish within 50 minutes");
            await new Promise((r) => setTimeout(r, 30_000));
          }
        }
        output = (await collectBatch(batch_id, [item])).get(item.custom_id)!;
      } else {
        output = await callRole("interpreter", input, schema, ctx);
      }
      await data.persistInterpretation({ runId: scored.runId, coupleId, content: output, version: LLM_CONFIG.interpreter.prompt_version, inputHash: scored.inputHash });
      return { ok: true, domains: output.domains.length };
    });

    await step.run("private_results", async () => {
      const couple = (await data.getCouple(coupleId))!;
      const aId = couple.partner_a_id;
      const bId = couple.partner_b_id!;
      const interp = await data.getInterpretation(coupleId);
      if (!interp) throw new Error("interpretation missing");
      const output = InterpreterOutputSchema.parse(interp.content);
      const a = await data.listAllResponsesForJob(aId, coupleId, "interpret.private");
      const b = await data.listAllResponsesForJob(bId, coupleId, "interpret.private");
      const stage1 = runStage1({ hasChildren: couple.has_children, a, b });
      for (const [side, userId, scores] of [
        ["a", aId, stage1.scores.a],
        ["b", bId, stage1.scores.b],
      ] as const) {
        const content = privateResultsFor(side, output, scores, stage1);
        await data.persistPrivateResults({ runId: scored.runId, coupleId, userId, content });
        const tags = (await data.listOwnTags(userId, coupleId)).map((t) => ({ domain: t.domain, item_ref: t.item_ref, tag: t.tag, comment: t.comment }));
        await data.persistProfile({ userId, coupleId, content: buildProfile({ ownScores: scores, sentences: content.sentences, tags }) });
      }
      await data.markRun(scored.runId, { status: "complete", interpreter_version: LLM_CONFIG.interpreter.prompt_version, distress_context: scored.distress });
      return { ok: true };
    });

    await step.sendEvent("notify", { name: "couple/interpretation.completed", data: { coupleId, runId: scored.runId } });
    return { runId: scored.runId, interpreted };
  },
);
