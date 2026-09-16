import type { BriefDomain } from "@/lib/llm/schemas";
import { DOMAIN_TITLES } from "@/app/_lib/results";
import { Card, GeneratedLabel, UnvalidatedLabel } from "@/app/_components/Card";

export type Names = { a: string; b: string };

/** Reading view of the brief: aligned first, then parked, then one section per flagged domain in the given order. */
export function BriefSections({ briefs, names, descriptors = {} }: { briefs: BriefDomain[]; names: Names; descriptors?: Record<string, string> }) {
  const aligned = [...new Set(briefs.flatMap((b) => b.aligned_items))];
  const parked = [...new Set(briefs.flatMap((b) => b.parked_items))];
  const d = (ref: string) => descriptors[ref] ?? ref;
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">What lines up</h2>
        <GeneratedLabel />
        {aligned.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing listed.</p> : (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {aligned.map((a) => (
              <li key={a}>{d(a)}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Parked on purpose</h2>
        <GeneratedLabel />
        {parked.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing parked.</p> : (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {parked.map((p) => (
              <li key={p}>{d(p)}</li>
            ))}
          </ul>
        )}
      </Card>
      {briefs.map((b) => (
        <Card key={b.domain} as="article">
          <h2 className="text-xl font-semibold">{DOMAIN_TITLES[b.domain]}</h2>
          <GeneratedLabel />

          <h3 className="mt-4 font-semibold">What each would do</h3>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted">{names.a}</p>
              <p>{b.what_each_would_do.a}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">{names.b}</p>
              <p>{b.what_each_would_do.b}</p>
            </div>
          </div>

          <h3 className="mt-4 font-semibold">Values underneath</h3>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted">{names.a}</p>
              <p>{b.values_underneath.a}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">{names.b}</p>
              <p>{b.values_underneath.b}</p>
            </div>
          </div>

          {b.tags_side_by_side.length > 0 ? (
            <>
              <h3 className="mt-4 font-semibold">Tags side by side</h3>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">{names.a}</th>
                      <th scope="col">{names.b}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.tags_side_by_side.map((t) => (
                      <tr key={t.item_ref}>
                        <td>{d(t.item_ref)}</td>
                        <td>
                          {t.a_tag ? <strong className="capitalize">{t.a_tag}. </strong> : <span className="text-muted">no tag. </span>}
                          {t.a_comment ?? ""}
                        </td>
                        <td>
                          {t.b_tag ? <strong className="capitalize">{t.b_tag}. </strong> : <span className="text-muted">no tag. </span>}
                          {t.b_comment ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {b.perception_gaps.length > 0 ? (
            <>
              <h3 className="mt-4 font-semibold">Perception gaps</h3>
              <ul className="mt-1 space-y-2 text-sm">
                {b.perception_gaps.map((g) => (
                  <li key={g.item_ref}>
                    <p className="font-medium">{d(g.item_ref)}</p>
                    <p>
                      <span className="text-muted">{names.a} sees:</span> {g.a_explanation || "(no explanation)"}
                    </p>
                    <p>
                      <span className="text-muted">{names.b} sees:</span> {g.b_explanation || "(no explanation)"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {b.polarization_loops.length > 0 ? (
            <>
              <h3 className="mt-4 font-semibold">
                Shared patterns from the polarization block <UnvalidatedLabel />
              </h3>
              <ul className="mt-1 space-y-2 text-sm">
                {b.polarization_loops.map((l) => (
                  <li key={l.dimension}>
                    <p className="font-medium">
                      {d(l.dimension)} <UnvalidatedLabel />
                    </p>
                    <p>{l.shared_pattern}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {b.consistency_notes.length > 0 ? (
            <>
              <h3 className="mt-4 font-semibold">Notes each agreed to share</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {b.consistency_notes.map((n, i) => (
                  <li key={i}>
                    <span className="text-muted">{n.user === "a" ? names.a : names.b}:</span> {n.note}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <GeneratedLabel className="mt-4" />
        </Card>
      ))}
    </div>
  );
}
