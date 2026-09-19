import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { PASTED_REGISTERS, REGISTER_TITLES, voiceStats } from "@/lib/biographer/voice";
import { requireAppUser } from "@/app/_lib/session";
import { Card, Chip } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { RemoveSample } from "./RemoveSample";
import { VoiceForm } from "./VoiceForm";

export const metadata = { title: "How you write" };

const snippet = (t: string) => (t.length > 160 ? `${t.slice(0, 157).trimEnd()}…` : t);

export default async function VoicePage() {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const [samples, answers, corrections] = await Promise.all([data.listVoiceSamples(user.id), data.listOwnAnswers(user.id), data.listCorrections(user.id, 50)]);
  // The argument register is counted apart: it is not how you usually write, and only one version of you ever sees it.
  const usual = [...answers, ...samples.filter((s) => s.register !== "heated").map((s) => s.text), ...corrections.map((c) => c.wouldSay)];
  const stats = voiceStats(usual);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Prototype"
        title="How you write"
        lede="Your avatars know what you think from the lines you ratified. This is where they learn how you sound. Paste things you wrote before you ever opened this app, and they pick up your sentence length, your punctuation and your pet words."
      />

      <div role="note" className="rounded-control border border-rule bg-surface px-4 py-3 text-sm text-muted">
        <p>
          <span className="font-medium text-ink">Manner, never matter.</span> Nothing in a sample is treated as a fact about you. What is true of you changes only in{" "}
          <Link href="/documents" className="underline">
            your documents
          </Link>
          . Samples are encrypted, private to you, used only by your own avatars, and gone for good when you remove them. Nobody is training a model on them.
        </p>
      </div>

      <VoiceForm />

      <Card eyebrow="What your avatars have to go on">
        <ul className="divide-y divide-rule text-[15px]">
          <li className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 first:pt-0">
            <span>{REGISTER_TITLES.considered}</span>
            <span className="text-muted">{answers.length === 0 ? "nothing yet" : `${answers.length} ${answers.length === 1 ? "answer" : "answers"}, collected as you go`}</span>
          </li>
          <li className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <span>Replies you put in your own words</span>
            <span className="text-muted">{corrections.length === 0 ? "none yet" : corrections.length}</span>
          </li>
          {PASTED_REGISTERS.map((r) => {
            const n = samples.filter((s) => s.register === r);
            return (
              <li key={r} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 last:pb-0">
                <span>{REGISTER_TITLES[r]}</span>
                <span className="text-muted">{n.length === 0 ? "none yet" : `${n.length} ${n.length === 1 ? "sample" : "samples"}, ${n.reduce((a, s) => a + s.words, 0)} words`}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {stats.sentences >= 8 ? (
        <Card eyebrow="What can be counted">
          <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
            {[
              ["Words in a typical sentence", stats.medianSentenceWords],
              ["Sentences that are questions", `${stats.questionsPer100} in 100`],
              ["Sentences ending in an exclamation mark", `${stats.exclamationsPer100} in 100`],
              ["Trailing dots (…)", `${stats.ellipsesPer100} per 100 sentences`],
              ["Messages that start without a capital", `${stats.lowercaseStarts} in 100`],
              ["Emoji", `${stats.emojiPer100Words} per 100 words`],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-baseline justify-between gap-3 border-b border-rule/60 pb-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-display text-[18px]">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">
            Counted by code from {stats.words.toLocaleString("en-GB")} of your words, leaving out anything from an argument. These are counts, not a description of you.
          </p>
        </Card>
      ) : null}

      {samples.length > 0 ? (
        <Card>
          <h2 className="text-[22px]">Your samples</h2>
          <ul className="mt-2 divide-y divide-rule">
            {samples.map((s) => (
              <li key={s.id} className="py-3 first:pt-1 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Chip tone={s.register === "heated" ? "quiet" : "accent"}>{REGISTER_TITLES[s.register]}</Chip>
                  <RemoveSample sampleId={s.id} />
                </div>
                <p className="reading mt-2 whitespace-pre-line text-[15px] text-muted">{snippet(s.text)}</p>
                <p className="mt-1 text-xs text-muted">{s.words} words</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-sm text-muted">
        The version of you that is one notch ahead is you at your best, so it never sees messages from an argument. Only the version of you that is running on empty does, in{" "}
        <Link href="/mentor/panel" className="underline">
          Ask all of me
        </Link>
        .
      </p>
    </div>
  );
}
