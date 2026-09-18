import { setDepth } from "../actions";

const CHOICES = [
  ["light", "Keep it light"],
  ["deeper", "Go deeper today"],
] as const;

const EXPLAIN = {
  light: "Events and what you did. Feelings only if you bring them up.",
  deeper: "Also what you felt, what it meant, and where it started. The biographer may put two things you said side by side. You can still skip anything.",
};

/** The person sets how far the biographer may go. It applies from the next question on. */
export function DepthToggle({ threadId, depth }: { threadId: string; depth: "light" | "deeper" }) {
  return (
    <form action={setDepth} className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label="How far this conversation goes">
      <input type="hidden" name="threadId" value={threadId} />
      {CHOICES.map(([value, label]) => (
        <button
          key={value}
          type="submit"
          name="depth"
          value={value}
          aria-pressed={depth === value}
          className={`rounded-full border px-3 py-1 transition-colors ${depth === value ? "border-accent bg-tint text-ink" : "border-rule text-muted hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
      <span className="basis-full text-muted sm:basis-auto">{EXPLAIN[depth]}</span>
    </form>
  );
}
