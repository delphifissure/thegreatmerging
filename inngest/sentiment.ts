/**
 * Sentiment flagger (section 11a). Gated by FEATURES.sentiment_flagger and by an active
 * clinician link for the person whose answers are scanned. Runs after the color layer completes.
 * Output is stored per partner and shown only to the linked clinician; never to the other partner.
 */
import { FEATURES } from "@/config/features";
import { LLM_CONFIG } from "@/config/llm";
import { SentimentFlaggerOutputSchema } from "@/lib/llm/schemas";
import { callRole, configureLlm } from "@/lib/llm";
import * as data from "@/lib/data";
import { inngest } from "./client";

export const flagSentiment = inngest.createFunction(
  { id: "sentiment-flagger", name: "Sentiment markers for the clinician view", triggers: [{ event: "couple/color.completed" }] },
  async ({ event, step }) => {
    if (!FEATURES.sentiment_flagger) return { skipped: "feature_disabled" };
    const coupleId = event.data.coupleId as string;
    const couple = await step.run("load", async () => data.getCouple(coupleId));
    if (!couple || !couple.partner_b_id) return { skipped: "couple_inactive" };
    const results: Record<string, number> = {};
    for (const userId of [couple.partner_a_id, couple.partner_b_id]) {
      const count = await step.run(`flag:${userId}`, async () => {
        const links = await data.activeClinicianLinks(userId);
        if (links.length === 0) return -1;
        configureLlm({ recorder: new data.DbRecorder(), memo: new data.DbMemo() });
        const answers = (await data.listOwnColorAnswers(userId, coupleId)).filter((a) => !a.skipped && a.answer_text);
        const out = await callRole(
          "sentiment_flagger",
          { answers: answers.map((a) => ({ answer_id: a.id, domain: a.domain, step: a.step, question_text: a.question_text, answer_text: a.answer_text })) },
          SentimentFlaggerOutputSchema,
          { coupleId, userId, jobStep: "sentiment_flagger" },
        );
        await data.persistSentimentFlags({ coupleId, userId, flaggerVersion: LLM_CONFIG.sentiment_flagger.prompt_version, flags: out.flags });
        return out.flags.length;
      });
      results[userId] = count;
    }
    return results;
  },
);
