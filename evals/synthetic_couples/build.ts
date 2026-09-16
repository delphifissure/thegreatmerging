/**
 * Deterministic generator for the synthetic-couple fixtures (no randomness).
 *
 *   ./node_modules/.bin/tsx --tsconfig tsconfig.json evals/synthetic_couples/build.ts
 *
 * Each profile starts from the benign couple in tests/unit/helpers/responses.ts (zero flags) and plants a
 * narrow pattern. The `expected` block is HAND-DERIVED from config/flag_rules.json and the item -> domain
 * mapping in config/instruments/*.json (item.domain, else default_domain) and written as-is; the generator
 * then runs the real pipeline and prints any disagreement so an engine regression is visible at build time.
 *
 * Rule weights (flag_rules 1.0.0): map 3 | acq desired change 2 | acq perceptual miss 2 | fapbi 2 |
 * wdw now/ideal gap 2 | wdw now disagreement 2 | rdas consensus 2 | brief_crs 3 | psdq gap 3 | polarization loop 2 |
 * needs_context 1. Distress: either partner's PHQ-9 or GAD-7 total >= 10.
 *
 * Domain lookups used below: map_1 household, map_2 conflict, map_9 conflict; acq_2 household, acq_7 intimacy,
 * acq_11 parenting, acq_13 self_care, acq_16 communication, acq_20 social_family_longterm, acq_22 self_care;
 * fapbi_3 intimacy, fapbi_12 communication, fapbi_17 conflict; who_does_what 1–17 household, 18–20
 * social_family_longterm, 21–24 parenting; rdas_2 intimacy, rdas_3 communication, rdas_4 intimacy;
 * polarization_1 parenting (structure with a child), _2 household, _3 communication, _5 intimacy,
 * _8 and _9 social_family_longterm; csi16 has no item domains and defaults to communication.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runStage1 } from "@/lib/interpretation/stage1";
import {
  completeCouple,
  constantResponses,
  responsesFrom,
  setItem,
  setItems,
  type CoupleOverrides,
} from "@/tests/unit/helpers/responses";
import { compareToExpected, COUPLES_DIR, type SyntheticCouple, type SyntheticExpected } from "./index";

type Profile = { id: string; description: string; overrides: CoupleOverrides; expected: SyntheticExpected };

const NONE: SyntheticExpected = { distress_context: false, domains: {}, flags: [], polarization_loops: [] };

/** PHQ-9 / GAD-7 responses summing to `total` (fill items with 3s, then the remainder). */
function symptomTotal(key: "phq9" | "gad7", total: number) {
  const values: Record<string, number> = {};
  let left = total;
  for (let i = 1; left > 0; i++) {
    values[`${key}_${i}`] = Math.min(3, left);
    left -= Math.min(3, left);
  }
  return responsesFrom(key, values, 0);
}

const PERMISSIVE = ["psdq_sf_4", "psdq_sf_8", "psdq_sf_15", "psdq_sf_20", "psdq_sf_24"];
const AUTHORITARIAN = [2, 6, 10, 13, 16, 17, 19, 23, 26, 28, 30, 32].map((n) => `psdq_sf_${n}`);
const all = (ids: string[], value: number): Array<[string, number]> => ids.map((id) => [id, value]);

export const PROFILES: Profile[] = [
  {
    id: "couple_01",
    description: "A settled couple with children: every instrument benign, optional OCI-R and PRQC present, nothing to flag.",
    overrides: { include: ["oci_r", "prqc"] },
    expected: NONE,
  },
  {
    id: "couple_02",
    description: "Single rule: partner A rates money (map_1) intensity 70 with efficacy 30, a high-intensity low-efficacy area.",
    overrides: { a: { map: (rs) => setItems(rs, [["map_1", 70, "intensity"], ["map_1", 30, "efficacy"]]) } },
    expected: {
      distress_context: false,
      domains: { household: 3 },
      flags: [{ rule_key: "map_high_intensity_low_efficacy", domain: "household", user: "a", item: "map_1", weight: 3 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_03",
    description: "Single rule: partner B wants somewhat more affection (acq_7 self +2) and A perceives it accurately, so only the desired-change rule fires.",
    overrides: {
      b: { acq: (rs) => setItem(rs, "acq_7", 2, "self") },
      a: { acq: (rs) => setItem(rs, "acq_7", 2, "partner_wants") },
    },
    expected: {
      distress_context: false,
      domains: { intimacy: 2 },
      flags: [{ rule_key: "acq_desired_change", domain: "intimacy", user: "b", item: "acq_7", weight: 2 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_04",
    description: "Single rule: partner A believes B wants less expressing of feelings (acq_16 partner_wants -2) while B wants no change, a perceptual miss of 2.",
    overrides: { a: { acq: (rs) => setItem(rs, "acq_16", -2, "partner_wants") } },
    expected: {
      distress_context: false,
      domains: { communication: 2 },
      flags: [{ rule_key: "acq_perceptual_miss", domain: "communication", user: "a", item: "acq_16", weight: 2 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_05",
    description: "Single rule: partner B finds a demand behavior (fapbi_12) that happened 20 times unacceptable (acceptability 3).",
    overrides: { b: { fapbi: (rs) => setItems(rs, [["fapbi_12", 20, "frequency"], ["fapbi_12", 3, "acceptability"]]) } },
    expected: {
      distress_context: false,
      domains: { communication: 2 },
      flags: [{ rule_key: "fapbi_unacceptable", domain: "communication", user: "b", item: "fapbi_12", weight: 2 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_06",
    description: "Single rule: partner A does all the laundry (who_does_what_6 now 1) and wants it shared (ideal 5); B agrees A does it all (now 9), so only A's now-versus-ideal gap fires.",
    overrides: {
      a: { who_does_what: (rs) => setItems(rs, [["who_does_what_6", 1, "now"], ["who_does_what_6", 5, "ideal"]]) },
      b: { who_does_what: (rs) => setItems(rs, [["who_does_what_6", 9, "now"], ["who_does_what_6", 9, "ideal"]]) },
    },
    expected: {
      distress_context: false,
      domains: { household: 2 },
      flags: [{ rule_key: "wdw_now_ideal_gap", domain: "household", user: "a", item: "who_does_what_6", weight: 2 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_07",
    description: "Single rule: both partners say they mostly decide about time with family and friends (who_does_what_19 now 3 each, mirrored 3 vs 7), each content with it, so only the disagreement rule fires.",
    overrides: {
      a: { who_does_what: (rs) => setItems(rs, [["who_does_what_19", 3, "now"], ["who_does_what_19", 3, "ideal"]]) },
      b: { who_does_what: (rs) => setItems(rs, [["who_does_what_19", 3, "now"], ["who_does_what_19", 3, "ideal"]]) },
    },
    expected: {
      distress_context: false,
      domains: { social_family_longterm: 2 },
      flags: [{ rule_key: "wdw_now_disagreement", domain: "social_family_longterm", user: "both", item: "who_does_what_19", weight: 2 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_08",
    description: "Single rule: partner B reports frequent disagreement on RDAS consensus item 3 (value 1).",
    overrides: { b: { rdas: (rs) => setItem(rs, "rdas_3", 1) } },
    expected: {
      distress_context: false,
      domains: { communication: 2 },
      flags: [{ rule_key: "rdas_consensus_disagree", domain: "communication", user: "b", item: "rdas_3", weight: 2 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_09",
    description: "Single rule: partner A reports exposing the child to conflict (brief_crs_5/6 = 5 and 4, mean 4.5 above the midpoint).",
    overrides: { a: { brief_crs: (rs) => setItems(rs, [["brief_crs_5", 5], ["brief_crs_6", 4]]) } },
    expected: {
      distress_context: false,
      domains: { parenting: 3 },
      flags: [{ rule_key: "brief_crs_negative_coparenting", domain: "parenting", user: "a", weight: 3 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_10",
    description: "Single rule: partner A is markedly more authoritarian (all authoritarian items 4 vs B's 2, gap 2.0), a between-parent values conflict.",
    overrides: {
      a: { psdq_sf: (rs) => setItems(rs, all(AUTHORITARIAN, 4)) },
      b: { psdq_sf: (rs) => setItems(rs, all(AUTHORITARIAN, 2)) },
    },
    expected: {
      distress_context: false,
      domains: { parenting: 3 },
      flags: [{ rule_key: "psdq_between_parent_gap", domain: "parenting", user: "both", label: "values_conflict", weight: 3 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_11",
    description: "Single rule: on structure with a child (polarization_1, strict versus lenient) A becomes stricter with B (+3) while B becomes more lenient with A (-3): one polarization loop.",
    overrides: {
      a: { polarization: (rs) => setItems(rs, [["polarization_1", 2, "self_alone"], ["polarization_1", 5, "self_with_partner"]]) },
      b: { polarization: (rs) => setItems(rs, [["polarization_1", 6, "self_alone"], ["polarization_1", 3, "self_with_partner"]]) },
    },
    expected: {
      distress_context: false,
      domains: { parenting: 2 },
      flags: [{ rule_key: "polarization_loop", domain: "parenting", user: "both", item: "polarization_1", label: "shared_pattern", weight: 2 }],
      polarization_loops: ["polarization_1"],
    },
  },
  {
    id: "couple_12",
    description: "A couple without children (no brief_crs or psdq_sf): partner A finds an affection behavior (fapbi_3) unacceptable at its current frequency.",
    overrides: { hasChildren: false, a: { fapbi: (rs) => setItems(rs, [["fapbi_3", 0, "frequency"], ["fapbi_3", 2, "acceptability"]]) } },
    expected: {
      distress_context: false,
      domains: { intimacy: 2 },
      flags: [{ rule_key: "fapbi_unacceptable", domain: "intimacy", user: "a", item: "fapbi_3", weight: 2 }],
      polarization_loops: [],
    },
  },
  {
    id: "couple_13",
    description: "Distress context from depression: partner A's PHQ-9 total is 12 (moderate) and B's optional OCI-R is elevated; the relationship instruments are all benign.",
    overrides: { include: ["oci_r"], a: { phq9: symptomTotal("phq9", 12) }, b: { oci_r: constantResponses("oci_r", 2) } },
    expected: { distress_context: true, domains: {}, flags: [], polarization_loops: [] },
  },
  {
    id: "couple_14",
    description: "Distress context from anxiety: partner B's GAD-7 total is exactly 10 while A's PHQ-9 sits at 9; nothing else is flagged.",
    overrides: { b: { gad7: symptomTotal("gad7", 10) }, a: { phq9: symptomTotal("phq9", 9) } },
    expected: { distress_context: true, domains: {}, flags: [], polarization_loops: [] },
  },
  {
    id: "couple_15",
    description: "Only context requests: seven items marked needs_context across all seven domains, one weight-1 context flag each and no other rule.",
    overrides: {
      a: {
        rdas: (rs) => setItem(rs, "rdas_2", { needs_context: true }),
        who_does_what: (rs) => setItem(rs, "who_does_what_21", { needs_context: true }, "now"),
        acq: (rs) => setItem(rs, "acq_22", { needs_context: true }, "self"),
      },
      b: {
        acq: (rs) => setItem(rs, "acq_1", { needs_context: true }, "self"),
        map: (rs) => setItem(rs, "map_2", { needs_context: true }, "efficacy"),
        polarization: (rs) => setItem(rs, "polarization_9", { needs_context: true }, "self_alone"),
        csi16: (rs) => setItem(rs, "csi16_3", { needs_context: true }),
      },
    },
    expected: {
      distress_context: false,
      domains: { parenting: 1, intimacy: 1, communication: 1, conflict: 1, household: 1, self_care: 1, social_family_longterm: 1 },
      flags: [
        { rule_key: "needs_context", domain: "intimacy", user: "a", item: "rdas_2", label: "context", weight: 1 },
        { rule_key: "needs_context", domain: "parenting", user: "a", item: "who_does_what_21", label: "context", weight: 1 },
        { rule_key: "needs_context", domain: "self_care", user: "a", item: "acq_22", label: "context", weight: 1 },
        { rule_key: "needs_context", domain: "household", user: "b", item: "acq_1", label: "context", weight: 1 },
        { rule_key: "needs_context", domain: "conflict", user: "b", item: "map_2", label: "context", weight: 1 },
        { rule_key: "needs_context", domain: "social_family_longterm", user: "b", item: "polarization_9", label: "context", weight: 1 },
        { rule_key: "needs_context", domain: "communication", user: "b", item: "csi16_3", label: "context", weight: 1 },
      ],
      polarization_loops: [],
    },
  },
  {
    id: "couple_16",
    description: "Polarization loops on three dimensions: order in the home (A +2 / B -2), initiating affection (A -3 / B +2) and caution versus risk (A +4 / B -4).",
    overrides: {
      a: {
        polarization: (rs) =>
          setItems(rs, [
            ["polarization_2", 3, "self_alone"], ["polarization_2", 5, "self_with_partner"],
            ["polarization_5", 6, "self_alone"], ["polarization_5", 3, "self_with_partner"],
            ["polarization_8", 1, "self_alone"], ["polarization_8", 5, "self_with_partner"],
          ]),
      },
      b: {
        polarization: (rs) =>
          setItems(rs, [
            ["polarization_2", 5, "self_alone"], ["polarization_2", 3, "self_with_partner"],
            ["polarization_5", 2, "self_alone"], ["polarization_5", 4, "self_with_partner"],
            ["polarization_8", 7, "self_alone"], ["polarization_8", 3, "self_with_partner"],
          ]),
      },
    },
    expected: {
      distress_context: false,
      domains: { household: 2, intimacy: 2, social_family_longterm: 2 },
      flags: [
        { rule_key: "polarization_loop", domain: "household", user: "both", item: "polarization_2", label: "shared_pattern", weight: 2 },
        { rule_key: "polarization_loop", domain: "intimacy", user: "both", item: "polarization_5", label: "shared_pattern", weight: 2 },
        { rule_key: "polarization_loop", domain: "social_family_longterm", user: "both", item: "polarization_8", label: "shared_pattern", weight: 2 },
      ],
      polarization_loops: ["polarization_2", "polarization_5", "polarization_8"],
    },
  },
  {
    id: "couple_17",
    description: "Heavy: every rule fires at once (two MAP areas, a desired change, a perceptual miss, an unacceptable behavior, a WDW gap and a WDW disagreement, an RDAS disagreement, undermining, a permissive gap, a communication loop and one context request) with A in depressive distress.",
    overrides: {
      include: ["oci_r", "prqc"],
      a: {
        phq9: symptomTotal("phq9", 12),
        map: (rs) => setItems(rs, [["map_1", 60, "intensity"], ["map_1", 40, "efficacy"]]),
        acq: (rs) => setItem(rs, "acq_11", 3, "self"),
        fapbi: (rs) => setItems(rs, [["fapbi_17", 8, "frequency"], ["fapbi_17", { value: 1, needs_context: true }, "acceptability"]]),
        who_does_what: (rs) =>
          setItems(rs, [["who_does_what_8", 1, "now"], ["who_does_what_8", 1, "ideal"], ["who_does_what_22", 2, "now"], ["who_does_what_22", 2, "ideal"]]),
        rdas: (rs) => setItem(rs, "rdas_4", 2),
        psdq_sf: (rs) => setItems(rs, all(PERMISSIVE, 5)),
        polarization: (rs) => setItems(rs, [["polarization_3", 1, "self_alone"], ["polarization_3", 4, "self_with_partner"]]),
      },
      b: {
        map: (rs) => setItems(rs, [["map_9", 55, "intensity"], ["map_9", 45, "efficacy"]]),
        acq: (rs) => setItems(rs, [["acq_11", 3, "partner_wants"], ["acq_20", 2, "partner_wants"]]),
        who_does_what: (rs) =>
          setItems(rs, [["who_does_what_8", 9, "now"], ["who_does_what_8", 5, "ideal"], ["who_does_what_22", 2, "now"], ["who_does_what_22", 2, "ideal"]]),
        brief_crs: (rs) => setItems(rs, [["brief_crs_9", 6], ["brief_crs_10", 5]]),
        polarization: (rs) => setItems(rs, [["polarization_3", 7, "self_alone"], ["polarization_3", 4, "self_with_partner"]]),
      },
    },
    expected: {
      distress_context: true,
      // parenting: acq_11 (2) + who_does_what_22 disagreement (2) + brief_crs (3) + psdq (3) = 10
      // conflict: map_9 (3) + fapbi_17 (2) + fapbi_17 context (1) = 6
      // household: map_1 (3) + who_does_what_8 gap (2) = 5
      domains: { parenting: 10, conflict: 6, household: 5, intimacy: 2, communication: 2, social_family_longterm: 2 },
      flags: [
        { rule_key: "map_high_intensity_low_efficacy", domain: "household", user: "a", item: "map_1", weight: 3 },
        { rule_key: "map_high_intensity_low_efficacy", domain: "conflict", user: "b", item: "map_9", weight: 3 },
        { rule_key: "acq_desired_change", domain: "parenting", user: "a", item: "acq_11", weight: 2 },
        { rule_key: "acq_perceptual_miss", domain: "social_family_longterm", user: "b", item: "acq_20", weight: 2 },
        { rule_key: "fapbi_unacceptable", domain: "conflict", user: "a", item: "fapbi_17", weight: 2 },
        { rule_key: "wdw_now_ideal_gap", domain: "household", user: "b", item: "who_does_what_8", weight: 2 },
        { rule_key: "wdw_now_disagreement", domain: "parenting", user: "both", item: "who_does_what_22", weight: 2 },
        { rule_key: "rdas_consensus_disagree", domain: "intimacy", user: "a", item: "rdas_4", weight: 2 },
        { rule_key: "brief_crs_negative_coparenting", domain: "parenting", user: "b", weight: 3 },
        { rule_key: "psdq_between_parent_gap", domain: "parenting", user: "both", label: "values_conflict", weight: 3 },
        { rule_key: "polarization_loop", domain: "communication", user: "both", item: "polarization_3", label: "shared_pattern", weight: 2 },
        { rule_key: "needs_context", domain: "conflict", user: "a", item: "fapbi_17", label: "context", weight: 1 },
      ],
      polarization_loops: ["polarization_3"],
    },
  },
  {
    id: "couple_18",
    description: "Perceptual misses in both directions: A thinks B wants much more say in financial decisions (acq_2, miss 3) and B thinks A wants less attention to personal appearance (acq_13, miss 2); neither partner actually wants change.",
    overrides: {
      a: { acq: (rs) => setItem(rs, "acq_2", 3, "partner_wants") },
      b: { acq: (rs) => setItem(rs, "acq_13", -2, "partner_wants") },
    },
    expected: {
      distress_context: false,
      domains: { household: 2, self_care: 2 },
      flags: [
        { rule_key: "acq_perceptual_miss", domain: "household", user: "a", item: "acq_2", weight: 2 },
        { rule_key: "acq_perceptual_miss", domain: "self_care", user: "b", item: "acq_13", weight: 2 },
      ],
      polarization_loops: [],
    },
  },
  {
    id: "couple_19",
    description: "Both partners flag cooking (who_does_what_2) from different sides: each says they do it all (now 1) and wants it shared (ideal 5), so both gaps fire and the mirrored 'now' ratings disagree by 8.",
    overrides: {
      a: { who_does_what: (rs) => setItems(rs, [["who_does_what_2", 1, "now"], ["who_does_what_2", 5, "ideal"]]) },
      b: { who_does_what: (rs) => setItems(rs, [["who_does_what_2", 1, "now"], ["who_does_what_2", 5, "ideal"]]) },
    },
    expected: {
      distress_context: false,
      domains: { household: 6 },
      flags: [
        { rule_key: "wdw_now_ideal_gap", domain: "household", user: "a", item: "who_does_what_2", weight: 2 },
        { rule_key: "wdw_now_ideal_gap", domain: "household", user: "b", item: "who_does_what_2", weight: 2 },
        { rule_key: "wdw_now_disagreement", domain: "household", user: "both", item: "who_does_what_2", weight: 2 },
      ],
      polarization_loops: [],
    },
  },
  {
    id: "couple_20",
    description: "Boundary couple: every rule sits one step below its threshold (MAP 49/50 and 50/51, desired change ±1, misses of 1, acceptability 5, WDW gap 2 and mirrored disagreement 2, consensus 3, undermining and exposure means of exactly 3, permissive gap 0.8, polarization gaps +3/-1, +2/+2 and +1/-1, PHQ-9 9 and GAD-7 9) and nothing fires.",
    overrides: {
      a: {
        phq9: symptomTotal("phq9", 9),
        map: (rs) => setItems(rs, [["map_1", 49, "intensity"], ["map_1", 50, "efficacy"]]),
        acq: (rs) => setItems(rs, [["acq_1", 1, "self"], ["acq_2", 0, "partner_wants"]]),
        fapbi: (rs) => setItems(rs, [["fapbi_1", 30, "frequency"], ["fapbi_1", 5, "acceptability"]]),
        who_does_what: (rs) => setItems(rs, [["who_does_what_1", 3, "now"], ["who_does_what_1", 5, "ideal"]]),
        brief_crs: (rs) => setItems(rs, [["brief_crs_9", 3], ["brief_crs_10", 3]]),
        psdq_sf: (rs) => setItems(rs, [["psdq_sf_4", 4], ["psdq_sf_8", 4], ["psdq_sf_15", 4], ["psdq_sf_20", 4], ["psdq_sf_24", 3]]),
        polarization: (rs) =>
          setItems(rs, [
            ["polarization_1", 2, "self_alone"], ["polarization_1", 5, "self_with_partner"],
            ["polarization_2", 3, "self_alone"], ["polarization_2", 5, "self_with_partner"],
            ["polarization_3", 4, "self_alone"], ["polarization_3", 5, "self_with_partner"],
          ]),
      },
      b: {
        gad7: symptomTotal("gad7", 9),
        map: (rs) => setItems(rs, [["map_2", 50, "intensity"], ["map_2", 51, "efficacy"]]),
        acq: (rs) => setItems(rs, [["acq_2", -1, "self"], ["acq_1", 0, "partner_wants"], ["acq_3", 1, "partner_wants"]]),
        who_does_what: (rs) =>
          setItems(rs, [["who_does_what_1", 7, "now"], ["who_does_what_1", 7, "ideal"], ["who_does_what_2", 3, "now"], ["who_does_what_2", 3, "ideal"]]),
        rdas: (rs) => setItem(rs, "rdas_1", 3),
        brief_crs: (rs) => setItems(rs, [["brief_crs_5", 4], ["brief_crs_6", 2]]),
        polarization: (rs) =>
          setItems(rs, [
            ["polarization_1", 4, "self_alone"], ["polarization_1", 3, "self_with_partner"],
            ["polarization_2", 3, "self_alone"], ["polarization_2", 5, "self_with_partner"],
            ["polarization_3", 4, "self_alone"], ["polarization_3", 3, "self_with_partner"],
          ]),
      },
    },
    expected: NONE,
  },
];

export function buildCouple(profile: Profile): SyntheticCouple {
  const input = completeCouple(profile.overrides);
  return { id: profile.id, description: profile.description, has_children: input.hasChildren, a: input.a, b: input.b, expected: profile.expected };
}

export function buildAll(): SyntheticCouple[] {
  return PROFILES.map(buildCouple);
}

function main() {
  mkdirSync(COUPLES_DIR, { recursive: true });
  let problems = 0;
  for (const couple of buildAll()) {
    const out = runStage1({ hasChildren: couple.has_children, a: couple.a, b: couple.b });
    const diffs = compareToExpected(couple, out);
    writeFileSync(path.join(COUPLES_DIR, `${couple.id}.json`), JSON.stringify(couple, null, 2) + "\n");
    if (diffs.length) {
      problems++;
      console.error(`${couple.id}: engine output disagrees with the hand-derived expectation:\n  ${diffs.join("\n  ")}`);
    } else {
      console.log(`${couple.id}: ok (${out.flags.length} flags, distress ${out.distress_context})`);
    }
  }
  console.log(`wrote ${PROFILES.length} couples to ${COUPLES_DIR}`);
  if (problems) {
    console.error(`${problems} couple(s) disagree with the engine; fixtures keep the hand-derived expectations.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("evals/synthetic_couples/build.ts")) main();
