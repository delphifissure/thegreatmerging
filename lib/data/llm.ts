/**
 * Database-backed LLM call recorder and memo store (cost controls 5 and 7), plus the
 * per-couple cost query for the dashboard.
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { Role } from "@/config/llm";
import { costOfRecord, type LlmCallRecord, type LlmMemo, type LlmRecorder } from "@/lib/llm";

export class DbRecorder implements LlmRecorder {
  async record(rec: LlmCallRecord): Promise<void> {
    await db().insert(schema.llm_calls).values({
      couple_id: rec.couple_id,
      user_id: rec.user_id,
      role: rec.role,
      model: rec.model,
      prompt_version: rec.prompt_version,
      input_hash: rec.input_hash,
      job_step: rec.job_step,
      batch_id: rec.batch_id,
      cache_read_tokens: rec.cache_read_tokens,
      cache_creation_tokens: rec.cache_creation_tokens,
      tokens_in: rec.tokens_in,
      tokens_out: rec.tokens_out,
      attempt: rec.attempt,
      outcome: rec.outcome,
    });
  }
}

export class DbMemo implements LlmMemo {
  async get(role: Role, promptVersion: string, inputHash: string) {
    const rows = await db()
      .select({ output: schema.llm_memo.output })
      .from(schema.llm_memo)
      .where(sql`${schema.llm_memo.role} = ${role} and ${schema.llm_memo.prompt_version} = ${promptVersion} and ${schema.llm_memo.input_hash} = ${inputHash}`)
      .limit(1);
    return rows[0]?.output;
  }
  async put(role: Role, promptVersion: string, inputHash: string, output: unknown) {
    await db()
      .insert(schema.llm_memo)
      .values({ role, prompt_version: promptVersion, input_hash: inputHash, output })
      .onConflictDoNothing();
  }
}

export type CostReportRow = { role: string; model: string; calls: number; tokens_in: number; tokens_out: number; cache_read_tokens: number; cache_creation_tokens: number; usd: number };

/** Dashboard query: totals per role and model for one couple run, with USD from config/llm.ts prices. */
export async function costReportForCouple(coupleId: string): Promise<{ rows: CostReportRow[]; total_usd: number; total_calls: number }> {
  const rows = await db().select().from(schema.llm_calls).where(eq(schema.llm_calls.couple_id, coupleId));
  const byKey = new Map<string, CostReportRow>();
  for (const r of rows) {
    const key = `${r.role}:${r.model}`;
    const cur = byKey.get(key) ?? { role: r.role, model: r.model, calls: 0, tokens_in: 0, tokens_out: 0, cache_read_tokens: 0, cache_creation_tokens: 0, usd: 0 };
    cur.calls += 1;
    cur.tokens_in += r.tokens_in;
    cur.tokens_out += r.tokens_out;
    cur.cache_read_tokens += r.cache_read_tokens;
    cur.cache_creation_tokens += r.cache_creation_tokens;
    cur.usd += costOfRecord({ model: r.model, tokens_in: r.tokens_in, tokens_out: r.tokens_out, cache_read_tokens: r.cache_read_tokens, cache_creation_tokens: r.cache_creation_tokens });
    byKey.set(key, cur);
  }
  const out = [...byKey.values()].sort((x, y) => y.usd - x.usd);
  return { rows: out, total_usd: out.reduce((s, r) => s + r.usd, 0), total_calls: rows.length };
}
