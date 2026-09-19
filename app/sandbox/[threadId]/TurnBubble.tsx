import { MOVE_DID, type Move } from "@/lib/replay/moves";

const MEANT: Record<string, string> = { "-2": "to push back hard", "-1": "coolly", "0": "neutrally", "1": "warmly", "2": "to reach toward them" };
const LANDED: Record<string, string> = { "-2": "it stung", "-1": "it grated", "0": "neither way", "1": "it eased things", "2": "it warmed them" };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export type BubbleTurn = { side: "a" | "b"; says: string | null; does: string | null; move?: string | null; secondary?: string | null; intent?: number | null; given?: boolean };

/** One turn of a sandbox conversation. Used by the page for saved turns and by the runner for the turn that has just arrived. */
export function TurnBubble({ turn: t, name, otherName, landed, fresh = false }: { turn: BubbleTurn; name: string; otherName: string; landed: number | null; fresh?: boolean }) {
  const did = (m?: string | null) => (m && m in MOVE_DID ? MOVE_DID[m as Move] : null);
  return (
    <li className={`max-w-prose rounded-card p-4 ${fresh ? "anim-arrive" : ""} ${t.side === "a" ? "mr-6 border border-rule bg-surface" : "ml-6 bg-tint"}`}>
      <p className="eyebrow mb-1">
        {name}
        {did(t.move) ? ` · ${did(t.move)}` : ""}
        {did(t.secondary) && t.secondary !== t.move ? `, and ${did(t.secondary)}` : ""}
        {t.given ? " · the line you gave them" : ""}
      </p>
      {t.says ? <p className="reading whitespace-pre-line text-[17px]">&ldquo;{t.says}&rdquo;</p> : null}
      {t.does ? <p className="reading text-[16px] italic text-muted">{t.does}</p> : null}
      {t.intent != null || landed != null ? (
        <p className="mt-2 text-sm text-muted">
          {t.intent != null ? `Meant ${MEANT[String(t.intent)]} (${signed(t.intent)})` : ""}
          {t.intent != null && landed != null ? " · " : ""}
          {landed != null ? `on ${otherName} ${LANDED[String(landed)]} (${signed(landed)})` : ""}
        </p>
      ) : null}
    </li>
  );
}
