import Link from "next/link";
import * as data from "@/lib/data";
import { INSTRUMENTS, isInstrumentKey } from "@/instruments/registry";
import { DOMAIN_TITLES, topicEmphasis } from "@/lib/copy";
import { requirePartner } from "@/app/_lib/session";
import { parsePrivateResults } from "@/app/_lib/results";
import { Card, Chip, UnvalidatedLabel } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Waiting } from "@/app/_components/Waiting";
import { LinkButton } from "@/app/_components/Button";
import { ViewedButton } from "./ViewedButton";

export const metadata = { title: "Your results" };

function instrumentName(key: string): string {
  return isInstrumentKey(key) ? INSTRUMENTS[key].definition.name : key;
}

export default async function ResultsPage() {
  const user = await requirePartner();
  const run = await data.getLatestRun(user.couple.id);
  if (!run || run.status !== "complete") {
    return (
      <div className="space-y-6">
        <PageHeader title="Your results" />
        <Waiting title={run ? "Reading your answers." : "Your partner hasn't finished yet."}>
          {run ? "This usually takes a few minutes. " : null}
          <Link href="/waiting" className="underline">
            Where you both are
          </Link>
        </Waiting>
      </div>
    );
  }
  const [row, members] = await Promise.all([data.getPrivateResults(user.id, user.couple.id), data.listCoupleUsers(user.couple.id)]);
  const results = row ? parsePrivateResults(row.content) : null;
  if (!row || !results) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your results" />
        <Waiting title="Your results are being prepared.">Check again in a moment.</Waiting>
      </div>
    );
  }
  const partnerName = members.find((m) => m.id !== user.id)?.display_name ?? "your partner";
  const viewed = !!row.viewed_at;
  const flagged = [...results.flagged_domains].sort((x, y) => y.weight - x.weight);
  const nextHref = flagged.length > 0 ? "/color" : "/brief";
  const nextLabel = flagged.length > 0 ? "Go on to the questions in your own words" : "Go on to the brief";

  return (
    <div className="space-y-6">
      <PageHeader title="Your results, privately" lede={`Only you can see this page. ${partnerName} has their own. One plain sentence per questionnaire, with the published cutoff named where there is one.`} />

      <Card>
        <h2 className="text-[22px]">Worth talking about</h2>
        {flagged.length === 0 ? (
          <p className="reading mt-2 text-[17px]">Nothing came up. The brief will list what lines up, and there are no written questions to answer.</p>
        ) : (
          <>
            <p className="reading mt-1 text-[16px] text-muted">The same list, in the same order, for both of you.</p>
            <ol className="mt-3 divide-y divide-rule">
              {flagged.map((d, i) => {
                const e = topicEmphasis(i);
                return (
                  <li key={d.domain} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                    <span className="font-display text-[19px]">{DOMAIN_TITLES[d.domain]}</span>
                    <span className="flex items-center gap-2">
                      <Chip tone={e.tone}>{e.label}</Chip>
                      <span className="text-sm text-muted tabular-nums">
                        {d.flag_count} {d.flag_count === 1 ? "thing" : "things"} came up
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Card>

      <Card>
        <h2 className="text-[22px]">Your scores</h2>
        <ul className="mt-3 space-y-4">
          {results.sentences.map((s) => (
            <li key={s.instrument_key}>
              <p className="eyebrow">
                From the {instrumentName(s.instrument_key)}
                {isInstrumentKey(s.instrument_key) && INSTRUMENTS[s.instrument_key].definition.unvalidated ? <UnvalidatedLabel /> : null}
              </p>
              <p className="reading mt-0.5 text-[17px]">{s.sentence}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">{results.generated_label}</p>
      </Card>

      {results.distress_note ? (
        <Card eyebrow="A note on context">
          <p className="reading text-[17px]">{results.distress_note}</p>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-[22px]">Where you and {partnerName} see you differently</h2>
        {results.perception_gaps.length === 0 ? (
          <p className="reading mt-2 text-[17px]">No differences of two points or more.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {results.perception_gaps.map((g) => (
              <li key={`${g.instrument}:${g.item_ref}`}>
                <p className="eyebrow">
                  {DOMAIN_TITLES[g.domain]} · {instrumentName(g.instrument)}
                  {g.instrument === "polarization" || g.unvalidated ? <UnvalidatedLabel /> : null}
                </p>
                <p className="reading mt-0.5 text-[17px]">
                  {g.descriptor}: you said {g.self_value}, {partnerName} said {g.partner_value}.
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card dashed as="div">
        {viewed ? (
          <div className="flex flex-wrap gap-3">
            <LinkButton href={nextHref}>{nextLabel}</LinkButton>
            <LinkButton href="/results/profile" variant="secondary">
              My profile
            </LinkButton>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="reading text-[17px]">Take your time. The next step opens once you have read this page.</p>
            <ViewedButton />
          </div>
        )}
      </Card>
    </div>
  );
}
