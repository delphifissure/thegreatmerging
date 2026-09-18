import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { CONSTITUTION_SECTIONS, HISTORY_SECTIONS } from "@/lib/llm/schemas";
import { DOCUMENT_TITLES, SECTION_TITLES } from "@/lib/biographer/labels";
import { requireAppUser } from "@/app/_lib/session";
import { Card, Chip } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { LinkButton } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { AddOwnLine, ProposedLine, RatifiedLine } from "./EntryCards";

export const metadata = { title: "Your documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ drafted?: string }> }) {
  if (!FEATURES.biographer) notFound();
  const sp = await searchParams;
  const user = await requireAppUser();
  const entries = await data.listOwnEntries(user.id);
  const proposed = entries.filter((e) => e.status === "proposed");
  const ratified = entries.filter((e) => e.status === "ratified");
  const docs = [
    { key: "constitution" as const, sections: CONSTITUTION_SECTIONS as readonly string[] },
    { key: "history" as const, sections: HISTORY_SECTIONS as readonly string[] },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Prototype" title="Your documents" lede="Your history and your constitution. The app drafts lines from your conversations; a line becomes part of a document only when you sign it. Private to you." />

      {sp.drafted === "1" && proposed.length > 0 ? <Notice tone="good">The conversation is closed and the app has drafted {proposed.length} {proposed.length === 1 ? "line" : "lines"} from it. Accept, edit or reject each one.</Notice> : null}
      {sp.drafted === "0" ? <Notice>The conversation is closed. No lines were drafted this time, either because it was short or because drafting did not work. You can add lines yourself below.</Notice> : null}

      {proposed.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[22px]">Waiting for your signature</h2>
            <Chip tone="accent">{proposed.length} drafted</Chip>
          </div>
          <p className="reading mt-1 text-[16px] text-muted">Drafted by the app from what you said. Change any word. Reject anything that isn&rsquo;t you.</p>
          <ul className="mt-3 divide-y divide-rule">
            {proposed.map((e) => (
              <ProposedLine key={e.id} entry={{ id: e.id, text: e.text, mark: e.mark, section: e.section, document: e.document, in_their_words: e.in_their_words }} sectionTitle={`${DOCUMENT_TITLES[e.document]} · ${SECTION_TITLES[e.section] ?? e.section}`} />
            ))}
          </ul>
        </Card>
      ) : null}

      {docs.map((doc) => {
        const mine = ratified.filter((e) => e.document === doc.key);
        return (
          <Card key={doc.key} as="article">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[26px]">{DOCUMENT_TITLES[doc.key]}</h2>
              <Chip>{mine.length} {mine.length === 1 ? "line" : "lines"}</Chip>
            </div>
            {mine.length === 0 ? <p className="reading mt-2 text-[17px] text-muted">Nothing ratified yet.</p> : null}
            {doc.sections.map((section) => {
              const lines = mine.filter((e) => e.section === section);
              if (lines.length === 0) return null;
              return (
                <section key={section} className="mt-5">
                  <h3 className="text-[19px]">{SECTION_TITLES[section] ?? section}</h3>
                  <ul className="mt-1 divide-y divide-rule">
                    {lines.map((e) => (
                      <RatifiedLine key={e.id} entry={{ id: e.id, text: e.text, mark: e.mark }} />
                    ))}
                  </ul>
                </section>
              );
            })}
            <AddOwnLine document={doc.key} sections={doc.sections.map((s) => ({ key: s, title: SECTION_TITLES[s] ?? s }))} />
          </Card>
        );
      })}

      <div className="flex flex-wrap gap-3">
        <LinkButton href="/biographer" variant="secondary">
          Back to the biographer
        </LinkButton>
        <LinkButton href="/mentor" variant="secondary">
          You, one notch ahead
        </LinkButton>
      </div>
    </div>
  );
}
