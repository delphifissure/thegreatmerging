"use client";

import { useState, useTransition } from "react";
import { rateVersion } from "../actions";

type Rating = "like_me" | "bad_day" | "not_like_me";
const CHOICES: Array<[Rating, string]> = [
  ["like_me", "Me"],
  ["bad_day", "Me on a bad day"],
  ["not_like_me", "Not me"],
];

/** The person's own verdict on one version. These verdicts are what draw the edge of "me". */
export function VersionRating({ turnId, rating: initial }: { turnId: string; rating: Rating | null }) {
  const [pending, start] = useTransition();
  const [rating, setRating] = useState(initial);
  const rate = (r: Rating) =>
    start(async () => {
      setRating(r);
      const res = await rateVersion({ turnId, rating: r });
      if (!res.ok) setRating(initial);
    });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Do you recognize this version?">
      {CHOICES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          disabled={pending}
          aria-pressed={rating === value}
          onClick={() => rate(value)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${rating === value ? "border-accent bg-accent text-accent-ink" : "border-rule bg-paper hover:border-accent/60"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
