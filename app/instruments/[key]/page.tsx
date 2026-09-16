import { notFound } from "next/navigation";
import * as data from "@/lib/data";
import { getInstrument, isInstrumentKey } from "@/instruments/registry";
import { requirePartner } from "@/app/_lib/session";
import { answerMap, firstUnansweredIndex, instrumentView } from "@/app/instruments/_lib/view";
import { ItemScreen } from "./ItemScreen";

export default async function InstrumentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isInstrumentKey(key)) notFound();
  const user = await requirePartner();
  const progress = await data.getProgress(user.id, user.couple.id);
  if (![...progress.layer0, ...progress.layer1].some((p) => p.key === key)) notFound();
  const mod = getInstrument(key);
  const responses = await data.listResponses(user.id, user.couple.id, key);
  const view = instrumentView(mod);
  const answers = answerMap(mod.definition, responses);
  return <ItemScreen view={view} initialAnswers={answers} initialIndex={firstUnansweredIndex(view, answers)} />;
}
