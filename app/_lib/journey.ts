/**
 * Where a signed-in person is in the sequence, computed from what lib/data already knows. Used by
 * the home page to show the one thing to do next. Reads only this person's own material plus the
 * couple-level status that every page already shows.
 */
import * as data from "@/lib/data";
import type { MachineState } from "@/lib/color/machine";
import { PART_TITLES } from "@/lib/copy";
import { parsePrivateResults } from "@/app/_lib/results";
import type { AppUser } from "@/app/_lib/session";

export type StepState = "done" | "now" | "locked" | "skipped";
export type Step = { key: string; title: string; state: StepState; detail: string; href: string; progress?: { value: number; max: number } };
export type Journey = { steps: Step[]; next: Step | null; partnerName: string | null; partnerDone: boolean | null };

const requiredDone = (list: data.InstrumentProgress[]) => list.filter((p) => p.required).every((p) => p.complete);
const counts = (list: data.InstrumentProgress[]) => {
  const req = list.filter((p) => p.required);
  return { value: req.reduce((s, p) => s + Math.min(p.answered, p.total), 0), max: req.reduce((s, p) => s + p.total, 0) };
};

export async function buildJourney(user: AppUser): Promise<Journey> {
  const couple = user.couple;
  const steps: Step[] = [];
  if (!couple || !user.side) {
    steps.push({ key: "setup", title: "Set up together", state: "now", detail: "Names, what each of you shares, and an invitation for your partner.", href: "/setup" });
    for (const [key, title] of [["part1", PART_TITLES.layer0], ["part2", PART_TITLES.layer1], ["results", "Your results, privately"], ["words", "In your own words"], ["brief", "The brief, together"], ["plan", "The plan"]] as const) {
      steps.push({ key, title, state: "locked", detail: "", href: "/setup" });
    }
    return { steps, next: steps[0], partnerName: null, partnerDone: null };
  }

  const [progress, both, run, resultsRow, members, sessions, briefs, plan] = await Promise.all([
    data.getProgress(user.id, couple.id),
    data.coupleCompletionStatus(couple.id),
    data.getLatestRun(couple.id),
    data.getPrivateResults(user.id, couple.id),
    data.listCoupleUsers(couple.id),
    data.listOwnSessions(user.id, couple.id),
    data.getBriefs(couple.id),
    data.getLatestPlan(couple.id),
  ]);
  const partner = members.find((m) => m.id !== user.id) ?? null;
  const partnerDone = partner ? (user.side === "a" ? both.b : both.a) : null;
  const results = resultsRow ? parsePrivateResults(resultsRow.content) : null;
  const flagged = results ? [...results.flagged_domains].sort((x, y) => y.weight - x.weight) : [];
  const runComplete = !!run && run.status === "complete";
  const viewed = !!resultsRow?.viewed_at;

  const setupDone = !!couple.partner_b_id;
  steps.push({
    key: "setup",
    title: "Set up together",
    state: setupDone ? "done" : "now",
    detail: setupDone ? `You and ${partner?.display_name ?? "your partner"}` : "Invite your partner and choose what each of you shares.",
    href: "/setup",
  });

  const p1 = counts(progress.layer0);
  const p1Done = requiredDone(progress.layer0);
  steps.push({
    key: "part1",
    title: PART_TITLES.layer0,
    state: p1Done ? "done" : "now",
    detail: p1Done ? "Done" : p1.value === 0 ? "About 20 minutes, alone" : `${p1.value} of ${p1.max} answered`,
    href: "/instruments",
    progress: p1Done ? undefined : p1,
  });

  const p2 = counts(progress.layer1);
  const p2Done = requiredDone(progress.layer1);
  steps.push({
    key: "part2",
    title: PART_TITLES.layer1,
    state: p2Done ? "done" : p1Done ? "now" : "locked",
    detail: p2Done ? "Done" : p2.value === 0 ? "About 35 minutes, alone" : `${p2.value} of ${p2.max} answered`,
    href: "/instruments",
    progress: p2Done || p2.value === 0 ? undefined : p2,
  });

  const mineDone = p1Done && p2Done;
  steps.push({
    key: "results",
    title: "Your results, privately",
    state: viewed ? "done" : runComplete && results ? "now" : "locked",
    detail: viewed
      ? "Read"
      : runComplete && results
        ? "Ready to read"
        : run && (run.status === "running" || run.status === "pending")
          ? "Reading your answers now"
          : mineDone && partnerDone === false
            ? `Waiting for ${partner?.display_name ?? "your partner"}`
            : "After you both finish",
    href: runComplete ? "/results" : "/waiting",
  });

  const sessionDone = (domain: string) => {
    const s = sessions.find((x) => x.domain === domain);
    return !!s && s.status === "complete" && (s.state as MachineState).state === "complete";
  };
  const wordsDone = flagged.length > 0 && flagged.every((d) => sessionDone(d.domain));
  const wordsCount = flagged.filter((d) => sessionDone(d.domain)).length;
  steps.push({
    key: "words",
    title: "In your own words",
    state: !runComplete ? "locked" : flagged.length === 0 ? "skipped" : wordsDone ? "done" : viewed ? "now" : "locked",
    detail: !runComplete ? "Only where something came up" : flagged.length === 0 ? "Nothing came up, so this step is skipped" : wordsDone ? "Done" : `${wordsCount} of ${flagged.length} topics`,
    href: "/color",
  });

  const briefDone = briefs.length > 0;
  const briefReady = runComplete && (flagged.length === 0 || wordsDone);
  steps.push({
    key: "brief",
    title: "The brief, together",
    state: briefDone ? "done" : briefReady ? "now" : "locked",
    detail: briefDone ? "Ready to read together" : briefReady ? "Being written, or waiting for your partner" : "After the written questions",
    href: "/brief",
  });

  steps.push({
    key: "plan",
    title: "The plan",
    state: plan ? "done" : briefDone || (runComplete && flagged.length === 0) ? "now" : "locked",
    detail: plan ? `Version ${plan.version}` : "Together, one topic per sitting",
    href: "/plan",
  });

  const next = steps.find((s) => s.state === "now") ?? null;
  return { steps, next, partnerName: partner?.display_name ?? null, partnerDone };
}
