import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/brand";
import { GENERATED_NOTE } from "@/lib/copy";
import { requireAppUser } from "@/app/_lib/session";
import { FEATURES } from "@/config/features";
import { buildJourney, type Step } from "@/app/_lib/journey";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { LinkButton } from "@/app/_components/Button";

function Dot({ state, n }: { state: Step["state"]; n: number }) {
  const cls =
    state === "done"
      ? "border-good bg-good text-accent-ink"
      : state === "now"
        ? "border-accent text-accent"
        : state === "skipped"
          ? "border-rule text-muted line-through"
          : "border-rule text-muted";
  return (
    <span aria-hidden="true" className={`grid h-6 w-6 place-items-center rounded-full border font-sans text-xs font-semibold ${cls}`}>
      {state === "done" ? "✓" : n}
    </span>
  );
}

const STATE_WORD: Record<Step["state"], string> = { done: "done", now: "current step", locked: "not yet", skipped: "skipped" };

async function Home() {
  const user = await requireAppUser();
  const journey = await buildJourney(user);
  const first = user.displayName.split(" ")[0];
  return (
    <div className="space-y-6">
      <PageHeader
        title={journey.next ? `Where you are, ${first}` : `All done, ${first}`}
        lede="Each of you answers alone. Nothing is compared until you have both finished, and you read your own results first."
      />
      <Card>
        <ol className="divide-y divide-rule">
          {journey.steps.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[28px_1fr_auto] items-baseline gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
              <Dot state={s.state} n={i + 1} />
              <span className={`font-display text-[19px] ${s.state === "locked" || s.state === "skipped" ? "text-muted" : ""}`}>
                {s.state === "now" || s.state === "done" ? (
                  <Link href={s.href} className="hover:underline">
                    {s.title}
                  </Link>
                ) : (
                  s.title
                )}
                <span className="sr-only">, {STATE_WORD[s.state]}</span>
              </span>
              <span className="text-right text-sm text-muted tabular-nums">{s.detail}</span>
              {s.progress ? (
                <div className="col-start-2 col-span-2">
                  <ProgressBar value={s.progress.value} max={s.progress.max} label={`${s.title} progress`} showLabel={false} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          {journey.next ? <LinkButton href={journey.next.href}>{journey.next.state === "now" && journey.next.key === "setup" ? "Set up together" : `Continue: ${journey.next.title}`}</LinkButton> : <LinkButton href="/revisit">Revisits</LinkButton>}
          {user.couple ? (
            <LinkButton href="/waiting" variant="secondary">
              {journey.partnerName ? `Where ${journey.partnerName} is` : "Where you both are"}
            </LinkButton>
          ) : null}
        </div>
      </Card>
      <p className="reading max-w-prose text-[15px] text-muted">
        No screen here says whether two people should stay together or names anything about a person. Scores carry the questionnaire they came from. Anything the app wrote is marked &ldquo;{GENERATED_NOTE}&rdquo;
      </p>
    </div>
  );
}

function Landing() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={APP_NAME}
        lede="Two people answer the same questions separately. Each sees their own results first. Only then do you read one brief together and write a plan you both keep."
      />
      <Card>
        <h2 className="text-[22px]">How it works</h2>
        <ol className="reading mt-3 list-decimal space-y-2 pl-5 text-[17px]">
          <li>Set up together: names, who sees what, and when each of you will sit down.</li>
          <li>Each of you, alone: a part about you, then a part about the two of you. Save and come back any time.</li>
          <li>Nothing is compared until both of you are done. Each of you reads your own results privately first.</li>
          <li>Where something came up, a few questions in your own words, one topic at a time, still alone.</li>
          <li>Then the brief and the plan, together, one topic per sitting, with dates to look again.</li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <LinkButton href="/sign-in">Sign in</LinkButton>
          <LinkButton href="/square-one" variant="secondary">
            Square One, before a relationship
          </LinkButton>
        </div>
      </Card>
      {FEATURES.biographer ? (
        <Card eyebrow="Prototype">
          <h2 className="text-[22px]">The biographer and your avatars</h2>
          <p className="reading mt-2 max-w-prose text-[17px]">
            A different way in, with no questionnaires. Talk to a biographer whose only aim is to understand you, sign the lines it drafts, and meet avatars built from nothing but those lines.
          </p>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
            {[
              ["/biographer", "Your biographer", "start here"],
              ["/documents", "Your documents", "history and constitution"],
              ["/documents/voice", "How you write", "paste things you wrote"],
              ["/mentor", "You, one notch ahead", "needs five signed lines"],
              ["/mentor/panel", "Ask all of me", "several versions of you at once"],
              ["/replay", "Replay an argument", "needs both of you"],
            ].map(([href, label, note]) => (
              <li key={href}>
                <Link href={href} className="underline decoration-rule underline-offset-4 hover:decoration-accent">
                  {label}
                </Link>
                <span className="text-muted"> · {note}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <h2 className="text-[22px]">What you won&rsquo;t find here</h2>
        <p className="reading mt-2 text-[17px]">
          No screen says whether two people should stay together, and nothing names anything about a person. Scores carry the questionnaire they came from. Anything the app wrote is marked &ldquo;{GENERATED_NOTE}&rdquo;
        </p>
      </Card>
    </div>
  );
}

export default async function HomePage() {
  const user = await currentUser();
  return user ? <Home /> : <Landing />;
}
