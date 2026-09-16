/**
 * Static per-role context appended to the system prompt and covered by the prompt-cache
 * breakpoint (cost control 1). It is derived from configuration only, rendered with sorted
 * keys, and therefore byte-identical across calls until the instrument configs change.
 *
 * Prompts carry item IDs and short descriptors, never instrument item text (cost control 3).
 */
import type { Role } from "@/config/llm";
import { INSTRUMENTS } from "@/instruments/registry";
import { stableStringify } from "@/lib/hash";

let descriptorBlock: string | undefined;

/** "item_id: descriptor" for every item of every instrument, plus the unvalidated list. */
export function descriptorContext(): string {
  if (descriptorBlock) return descriptorBlock;
  const descriptors: Record<string, string> = {};
  const unvalidated: string[] = [];
  for (const mod of Object.values(INSTRUMENTS)) {
    const def = mod.definition;
    if (def.unvalidated) unvalidated.push(def.key);
    for (const it of def.items) descriptors[it.item_id] = it.descriptor;
  }
  descriptorBlock = [
    "## Reference: item descriptors",
    "",
    "Every item ID used in the input maps to a short neutral descriptor below. Use the descriptor, never an item ID, when naming an item to a person.",
    "",
    stableStringify({ descriptors, unvalidated_instruments: unvalidated.sort() }),
  ].join("\n");
  return descriptorBlock;
}

/** Static context for a role, or null when the role has none. */
export function staticContextFor(role: Role): string | null {
  switch (role) {
    case "interpreter":
    case "prober":
    case "summarizer":
      return descriptorContext();
    default:
      return null;
  }
}
