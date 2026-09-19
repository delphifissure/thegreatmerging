/**
 * The solo panel: one situation put to several versions of the same person. Each version is the
 * person's ratified lines plus one small, named change (config/versions.json). Pure builders:
 * which versions can be built for someone, what each one sees, and what the reader sees.
 */
import type { z } from "zod";
import versionsConfig from "@/config/versions.json";
import { PanelReadingSchema, type PanelReading } from "@/lib/llm/schemas";
import type { DocumentEntry, Turn, TurnRating } from "@/lib/data/biographer";
import { EMPTY_VOICE } from "@/lib/biographer/voice";

export type VersionKind = "none" | "state" | "move" | "room" | "open_line" | "direction";
type Requires = { section?: string; mark?: "settled" | "open"; mentions?: string };
export type VersionDef = { key: string; kind: VersionKind; label: string; change: string; instruction: string; replicate_of?: string; requires?: Requires };

export const PANEL_VERSIONS = versionsConfig.versions as VersionDef[];
export const versionByKey = (key: unknown) => PANEL_VERSIONS.find((v) => v.key === key) ?? null;

/** A version as it applies to one person: the change in words they can read, and the line it alters, if any. */
export type PanelVersion = VersionDef & { changeText: string; alteredEntryId: string | null };

const ratifiedOf = (entries: DocumentEntry[]) => entries.filter((e) => e.status === "ratified");

/**
 * The versions that can be built from this person's lines, in display order. A version that
 * alters a line only ever touches one the person marked open: settled lines never vary.
 */
export function panelVersionsFor(entries: DocumentEntry[]): PanelVersion[] {
  const ratified = ratifiedOf(entries);
  const out: PanelVersion[] = [];
  for (const v of PANEL_VERSIONS) {
    const r = v.requires;
    let altered: DocumentEntry | null = null;
    if (r?.section) {
      const match = ratified.find((e) => e.document === "constitution" && e.section === r.section && (!r.mark || e.mark === r.mark));
      if (!match) continue;
      if (v.kind === "open_line") altered = match;
    }
    if (r?.mentions && !ratified.some((e) => new RegExp(r.mentions!, "i").test(e.text))) continue;
    if (v.kind === "open_line" && (!altered || altered.mark !== "open")) continue;
    out.push({ ...v, changeText: v.change.replace("{line}", altered?.text ?? ""), alteredEntryId: altered?.id ?? null });
  }
  return out;
}

/** Ratified lines with short ids the reply can cite, the situation, and the one change. */
export function buildVersionInput(input: { personName: string; entries: DocumentEntry[]; situation: string; version: PanelVersion; replicate?: number; voice?: typeof EMPTY_VOICE }) {
  const ratified = ratifiedOf(input.entries);
  const toEntry = new Map<string, string>();
  const toShort = new Map<string, string>();
  const all = ratified.map((e, i) => {
    const id = `e${i + 1}`;
    toEntry.set(id, e.id);
    toShort.set(e.id, id);
    return { id, section: e.section, text: e.text, mark: e.mark };
  });
  return {
    input: {
      person_name: input.personName,
      constitution: all.filter((_, i) => ratified[i].document === "constitution"),
      history: all.filter((_, i) => ratified[i].document === "history"),
      situation: input.situation,
      version: { key: input.version.key, kind: input.version.kind, instruction: input.version.instruction, altered_line_id: input.version.alteredEntryId ? (toShort.get(input.version.alteredEntryId) ?? null) : null },
      // How they write, for manner only. Each version is handed the registers that suit it (registersFor).
      voice: input.voice ?? EMPTY_VOICE,
      // Two runs of the same version must not collapse into one memoized answer.
      replicate: input.replicate ?? 1,
    },
    entryIdOf: (shortId: string) => toEntry.get(shortId) ?? null,
  };
}

const RATING_WORDS: Record<TurnRating, string> = { like_me: "me", bad_day: "me_on_a_bad_day", not_like_me: "not_me" };

/** What the reader sees: every version's answer, its one change, and the person's own verdict on it. */
export function buildPanelReaderInput(input: { personName: string; situation: string; turns: Turn[] }) {
  const versions = input.turns.flatMap((t) => {
    const def = t.role === "avatar" ? versionByKey(t.meta.version) : null;
    if (!def || t.meta.fallback === true) return [];
    return [
      {
        key: def.key,
        label: def.label,
        kind: def.kind,
        change: t.extras?.change ?? def.change,
        replicate_of: def.replicate_of ?? null,
        reply: t.text,
        opening_line: t.extras?.opening_line ?? null,
        unsure: t.meta.unsure === true,
        rating: t.rating ? RATING_WORDS[t.rating] : null,
      },
    ];
  });
  return { person_name: input.personName, situation: input.situation, versions };
}

/** The reader may only point at versions that are on the panel, and never at the noise pair as a difference. */
export function panelReadingSchemaFor(keys: string[]): z.ZodType<PanelReading> {
  const known = new Set(keys);
  return PanelReadingSchema.superRefine((r, ctx) => {
    r.differs.forEach((d, i) => {
      const unknown = d.versions.filter((k) => !known.has(k));
      if (unknown.length) ctx.addIssue({ code: "custom", path: ["differs", i, "versions"], message: `unknown version key(s): ${unknown.join(", ")}. Use only: ${keys.join(", ")}` });
      const pair = d.versions.filter((k) => !!versionByKey(k)?.replicate_of || PANEL_VERSIONS.some((v) => v.replicate_of === k));
      if (d.versions.length === 2 && pair.length === 2) ctx.addIssue({ code: "custom", path: ["differs", i], message: "the two runs of the same version differ only by chance; do not report that as a difference" });
    });
  });
}

/** How many versions the person must have rated before the app reads across them. */
export const RATINGS_BEFORE_READING = 3;

export const VERSION_FALLBACK = "This version did not come through. Ask again and it will be rebuilt from your lines.";
