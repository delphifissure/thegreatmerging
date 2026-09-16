/**
 * Instrument registry. Definitions are imported statically from
 * config/instruments/*.json so they ship in every bundle (Vercel, Vitest, jobs)
 * and are validated once at module load. If any instrument named in
 * config/flag_rules.json fails to load, this module throws and the app does not start.
 */
import type { InstrumentModule } from "./define";
import * as mini_ipip from "./mini_ipip";
import * as ecr_r from "./ecr_r";
import * as phq9 from "./phq9";
import * as gad7 from "./gad7";
import * as sis_ses_sf from "./sis_ses_sf";
import * as sdi2 from "./sdi2";
import * as oci_r from "./oci_r";
import * as csi16 from "./csi16";
import * as rdas from "./rdas";
import * as cpq_sf from "./cpq_sf";
import * as acq from "./acq";
import * as fapbi from "./fapbi";
import * as who_does_what from "./who_does_what";
import * as brief_crs from "./brief_crs";
import * as map from "./map";
import * as psdq_sf from "./psdq_sf";
import * as prqc from "./prqc";
import * as polarization from "./polarization";
import flagRules from "@/config/flag_rules.json";

/** Presentation order (section 4 of the build prompt): Layer 0 then Layer 1, each in the listed order. */
export const LAYER0_ORDER = ["mini_ipip", "ecr_r", "phq9", "gad7", "sis_ses_sf", "sdi2", "oci_r"] as const;
export const LAYER1_ORDER = [
  "csi16",
  "rdas",
  "cpq_sf",
  "acq",
  "fapbi",
  "who_does_what",
  "brief_crs",
  "map",
  "psdq_sf",
  "prqc",
  "polarization",
] as const;

export type InstrumentKey = (typeof LAYER0_ORDER)[number] | (typeof LAYER1_ORDER)[number];
export const ALL_INSTRUMENT_KEYS: readonly InstrumentKey[] = [...LAYER0_ORDER, ...LAYER1_ORDER];

export const MENTAL_HEALTH_KEYS = ["phq9", "gad7", "oci_r"] as const;
export type MentalHealthKey = (typeof MENTAL_HEALTH_KEYS)[number];
export function isMentalHealthKey(key: string): key is MentalHealthKey {
  return (MENTAL_HEALTH_KEYS as readonly string[]).includes(key);
}

export const INSTRUMENTS: Record<InstrumentKey, InstrumentModule> = {
  mini_ipip,
  ecr_r,
  phq9,
  gad7,
  sis_ses_sf,
  sdi2,
  oci_r,
  csi16,
  rdas,
  cpq_sf,
  acq,
  fapbi,
  who_does_what,
  brief_crs,
  map,
  psdq_sf,
  prqc,
  polarization,
};

export function isInstrumentKey(key: string): key is InstrumentKey {
  return Object.prototype.hasOwnProperty.call(INSTRUMENTS, key);
}

export function getInstrument(key: string): InstrumentModule {
  if (!isInstrumentKey(key)) throw new Error(`unknown instrument ${key}`);
  return INSTRUMENTS[key];
}

/** Instruments a couple must complete before interpretation runs. */
export function requiredInstruments(opts: { hasChildren: boolean }): { layer0: InstrumentKey[]; layer1: InstrumentKey[] } {
  const r = flagRules.required_instruments;
  const layer1 = [...r.layer1, ...(opts.hasChildren ? r.layer1_when_children : [])] as InstrumentKey[];
  return { layer0: [...r.layer0] as InstrumentKey[], layer1 };
}

/** Startup assertion: every instrument named in flag_rules.json is loadable. Throws otherwise. */
export function assertRegistryHealthy(): void {
  const named = new Set<string>([
    ...flagRules.required_instruments.layer0,
    ...flagRules.required_instruments.layer1,
    ...flagRules.required_instruments.layer1_when_children,
    ...flagRules.required_instruments.optional,
    ...Object.values(flagRules.rules)
      .map((r) => (r as { instrument?: string }).instrument)
      .filter((k): k is string => typeof k === "string"),
  ]);
  for (const key of named) {
    if (!isInstrumentKey(key)) throw new Error(`flag_rules.json names instrument ${key} which is not registered`);
    const mod = INSTRUMENTS[key];
    if (!mod.definition.license_note.trim()) throw new Error(`instrument ${key} has an empty license_note`);
    if (mod.definition.items.length === 0) throw new Error(`instrument ${key} has no items`);
  }
}

assertRegistryHealthy();
