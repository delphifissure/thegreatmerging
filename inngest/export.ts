/**
 * Export job (section 2, 7): Markdown generated server-side; PDF rendered from the same HTML
 * with Playwright's Chromium; stored in Supabase Storage; served through short-lived signed URLs.
 */
import { createClient } from "@supabase/supabase-js";
import { serverRealtimeOptions } from "@/lib/supabase/server_realtime";
import { BriefDomainSchema } from "@/lib/llm/schemas";
import { briefMarkdown, markdownToHtml, planMarkdown, profileMarkdown } from "@/lib/export/markdown";
import type { PlanItem, ParentingLines } from "@/lib/data/brief_plan";
import type { ProfileContent } from "@/lib/profile/build";
import * as data from "@/lib/data";
import { inngest } from "./client";

export const EXPORT_BUCKET = "exports";

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not set");
  return createClient(url, key, { auth: { persistSession: false }, realtime: serverRealtimeOptions }).storage.from(EXPORT_BUCKET);
}

export async function renderPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" }, printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function buildExportMarkdown(input: { coupleId: string | null; userId: string; kind: "brief" | "plan" | "profile" }): Promise<{ markdown: string; title: string }> {
  if (input.kind === "profile") {
    const user = await data.getUser(input.userId);
    const profile = await data.getProfile(input.userId);
    if (!profile?.content) throw new Error("no profile yet");
    return { markdown: profileMarkdown({ displayName: user?.display_name ?? "You", profile: profile.content as ProfileContent }), title: "Individual profile" };
  }
  if (!input.coupleId) throw new Error("couple required");
  const users = await data.listCoupleUsers(input.coupleId);
  const coupleLabel = users.map((u) => u.display_name).join(" and ");
  if (input.kind === "plan") {
    const plan = await data.getLatestPlan(input.coupleId);
    if (!plan) throw new Error("no plan yet");
    return { markdown: planMarkdown({ coupleLabel, version: plan.version, items: plan.items as PlanItem[], parentingLines: (plan.parenting_lines as ParentingLines | null) ?? null }), title: "The Plan" };
  }
  const briefs = (await data.getBriefs(input.coupleId)).map((b) => BriefDomainSchema.parse(b.content));
  return { markdown: briefMarkdown({ coupleLabel, briefs }), title: "Brief" };
}

export const exportDocument = inngest.createFunction(
  { id: "export-document", name: "Export a brief, plan or profile", triggers: [{ event: "export/requested" }] },
  async ({ event, step }) => {
    const { coupleId, userId, kind, format } = event.data as { coupleId: string | null; userId: string; kind: "brief" | "plan" | "profile"; format: "md" | "pdf" };

    const built = await step.run("render", async () => {
      const { markdown, title } = await buildExportMarkdown({ coupleId, userId, kind });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const base = `${coupleId ?? userId}/${kind}-${stamp}`;
      const bucket = storage();
      if (format === "md") {
        const path = `${base}.md`;
        const { error } = await bucket.upload(path, Buffer.from(markdown, "utf8"), { contentType: "text/markdown", upsert: true });
        if (error) throw error;
        return { path };
      }
      const pdf = await renderPdf(markdownToHtml(markdown, title));
      const path = `${base}.pdf`;
      const { error } = await bucket.upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      return { path };
    });

    await step.run("record", async () => {
      await data.recordExport({ coupleId, userId: kind === "profile" ? userId : null, kind, format, storagePath: built.path, createdBy: userId });
      return { ok: true };
    });
    return built;
  },
);

/** Short-lived signed URL for a stored export (15 minutes). */
export async function signedExportUrl(path: string): Promise<string> {
  const { data: signed, error } = await storage().createSignedUrl(path, 15 * 60);
  if (error || !signed) throw error ?? new Error("could not sign URL");
  return signed.signedUrl;
}
