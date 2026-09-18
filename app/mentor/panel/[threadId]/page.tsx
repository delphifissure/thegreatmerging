import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { RATINGS_BEFORE_READING, versionByKey } from "@/lib/biographer/versions";
import { requireAppUser } from "@/app/_lib/session";
import { PanelView, type PanelCard } from "./PanelView";

export const metadata = { title: "Ask all of me" };

export default async function PanelPage({ params }: { params: Promise<{ threadId: string }> }) {
  if (!FEATURES.biographer) notFound();
  const { threadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();
  const user = await requireAppUser();
  const thread = await data.getOwnThread(threadId, user.id);
  if (!thread || thread.kind !== "panel") notFound();
  const [turns, entries] = await Promise.all([data.listTurns(thread.id, user.id), data.listOwnEntries(user.id, { status: "ratified" })]);
  const textOf = new Map(entries.map((e) => [e.id, e.text]));

  const cards: PanelCard[] = turns.flatMap((t) => {
    const def = t.role === "avatar" ? versionByKey(t.meta.version) : null;
    if (!def) return [];
    return [
      {
        turnId: t.id,
        kind: def.kind,
        label: def.label,
        change: t.extras?.change ?? def.change,
        replicate: !!def.replicate_of,
        fallback: t.meta.fallback === true,
        openingLine: t.extras?.opening_line ?? null,
        text: t.text,
        unsureQuestion: t.meta.unsure === true ? t.note : null,
        drawsOn: Array.isArray(t.meta.draws_on) ? (t.meta.draws_on as string[]).flatMap((id) => (textOf.has(id) ? [textOf.get(id)!] : [])) : [],
        rating: t.rating,
      },
    ];
  });
  const readings = turns.filter((t) => t.role === "guide" && t.meta.kind === "panel_reading");
  const last = readings[readings.length - 1];

  return (
    <PanelView
      threadId={thread.id}
      situation={turns.find((t) => t.role === "person")?.text ?? null}
      safety={turns.find((t) => t.role === "guide" && t.meta.kind === "safety")?.text ?? null}
      cards={cards}
      reading={last ? { question: last.text, same: last.extras?.reading?.same ?? [], differs: last.extras?.reading?.differs ?? [] } : null}
      needed={RATINGS_BEFORE_READING}
    />
  );
}
