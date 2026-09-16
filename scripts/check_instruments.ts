/**
 * Owner checklist for config/instruments/*.json: which instruments still carry TODO item text,
 * which scoring keys are unverified, and any file that fails to load. Exit code 1 if any file
 * fails to load; TODO text and unverified keys are reported, not fatal.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDefinition, InstrumentConfigError } from "@/instruments/define";
import { TODO_TEXT } from "@/instruments/schema";

const dir = path.join("config", "instruments");
let failed = 0;
for (const file of fs.readdirSync(dir).sort()) {
  if (!file.endsWith(".json")) continue;
  try {
    const def = parseDefinition(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
    const todo = def.items.filter((i) => i.text === TODO_TEXT).length;
    const flags = [
      todo ? `${todo}/${def.items.length} items still TODO` : "text populated",
      def.scoring_key_verified ? "key verified" : "KEY UNVERIFIED",
      def.unvalidated ? "unvalidated instrument" : "",
    ]
      .filter(Boolean)
      .join("; ");
    console.log(`${def.key.padEnd(14)} ${flags}`);
  } catch (err) {
    failed++;
    console.error(`${file}: ${err instanceof InstrumentConfigError ? err.message : String(err)}`);
  }
}
process.exit(failed ? 1 : 0);
