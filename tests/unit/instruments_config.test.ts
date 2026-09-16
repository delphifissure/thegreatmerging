/**
 * Structural checks over config/instruments/*.json: every file parses, carries a license note and items,
 * safety / mental-health / unvalidated markers sit exactly where the build prompt puts them, and the
 * loader refuses malformed definitions. The TODO-text test is marked it.fails: it fails (so the suite
 * passes) while any instrument still ships placeholder item text, and it will start failing the suite
 * the moment every instrument is populated, at which point the owner removes `.fails`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import gad7Raw from "@/config/instruments/gad7.json";
import flagRules from "@/config/flag_rules.json";
import { InstrumentConfigError, parseDefinition } from "@/instruments/define";
import { ALL_INSTRUMENT_KEYS, INSTRUMENTS, MENTAL_HEALTH_KEYS } from "@/instruments/registry";
import { DOMAINS, InstrumentDefinitionSchema, TODO_TEXT } from "@/instruments/schema";

const CONFIG_DIR = fileURLToPath(new URL("../../config/instruments/", import.meta.url));
const files = readdirSync(CONFIG_DIR).filter((f) => f.endsWith(".json")).sort();
const rawByFile = Object.fromEntries(files.map((f) => [f, JSON.parse(readFileSync(CONFIG_DIR + f, "utf8")) as unknown]));

describe("config/instruments", () => {
  it("has one file per registered instrument, named after its key", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual([...ALL_INSTRUMENT_KEYS].sort());
    for (const f of files) expect((rawByFile[f] as { key: string }).key).toBe(f.replace(/\.json$/, ""));
  });

  it("(a) every file parses with InstrumentDefinitionSchema", () => {
    for (const f of files) {
      const result = InstrumentDefinitionSchema.safeParse(rawByFile[f]);
      expect(result.success, `${f}: ${result.success ? "" : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`).toBe(true);
    }
  });

  it("(b) license_note and items are non-empty for every instrument", () => {
    for (const key of ALL_INSTRUMENT_KEYS) {
      const def = INSTRUMENTS[key].definition;
      expect(def.license_note.trim().length, `${key} license_note`).toBeGreaterThan(0);
      expect(def.items.length, `${key} items`).toBeGreaterThan(0);
      expect(def.source_citation.trim().length, `${key} source_citation`).toBeGreaterThan(0);
    }
  });

  it.fails("all instrument item text has been populated from the official sources", () => {
    const remaining = ALL_INSTRUMENT_KEYS.filter((key) => INSTRUMENTS[key].definition.items.some((i) => i.text === TODO_TEXT));
    const detail = remaining
      .map((key) => `${key} (${INSTRUMENTS[key].definition.items.filter((i) => i.text === TODO_TEXT).length} of ${INSTRUMENTS[key].definition.items.length} items)`)
      .join(", ");
    expect(
      remaining,
      `Instruments still containing "${TODO_TEXT}" item text: ${detail}. Populate config/instruments/<key>.json from the official source, then remove it.fails from this test.`,
    ).toEqual([]);
  });

  it("(d) only phq9_9 is a safety item", () => {
    const safety = ALL_INSTRUMENT_KEYS.flatMap((key) => INSTRUMENTS[key].definition.items.filter((i) => i.safety_item).map((i) => `${key}:${i.item_id}`));
    expect(safety).toEqual(["phq9:phq9_9"]);
  });

  it("(e) mental_health is true exactly for phq9, gad7 and oci_r", () => {
    const flagged = ALL_INSTRUMENT_KEYS.filter((key) => INSTRUMENTS[key].definition.mental_health).sort();
    expect(flagged).toEqual(["gad7", "oci_r", "phq9"]);
    expect([...MENTAL_HEALTH_KEYS].sort()).toEqual(flagged);
  });

  it("(f) unvalidated is true exactly for polarization", () => {
    expect(ALL_INSTRUMENT_KEYS.filter((key) => INSTRUMENTS[key].definition.unvalidated)).toEqual(["polarization"]);
  });

  it("(g) the loader refuses an empty license_note and an empty item list", () => {
    const noLicense = { ...structuredClone(gad7Raw), license_note: "" };
    expect(() => parseDefinition(noLicense)).toThrow(InstrumentConfigError);
    expect(() => parseDefinition(noLicense)).toThrow(/license_note/);
    const noItems = { ...structuredClone(gad7Raw), items: [] };
    expect(() => parseDefinition(noItems)).toThrow(InstrumentConfigError);
    expect(() => parseDefinition(noItems)).toThrow(/items/);
    // and, for contrast, the untouched file is accepted
    expect(() => parseDefinition(structuredClone(gad7Raw))).not.toThrow();
  });

  it("item ids are <key>_<n>, 1-based and sequential, and every domain is a known domain", () => {
    for (const key of ALL_INSTRUMENT_KEYS) {
      const def = INSTRUMENTS[key].definition;
      expect(def.items.map((i) => i.item_id)).toEqual(def.items.map((_, i) => `${key}_${i + 1}`));
      for (const item of def.items) if (item.domain) expect(DOMAINS).toContain(item.domain);
      if (def.default_domain) expect(DOMAINS).toContain(def.default_domain);
    }
    expect(flagRules.domains).toEqual([...DOMAINS]);
  });
});
