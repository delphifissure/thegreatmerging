/**
 * Brief job (section 7). Triggered by `couple/color.completed` once both partners have completed
 * every flagged domain. One summarizer call per flagged domain, through the Batches API when
 * enabled. Written answers are summarized in the model's own words unless shareable.
 */
import { LLM_CONFIG } from "@/config/llm";
import { INSTRUMENTS } from "@/instruments/registry";
import type { Domain } from "@/instruments/schema";
import { buildSummarizerInput } from "@/lib/brief/build";
import { hashInput } from "@/lib/hash";
import { runStage1 } from "@/lib/interpretation/stage1";
import { InterpreterOutputSchema, SummarizerOutputSchema } from "@/lib/llm/schemas";
import { batchStatus, collectBatch, configureLlm, submitBatch, type BatchItem } from "@/lib/llm";
import * as data from "@/lib/data";
import { inngest } from "./client";

export const buildBriefs = inngest.createFunction(
  { id: "build-briefs", name: "Summarize each flagged domain into a brief", triggers: [{ event: "couple/color.completed" }], concurrency: [{ key: "event.data.coupleId", limit: 1 }] },
  async ({ event, step }) => {
    const coupleId = event.data.coupleId as string;

    const plan = await step.run("collect", async () => {
      const couple = await data.getCouple(coupleId);
      if (!couple || !couple.partner_b_id) throw new Error("couple is not active");
      const run = await data.getLatestRun(coupleId);
      if (!run || run.status !== "complete") return { skipped: "no_interpretation" as const };
      const domains = [...new Set((await data.getFlags(coupleId, run.id)).map((f) => f.domain as Domain))];
      const status = await data.coupleColorStatus(coupleId, domains);
      if (!status.both_complete) return { skipped: "not_both_complete" as const };
      return { runId: run.id, domains };
    });
    if ("skipped" in plan) return plan;

    const result = await step.run("summarize", async () => {
      configureLlm({ recorder: new data.DbRecorder(), memo: new data.DbMemo() });
      const couple = (await data.getCouple(coupleId))!;
      const aId = couple.partner_a_id;
      const bId = couple.partner_b_id!;
      const a = await data.listAllResponsesForJob(aId, coupleId, "brief");
      const b = await data.listAllResponsesForJob(bId, coupleId, "brief");
      const stage1 = runStage1({ hasChildren: couple.has_children, a, b });
      const interp = await data.getInterpretation(coupleId);
      const interpretation = interp ? InterpreterOutputSchema.parse(interp.content) : null;
      const descriptors: Record<string, string> = {};
      for (const mod of Object.values(INSTRUMENTS)) for (const it of mod.definition.items) descriptors[it.item_id] = it.descriptor;

      const items: Array<BatchItem<{ brief: unknown }>> = [];
      for (const domain of plan.domains) {
        const material = await data.listDomainMaterialForBrief(coupleId, domain, "brief");
        const side = (userId: string) => {
          const m = material.byUser[userId];
          return {
            answers: m.answers.map((x) => ({ id: x.id, step: x.step, question_id: x.question_id, question_text: x.question_text, answer_text: x.answer_text, skipped: x.skipped, shareable_verbatim: x.shareable_verbatim, item_ref: x.item_ref })),
            tags: m.tags.map((t) => ({ item_ref: t.item_ref, tag: t.tag, comment: t.comment })),
            consent: { share_written_answers_verbatim: m.consent.share_written_answers_verbatim },
          };
        };
        const input = buildSummarizerInput({ domain, a: side(aId), b: side(bId), flags: stage1.flags, perceptionGaps: stage1.perception_gaps, interpretation, descriptors });
        items.push({ custom_id: `brief:${coupleId}:${domain}`, role: "summarizer", input, schema: SummarizerOutputSchema, ctx: { coupleId, jobStep: `brief:${domain}` } });
      }
      let outputs: Map<string, { brief: unknown }>;
      if (process.env.LLM_USE_BATCH !== "0" && LLM_CONFIG.summarizer.batchable) {
        const { batch_id } = await submitBatch(items as Array<BatchItem<unknown>>);
        if (batch_id) {
          const deadline = Date.now() + 50 * 60 * 1000;
          while ((await batchStatus(batch_id)) !== "ended") {
            if (Date.now() > deadline) throw new Error("batch did not finish within 50 minutes");
            await new Promise((r) => setTimeout(r, 30_000));
          }
        }
        outputs = await collectBatch(batch_id, items);
      } else {
        outputs = await collectBatch("", items);
      }
      for (const item of items) {
        const out = outputs.get(item.custom_id);
        if (!out) throw new Error(`no brief for ${item.custom_id}`);
        const domain = item.custom_id.split(":").pop() as Domain;
        await data.persistBrief({ coupleId, runId: plan.runId, domain, content: out.brief, version: LLM_CONFIG.summarizer.prompt_version, inputHash: hashInput(item.input) });
      }
      return { briefs: items.length };
    });
    return result;
  },
);
