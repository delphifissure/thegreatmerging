/**
 * Static conventions for the PHI access layer (lib/data):
 *   - every exported async function whose name marks a cross-user read (Partner, ForJob, ForBrief,
 *     ForViewer, resolveTherapistShare, recordExport) writes an audit row in its body;
 *   - lib/data/index.ts re-exports every module file;
 *   - request handlers and jobs (app/, inngest/) never import db/client or db/schema directly,
 *     except inngest/reminders.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "lib", "data");
const CROSS_USER = /(Partner|ForJob|ForBrief|ForViewer|resolveTherapistShare|recordExport)/;
const SKIP_DIRS = new Set(["node_modules", "node_modules.nosync", ".next"]);

const dataFiles = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".ts"))
  .sort();

type Fn = { file: string; name: string; body: string };

/** Every `export async function NAME` with its body up to the next top-level `export `. */
function exportedAsyncFunctions(file: string): Fn[] {
  const src = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  const out: Fn[] = [];
  const re = /export async function (\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index;
    const next = src.indexOf("\nexport ", start + 1);
    out.push({ file, name: m[1], body: src.slice(start, next === -1 ? src.length : next) });
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

describe("lib/data audit convention", () => {
  const fns = dataFiles.filter((f) => f !== "index.ts").flatMap(exportedAsyncFunctions);
  const crossUser = fns.filter((f) => CROSS_USER.test(f.name));

  it("finds the cross-user readers", () => {
    const names = crossUser.map((f) => f.name);
    for (const expected of ["getPartnerScoresForViewer", "getScoresForJob", "listAllResponsesForJob", "listDomainMaterialForBrief", "resolveTherapistShare", "recordExport"]) {
      expect(names).toContain(expected);
    }
  });

  it("every cross-user reader writes an audit row (audit( or auditedCrossUserRead( in its body)", () => {
    const offenders = crossUser.filter((f) => !f.body.includes("audit(") && !f.body.includes("auditedCrossUserRead(")).map((f) => `${f.file}:${f.name}`);
    expect(offenders, `cross-user functions without an audit call: ${offenders.join(", ")}`).toEqual([]);
  });

  it("lib/data/index.ts re-exports every module file", () => {
    const index = fs.readFileSync(path.join(DATA_DIR, "index.ts"), "utf8");
    const modules = dataFiles.filter((f) => f !== "index.ts").map((f) => f.replace(/\.ts$/, ""));
    expect(modules.length).toBeGreaterThanOrEqual(8);
    const missing = modules.filter((m) => !index.includes(`export * from "./${m}"`));
    expect(missing, `modules not re-exported from lib/data/index.ts: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("db access is confined to lib/data", () => {
  it("no file under app/ or inngest/ imports @/db/client or @/db/schema, except inngest/reminders.ts", () => {
    const files = [...walk(path.join(REPO_ROOT, "app")), ...walk(path.join(REPO_ROOT, "inngest"))];
    expect(files.length).toBeGreaterThan(0);
    const importRe = /from\s+["'](?:@\/|(?:\.\.\/)+)db\/(?:client|schema)["']/;
    const offenders = files
      .filter((f) => importRe.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(REPO_ROOT, f))
      .filter((rel) => rel !== "inngest/reminders.ts");
    expect(offenders, `files importing db/client or db/schema directly: ${offenders.join(", ")}`).toEqual([]);
  });
});
