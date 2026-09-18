import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { mentorReadiness } from "@/lib/biographer/inputs";
import { PANEL_VERSIONS, panelVersionsFor } from "@/lib/biographer/versions";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { LinkButton } from "@/app/_components/Button";
import { PanelForm } from "./PanelForm";

export const metadata = { title: "Ask all of me" };

const snippet = (t: string) => (t.length > 110 ? `${t.slice(0, 107).trimEnd()}…` : t);

export default async function PanelIndex() {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const [entries, panels, tallies] = await Promise.all([data.listOwnEntries(user.id, { status: "ratified" }), data.listPanels(user.id), data.versionRatings(user.id)]);
  const readiness = mentorReadiness(entries);
  const versions = panelVersionsFor(entries);
  const rated = PANEL_VERSIONS.filter((v) => tallies[v.key]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Prototype"
        title="Ask all of me"
        lede="You are a range, not a point. Put one situation to several versions of yourself, right now, and read their answers side by side. Each is you with one thing changed, and says what the change is."
      />

      <div role="note" className="rounded-control border border-warn bg-warn-bg px-4 py-3 text-sm">
        <p className="font-medium">These are avatars, not you.</p>
        <p className="mt-1">Each one is a test run built from the {entries.length} lines you have ratified and nothing else. They can be wrong, they never speak for you to anyone, and nobody else can see them. Every one of them is a version of you: this is for choosing your conditions and practising a move, not for disowning what the tired one said.</p>
      </div>

      {!readiness.ready ? (
        <Card dashed as="div">
          <p className="reading text-[17px]">
            There isn&rsquo;t enough of you on paper yet. This needs at least {readiness.needed} ratified constitution lines, including one under &ldquo;What I&rsquo;m working on&rdquo;. You have {readiness.ratifiedConstitution}
            {readiness.hasDirection ? "." : ", and none under that heading."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <LinkButton href="/biographer">Talk to the biographer</LinkButton>
            <LinkButton href="/documents" variant="secondary">
              Your documents
            </LinkButton>
          </div>
        </Card>
      ) : (
        <PanelForm versions={versions.length} />
      )}

      {rated.length > 0 ? (
        <Card eyebrow="Where you have drawn the edge of “me” so far">
          <ul className="divide-y divide-rule text-[15px]">
            {rated.map((v) => {
              const t = tallies[v.key];
              return (
                <li key={v.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
                  <span className="font-display text-[17px]">{v.label}</span>
                  <span className="text-muted">
                    me {t.like_me} · me on a bad day {t.bad_day} · not me {t.not_like_me}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-muted">Counted across all your panels. Your verdicts, nobody else&rsquo;s.</p>
        </Card>
      ) : null}

      {panels.length > 0 ? (
        <Card>
          <h2 className="text-[22px]">Earlier panels</h2>
          <ul className="mt-2 divide-y divide-rule">
            {panels.map((p) => (
              <li key={p.id} className="py-3 first:pt-1 last:pb-0">
                <Link href={`/mentor/panel/${p.id}`} className="reading text-[16px] underline decoration-rule underline-offset-4 hover:decoration-accent">
                  {snippet(p.situation)}
                </Link>
                <p className="text-xs text-muted">{p.created_at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-sm text-muted">
        Built from{" "}
        <Link href="/documents" className="underline">
          your documents
        </Link>
        . Lines you marked settled never vary. One of these versions, further along on what you are working on, is also there to{" "}
        <Link href="/mentor" className="underline">
          talk to on its own
        </Link>
        .
      </p>
    </div>
  );
}
