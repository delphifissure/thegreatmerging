/**
 * API compatibility rules learned on first contact with the Batches API and strict tool mode:
 *   - strict tool schemas reject numeric/string/array bound keywords (minimum, maxLength, ...);
 *     Zod still enforces them locally, so they are stripped from the wire schema only;
 *   - batch custom_ids must match ^[a-zA-Z0-9_-]{1,64}$.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { batchCustomId, buildRequest, stripUnsupportedKeywords } from "@/lib/llm";
import { ProberOutputSchema, SentimentFlaggerOutputSchema } from "@/lib/llm/schemas";

describe("strict tool schemas", () => {
  it("stripUnsupportedKeywords removes bound keywords at every depth and keeps structure", () => {
    const schema = z.object({
      confidence: z.number().min(0).max(1),
      name: z.string().min(1).max(40),
      tags: z.array(z.string().max(5)).max(3),
      nested: z.object({ n: z.number().int().min(1) }),
    });
    const raw = z.toJSONSchema(schema, { target: "draft-07" });
    const text = JSON.stringify(stripUnsupportedKeywords(raw));
    for (const kw of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) expect(text).not.toContain(`"${kw}"`);
    expect(text).toContain('"additionalProperties":false');
    expect(text).toContain('"required"');
    expect(text).toContain('"nested"');
  });

  it("every role's wire schema is free of unsupported keywords while Zod still validates the bounds", () => {
    const requests = [buildRequest("sentiment_flagger", { any: "input" }, SentimentFlaggerOutputSchema), buildRequest("prober", { any: "input" }, ProberOutputSchema)];
    for (const req of requests) {
      const text = JSON.stringify(req.tools?.[0]);
      expect(text).not.toMatch(/"(minimum|maximum|minLength|maxLength|minItems|maxItems|pattern|format)"/);
    }
    expect(SentimentFlaggerOutputSchema.safeParse({ flags: [{ marker: "contempt", quoted_span: "x", confidence: 2, source_answer_id: "a" }] }).success).toBe(false);
    expect(ProberOutputSchema.safeParse({ probes: [1, 2, 3, 4].map(() => ({ template_id: 4, question_text: "What's the value under this?", reason_text: "r", references: ["a"] })) }).success).toBe(false);
  });
});

describe("batch custom ids", () => {
  it("keeps already-valid ids unchanged", () => {
    expect(batchCustomId("interp_couple_01")).toBe("interp_couple_01");
  });

  it("rewrites ids with colons or other characters into the allowed alphabet, deterministically and without collisions", () => {
    const a = batchCustomId("interp:couple_01");
    const b = batchCustomId("interp:couple_02");
    const c = batchCustomId("brief:6f1d2c3e-0000-4000-8000-000000000000:social_family_longterm");
    for (const id of [a, b, c]) expect(id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(a).not.toBe(b);
    expect(batchCustomId("interp:couple_01")).toBe(a);
    // The original id stays recoverable by the caller because it is a pure function of the input.
    expect(batchCustomId("interp_couple_01")).not.toBe(a);
  });
});
