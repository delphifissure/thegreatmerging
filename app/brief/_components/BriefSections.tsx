import type { BriefDomain } from "@/lib/llm/schemas";
import { DOMAIN_TITLES } from "@/lib/copy";
import { Card, Chip, GeneratedLabel, UnvalidatedLabel } from "@/app/_components/Card";

export type Names = { a: string; b: string };

function TwoVoices({ names, a, b }: { names: Names; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <div className="mt-2 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="eyebrow">{names.a}</p>
        <div className="reading mt-1 text-[17px]">{a}</div>
      </div>
      <div>
        <p className="eyebrow">{names.b}</p>
        <div className="reading mt-1 text-[17px]">{b}</div>
      </div>
    </div>
  );
}

function TagCell({ tag, comment }: { tag: "requirement" | "preference" | null; comment: string | null }) {
  return (
    <>
      {tag ? <Chip tone={tag === "requirement" ? "accent" : "quiet"}>{tag === "requirement" ? "Requirement" : "Preference"}</Chip> : <span className="text-sm text-muted">No tag</span>}
      {comment ? <p className="mt-1.5">{comment}</p> : null}
    </>
  );
}

/** Reading view of the brief: what lines up first, then what was parked, then one card per topic in the given order. */
export function BriefSections({ briefs, names, descriptors = {} }: { briefs: BriefDomain[]; names: Names; descriptors?: Record<string, string> }) {
  const aligned = [...new Set(briefs.flatMap((b) => b.aligned_items))];
  const parked = [...new Set(briefs.flatMap((b) => b.parked_items))];
  const d = (ref: string) => descriptors[ref] ?? ref;
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[22px]">What lines up</h2>
        {aligned.length === 0 ? (
          <p className="reading mt-2 text-[17px] text-muted">Nothing listed.</p>
        ) : (
          <ul className="reading mt-2 list-disc space-y-1 pl-5 text-[17px]">
            {aligned.map((a) => (
              <li key={a}>{d(a)}</li>
            ))}
          </ul>
        )}
        <GeneratedLabel className="mt-3" />
      </Card>
      <Card>
        <h2 className="text-[22px]">Parked on purpose</h2>
        {parked.length === 0 ? (
          <p className="reading mt-2 text-[17px] text-muted">Nothing parked.</p>
        ) : (
          <ul className="reading mt-2 list-disc space-y-1 pl-5 text-[17px]">
            {parked.map((p) => (
              <li key={p}>{d(p)}</li>
            ))}
          </ul>
        )}
        <GeneratedLabel className="mt-3" />
      </Card>
      {briefs.map((b) => (
        <Card key={b.domain} as="article">
          <h2 className="text-[26px]">{DOMAIN_TITLES[b.domain]}</h2>
          <GeneratedLabel className="mt-1" />

          <h3 className="mt-5 text-[19px]">What each would do</h3>
          <TwoVoices names={names} a={b.what_each_would_do.a} b={b.what_each_would_do.b} />

          <h3 className="mt-5 text-[19px]">Values underneath</h3>
          <TwoVoices names={names} a={b.values_underneath.a} b={b.values_underneath.b} />

          {b.tags_side_by_side.length > 0 ? (
            <>
              <h3 className="mt-5 text-[19px]">Side by side</h3>
              <ul className="mt-2 divide-y divide-rule">
                {b.tags_side_by_side.map((t) => (
                  <li key={t.item_ref} className="py-3 first:pt-0 last:pb-0">
                    <p className="reading text-[17px] font-medium">{d(t.item_ref)}</p>
                    <div className="mt-2 grid gap-4 text-[15px] sm:grid-cols-2">
                      <div>
                        <p className="eyebrow mb-1">{names.a}</p>
                        <TagCell tag={t.a_tag} comment={t.a_comment} />
                      </div>
                      <div>
                        <p className="eyebrow mb-1">{names.b}</p>
                        <TagCell tag={t.b_tag} comment={t.b_comment} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {b.perception_gaps.length > 0 ? (
            <>
              <h3 className="mt-5 text-[19px]">Where you see it differently</h3>
              <ul className="mt-2 space-y-3">
                {b.perception_gaps.map((g) => (
                  <li key={g.item_ref}>
                    <p className="reading text-[17px] font-medium">{d(g.item_ref)}</p>
                    <TwoVoices names={names} a={g.a_explanation || <span className="text-muted">No explanation</span>} b={g.b_explanation || <span className="text-muted">No explanation</span>} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {b.polarization_loops.length > 0 ? (
            <>
              <h3 className="mt-5 text-[19px]">
                Shared patterns <UnvalidatedLabel />
              </h3>
              <p className="mt-1 text-sm text-muted">From the original, unvalidated block about how you each shift around the other.</p>
              <ul className="mt-2 space-y-3">
                {b.polarization_loops.map((l) => (
                  <li key={l.dimension}>
                    <p className="reading text-[17px] font-medium">
                      {d(l.dimension)} <UnvalidatedLabel />
                    </p>
                    <p className="reading mt-1 text-[17px]">{l.shared_pattern}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {b.consistency_notes.length > 0 ? (
            <>
              <h3 className="mt-5 text-[19px]">Notes each agreed to share</h3>
              <ul className="reading mt-2 space-y-1.5 text-[17px]">
                {b.consistency_notes.map((n, i) => (
                  <li key={i}>
                    <span className="text-muted">{n.user === "a" ? names.a : names.b}:</span> {n.note}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
