/**
 * Prompt file loader. Prompt files under prompts/ are static system content and are the
 * cached prefix of every call (cost control 1). They never contain instrument item text.
 */
import fs from "node:fs";
import path from "node:path";
import { LLM_CONFIG, type Role } from "@/config/llm";

const cache = new Map<string, string>();

export function promptsDir(): string {
  return path.join(process.cwd(), "prompts");
}

export function loadPromptFile(file: string): string {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;
  const full = path.join(promptsDir(), file);
  const text = fs.readFileSync(full, "utf8");
  if (!text.trim()) throw new Error(`prompt file ${file} is empty`);
  cache.set(file, text);
  return text;
}

export function loadRolePrompt(role: Role): { text: string; version: string } {
  const cfg = LLM_CONFIG[role];
  return { text: loadPromptFile(cfg.prompt_file), version: cfg.prompt_version };
}

export function clearPromptCache(): void {
  cache.clear();
}
