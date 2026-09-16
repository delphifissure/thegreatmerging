/**
 * Verify every model identifier in config/llm.ts against the Models API before a version bump.
 * This is the one script outside lib/llm.ts allowed to touch the SDK, and it does so only through
 * lib/llm's configured client accessor; it never sends a message.
 */
import "dotenv/config";
import { LLM_CONFIG, MODEL_CAPABILITIES } from "@/config/llm";
import { listModelIds } from "@/lib/llm/models";

async function main() {
  const ids = new Set<string>();
  for (const cfg of Object.values(LLM_CONFIG)) {
    ids.add(cfg.model);
    if (cfg.fallback_model) ids.add(cfg.fallback_model);
  }
  const available = await listModelIds();
  let bad = 0;
  for (const id of ids) {
    const ok = available.includes(id);
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "MISS"} ${id}  (${MODEL_CAPABILITIES[id as keyof typeof MODEL_CAPABILITIES] ? "capabilities configured" : "no capabilities entry"})`);
  }
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
