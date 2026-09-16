/**
 * Synthetic couples: fixture loader and expectation comparison shared by the unit test
 * (tests/unit/synthetic_couples.test.ts) and the evals runner.
 *
 * Fixture format (evals/synthetic_couples/couples/couple_NN.json):
 *   { id, description, has_children, a: { <instrument_key>: Response[] }, b: { ... },
 *     expected: { distress_context, domains: { <domain>: weight }, flags: ExpectedFlag[], polarization_loops: string[] } }
 * Expected values are hand-derived from config/flag_rules.json and the instrument configs in build.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Response } from "@/instruments/schema";
import type { Flag, Stage1Input, Stage1Output } from "@/lib/interpretation/stage1";

export type ExpectedFlag = {
  rule_key: string;
  domain: string;
  user: "a" | "b" | "both";
  item?: string;
  label?: string;
  weight: number;
};

export type SyntheticExpected = {
  distress_context: boolean;
  domains: Record<string, number>;
  flags: ExpectedFlag[];
  polarization_loops: string[];
};

export type SyntheticCouple = {
  id: string;
  description: string;
  has_children: boolean;
  a: Record<string, Response[]>;
  b: Record<string, Response[]>;
  expected: SyntheticExpected;
};

export const COUPLES_DIR = path.resolve(process.cwd(), "evals/synthetic_couples/couples");

export function loadSyntheticCouples(dir: string = COUPLES_DIR): SyntheticCouple[] {
  return readdirSync(dir)
    .filter((f) => /^couple_\d+\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as SyntheticCouple);
}

export function toStage1Input(couple: SyntheticCouple): Stage1Input {
  return { hasChildren: couple.has_children, a: couple.a, b: couple.b };
}

/** The fields of a Flag that fixtures pin down. `item` and `label` are omitted when absent. */
export function projectFlag(f: Flag): ExpectedFlag {
  return {
    rule_key: f.rule_key,
    domain: f.domain,
    user: f.triggered_by.user ?? "both",
    ...(f.triggered_by.item ? { item: f.triggered_by.item } : {}),
    ...(f.label ? { label: f.label } : {}),
    weight: f.weight,
  };
}

export function flagKey(f: ExpectedFlag): string {
  return [f.rule_key, f.domain, f.user, f.item ?? "-", f.label ?? "-", f.weight].join(" | ");
}

/** Item ids whose polarization dimension is a loop in the couple scores. */
export function polarizationLoops(output: Stage1Output): string[] {
  const cs = output.couple_scores.find((c) => c.metric === "polarization_loop");
  const dims = (cs?.details.dimensions ?? []) as Array<{ item_id: string; loop: boolean }>;
  return dims.filter((d) => d.loop).map((d) => d.item_id).sort();
}

export function actualDomains(output: Stage1Output): Record<string, number> {
  return Object.fromEntries(output.domains.map((d) => [d.domain, d.weight]));
}

function countBy(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

/** Human-readable differences between a couple's expected block and a Stage1Output. Empty when they agree. */
export function compareToExpected(couple: SyntheticCouple, output: Stage1Output): string[] {
  const diffs: string[] = [];
  const exp = couple.expected;

  if (output.distress_context !== exp.distress_context) {
    diffs.push(`distress_context: expected ${exp.distress_context}, got ${output.distress_context}`);
  }

  const got = actualDomains(output);
  for (const domain of new Set([...Object.keys(exp.domains), ...Object.keys(got)])) {
    const e = exp.domains[domain];
    const g = got[domain];
    if (e === undefined) diffs.push(`domain ${domain}: unexpected weight ${g}`);
    else if (g === undefined) diffs.push(`domain ${domain}: expected weight ${e}, got none`);
    else if (e !== g) diffs.push(`domain ${domain}: expected weight ${e}, got ${g}`);
  }

  const expected = countBy(exp.flags.map(flagKey));
  const actual = countBy(output.flags.map((f) => flagKey(projectFlag(f))));
  for (const [key, n] of expected) {
    const have = actual.get(key) ?? 0;
    if (have < n) diffs.push(`flag missing (${n - have}x): ${key}`);
  }
  for (const [key, n] of actual) {
    const want = expected.get(key) ?? 0;
    if (n > want) diffs.push(`flag unexpected (${n - want}x): ${key}`);
  }

  const loops = polarizationLoops(output);
  const expLoops = [...exp.polarization_loops].sort();
  if (JSON.stringify(loops) !== JSON.stringify(expLoops)) {
    diffs.push(`polarization_loops: expected [${expLoops.join(", ")}], got [${loops.join(", ")}]`);
  }
  return diffs;
}
