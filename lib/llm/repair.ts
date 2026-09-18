/**
 * Repair for one specific model slip. Under a strict tool schema the model sometimes closes a long
 * string field the way its native tool format would (`</reply>`), and then writes the next
 * parameter (`<parameter name="opening_line">…`) inside that same string, leaving the real field
 * null. A retry repeats the slip, so the wrapper puts the model's own words back where the model
 * said they belong, before validation. It never invents content: text only moves to a field the
 * model named, and only when that field came back empty. Anything it cannot place is cut from the
 * prose, and the schemas still reject any markup that survives.
 */
const CLOSE = /<\/\s*(?:[a-z]+:)?([a-z_]+)\s*>/i;
const PARAM = /<\s*(?:[a-z]+:)?parameter\s+name\s*=\s*"([a-z_]+)"\s*>/gi;
const ANY_TAG = /<\/?\s*(?:[a-z]+:)?(?:parameter|invoke|function_calls)\b[^>]*>/gi;

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function cutPoint(key: string, text: string): number {
  const close = CLOSE.exec(text);
  if (close && (close[1].toLowerCase() === key.toLowerCase() || close[1].toLowerCase() === "parameter")) return close.index;
  PARAM.lastIndex = 0;
  const open = PARAM.exec(text);
  return open ? open.index : -1;
}

export function repairLeakedParameters(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== "string") continue;
    const cut = cutPoint(key, value);
    if (cut < 0) continue;
    const tail = value.slice(cut);
    out[key] = value.slice(0, cut).trimEnd();

    PARAM.lastIndex = 0;
    const opens = [...tail.matchAll(PARAM)];
    opens.forEach((m, i) => {
      const name = m[1];
      if (!(name in out) || name === key || !isEmpty(out[name])) return;
      const end = i + 1 < opens.length ? opens[i + 1].index : tail.length;
      const text = tail.slice(m.index + m[0].length, end).replace(ANY_TAG, "").replace(CLOSE, "").trim();
      if (!text) return;
      if (Array.isArray(out[name])) {
        try {
          const parsed: unknown = JSON.parse(text);
          if (Array.isArray(parsed)) out[name] = parsed;
        } catch {
          // Not an array after all; leave the field as the model left it.
        }
      } else if (out[name] === null || out[name] === undefined || out[name] === "") {
        out[name] = text === "null" ? null : text;
      }
    });
  }
  return out;
}
