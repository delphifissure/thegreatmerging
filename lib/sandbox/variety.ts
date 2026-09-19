/**
 * How alike a set of invented life histories are, counted in code. Two histories written
 * independently should share almost no four-word phrases once names and small words are set aside;
 * when most pairs share several, the writer is filling in a template. Used by the sandbox evals.
 */
const SMALL = new Set("the a an of to and in on at for with he she his her him it that was is had as but not they their when what who from by be been or so then which would could did do this one two out up into about after before than them never always still".split(" "));

/** Four-word phrases with at least two words that carry meaning. Names are masked, so "Mara goes quiet and" and "Jonas goes quiet and" are the same phrase. */
export function contentPhrases(text: string, names: string[]): Set<string> {
  const masked = new Set(names.map((n) => n.toLowerCase()));
  const words = (text.toLowerCase().replace(/’/g, "'").match(/[\p{L}']+/gu) ?? []).map((w) => (masked.has(w) || masked.has(w.replace(/'s$/, "")) ? "NAME" : w));
  const out = new Set<string>();
  for (let i = 0; i + 4 <= words.length; i++) {
    const gram = words.slice(i, i + 4);
    if (gram.filter((w) => w !== "NAME" && !SMALL.has(w)).length >= 2) out.add(gram.join(" "));
  }
  return out;
}

export type Variety = { pairs: number; meanShared: number; maxShared: number; pairsSharingThree: number; worn: Array<{ phrase: string; texts: number }> };

/** Every pair of texts is compared. `worn` lists phrases found in a quarter of the texts or more (and at least three), most common first. */
export function variety(texts: Array<{ text: string; names: string[] }>): Variety {
  const sets = texts.map((t) => contentPhrases(t.text, t.names));
  const shared: number[] = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) shared.push([...sets[i]].filter((g) => sets[j].has(g)).length);
  const counts = new Map<string, number>();
  for (const s of sets) for (const g of s) counts.set(g, (counts.get(g) ?? 0) + 1);
  const floor = Math.max(3, Math.ceil(texts.length / 4));
  const worn = [...counts].filter(([, n]) => n >= floor).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([phrase, n]) => ({ phrase, texts: n }));
  return { pairs: shared.length, meanShared: shared.length ? shared.reduce((a, b) => a + b, 0) / shared.length : 0, maxShared: Math.max(0, ...shared), pairsSharingThree: shared.filter((n) => n >= 3).length, worn };
}
