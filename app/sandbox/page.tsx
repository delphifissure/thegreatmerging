import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { parseScenario, readSandbox } from "@/lib/sandbox/read";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { SandboxForm } from "./SandboxForm";

export const metadata = { title: "Sandbox" };

const snippet = (t: string) => (t.length > 120 ? `${t.slice(0, 117).trimEnd()}…` : t);

export default async function SandboxIndex({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const { from } = await searchParams;
  const [boxes, source] = await Promise.all([data.listSandboxes(user.id), from && /^[0-9a-f-]{36}$/i.test(from) ? readSandbox(from, user.id) : Promise.resolve(null)]);
  const listed = boxes.flatMap((b) => {
    const s = parseScenario(b.scenario);
    return s ? [{ id: b.id, created_at: b.created_at, s }] : [];
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Test bench"
        title="Sandbox"
        lede="Two made-up people, each with a life history of the kind a therapist would hold in their notes, and the history they share. Each avatar is given its own notes and the shared history, never the other's. Then you give them a situation and watch. Nobody here is real, so nothing is hidden from you."
      />
      <SandboxForm key={source?.threadId ?? "new"} initial={source?.scenario ?? null} />
      {listed.length > 0 ? (
        <Card>
          <h2 className="text-[22px]">Earlier sandboxes</h2>
          <ul className="mt-2 divide-y divide-rule">
            {listed.map(({ id, created_at, s }) => (
              <li key={id} className="py-3 first:pt-1 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link href={`/sandbox/${id}`} className="font-display text-[19px] underline decoration-rule underline-offset-4 hover:decoration-accent">
                    {s.a.name} and {s.b.name}
                  </Link>
                  <span className="text-sm text-muted">
                    {created_at.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} ·{" "}
                    <Link href={`/sandbox?from=${id}`} className="underline decoration-rule underline-offset-4 hover:text-ink">
                      new one from this
                    </Link>
                  </span>
                </div>
                <p className="reading mt-1 text-[15px] text-muted">{snippet(s.situation)}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
