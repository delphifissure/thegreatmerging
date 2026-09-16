/**
 * Guardrails (section 10). Two checks; both must pass for text that reaches a person:
 *   1. a deterministic pattern list from config/prohibited_language.json, run on every output
 *      of every role (relationship verdicts, diagnoses, trait labels, statements of worth), plus
 *      the rule that any reference to the polarization block must carry the unvalidated label;
 *   2. a model yes/no check ("does this text contain a verdict about the relationship or a
 *      diagnosis of a person?") on text that reaches a person. The model call is injected by
 *      lib/llm.ts so this module has no dependency on the SDK.
 */
import prohibited from "@/config/prohibited_language.json";

export type Violation = {
  category: "relationship_verdict" | "diagnosis" | "trait_label" | "worth" | "unvalidated_label" | "model";
  pattern: string;
  match: string;
  path?: string;
};

export type GuardrailResult = { ok: boolean; violations: Violation[] };

type Category = Exclude<Violation["category"], "unvalidated_label" | "model">;

const CATEGORIES: Category[] = ["relationship_verdict", "diagnosis", "trait_label", "worth"];

const compiled: Array<{ category: Category; source: string; re: RegExp }> = CATEGORIES.flatMap((category) =>
  (prohibited[category] as string[]).map((source) => ({ category, source, re: new RegExp(source, "i") })),
);

const allowlist = (prohibited.allowlist_phrases as string[]).map((p) => p.toLowerCase());

/** Remove allowlisted instrument phrases so "attachment anxiety" does not trip the trait-label rules. */
function stripAllowlisted(text: string): string {
  let t = text;
  for (const phrase of allowlist) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    t = t.replace(re, " ");
  }
  return t;
}

export function checkTextDeterministic(text: string, path?: string): Violation[] {
  const violations: Violation[] = [];
  if (!text) return violations;
  const scan = stripAllowlisted(text);
  for (const { category, source, re } of compiled) {
    const m = re.exec(scan);
    if (m) violations.push({ category, pattern: source, match: m[0], path });
  }
  // Every reference to the polarization block must carry the unvalidated label.
  if (/polari[sz]/i.test(text) && !/unvalidated/i.test(text)) {
    violations.push({ category: "unvalidated_label", pattern: "polarization without unvalidated label", match: "polarization", path });
  }
  return violations;
}

/** Walk any JSON-like value and return every string leaf with its path. */
export function collectStrings(value: unknown, path = "$"): Array<{ path: string; text: string }> {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => collectStrings(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => collectStrings(v, `${path}.${k}`));
  }
  return [];
}

export function checkOutputDeterministic(output: unknown, opts: { skipPaths?: RegExp } = {}): GuardrailResult {
  const violations: Violation[] = [];
  for (const { path, text } of collectStrings(output)) {
    if (opts.skipPaths && opts.skipPaths.test(path)) continue;
    violations.push(...checkTextDeterministic(text, path));
  }
  return { ok: violations.length === 0, violations };
}

export type ModelCheck = (text: string) => Promise<{ contains_verdict_or_diagnosis: boolean; reason: string }>;

/**
 * Full check: deterministic filter on every string, and (when reachesPerson) the model
 * yes/no check on the concatenated person-facing text. Both must pass.
 */
export async function checkOutput(
  output: unknown,
  opts: { reachesPerson: boolean; modelCheck?: ModelCheck; skipPaths?: RegExp },
): Promise<GuardrailResult> {
  const det = checkOutputDeterministic(output, { skipPaths: opts.skipPaths });
  if (!det.ok) return det;
  if (!opts.reachesPerson || !opts.modelCheck) return det;
  const strings = collectStrings(output)
    .filter((s) => !(opts.skipPaths && opts.skipPaths.test(s.path)))
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0);
  if (strings.length === 0) return det;
  const verdict = await opts.modelCheck(strings.join("\n"));
  if (verdict.contains_verdict_or_diagnosis) {
    return {
      ok: false,
      violations: [{ category: "model", pattern: "guardrail model check", match: verdict.reason.slice(0, 500) }],
    };
  }
  return det;
}

export function formatViolations(v: Violation[]): string {
  return v.map((x) => `${x.category}${x.path ? ` at ${x.path}` : ""}: "${x.match}"`).join("; ");
}
