/**
 * The SDK isolation rule: lib/llm.ts is the only module that imports the Anthropic SDK or
 * touches the client's message surface. Every other file under the source roots is scanned as
 * text. The forbidden strings are assembled from parts so this file never contains them.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const ROOTS = ["app", "lib", "instruments", "inngest", "config", "evals", "scripts", "db", "tests"];
const SKIP_DIRS = new Set(["node_modules", "node_modules.nosync", ".next"]);

const SDK_SPECIFIER = ["@anthropic-ai", "sdk"].join("/");
const CLIENT_MESSAGES = ["client", "messages"].join(".");
const CLIENT_BETA_MESSAGES = ["client", "beta", "messages"].join(".");
const ALLOWED = "lib/llm.ts";

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const sourceFiles = ROOTS.flatMap((r) => walk(path.join(REPO_ROOT, r))).map((f) => path.relative(REPO_ROOT, f));

function filesContaining(needle: string): string[] {
  return sourceFiles.filter((rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8").includes(needle));
}

describe("SDK isolation", () => {
  it("scans a meaningful number of source files", () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
    expect(sourceFiles).toContain(ALLOWED);
  });

  it(`only ${ALLOWED} imports the Anthropic SDK`, () => {
    const importers = filesContaining(SDK_SPECIFIER);
    expect(importers).toEqual([ALLOWED]);
    const llm = fs.readFileSync(path.join(REPO_ROOT, ALLOWED), "utf8");
    expect(llm).toMatch(new RegExp(`import\\s+\\w+\\s+from\\s+"${SDK_SPECIFIER.replace("/", "\\/")}"`));
  });

  it(`no file outside ${ALLOWED} references the client's message surface`, () => {
    const offenders = [...new Set([...filesContaining(CLIENT_MESSAGES), ...filesContaining(CLIENT_BETA_MESSAGES)])].filter((f) => f !== ALLOWED);
    expect(offenders).toEqual([]);
  });

  it("this test file does not itself contain the forbidden strings literally", () => {
    const self = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
    expect(self.includes(SDK_SPECIFIER)).toBe(false);
    expect(self.includes(CLIENT_BETA_MESSAGES)).toBe(false);
  });
});
