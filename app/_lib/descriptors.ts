/** item_ref → short neutral descriptor, for instrument items and color-module tag questions. */
import { INSTRUMENTS } from "@/instruments/registry";
import { allColorModules } from "@/lib/color/config";

export function descriptorMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mod of Object.values(INSTRUMENTS)) for (const it of mod.definition.items) out[it.item_id] = it.descriptor;
  for (const cfg of allColorModules()) for (const t of cfg.tags) out[t.id] = t.topics.join("; ");
  return out;
}
