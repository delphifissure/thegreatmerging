"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Field } from "@/app/_components/Field";

const KEY = "the-plan:schedule";
const EVENT = "the-plan:schedule-change";
type Schedule = { layer0: string; layer1: string };

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function SchedulingNotes() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const s = useMemo<Schedule>(() => {
    try {
      return { layer0: "", layer1: "", ...(raw ? (JSON.parse(raw) as Partial<Schedule>) : {}) };
    } catch {
      return { layer0: "", layer1: "" };
    }
  }, [raw]);
  const update = (patch: Partial<Schedule>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...s, ...patch }));
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="I will do the part about me on" htmlFor="sched-l0">
        <input id="sched-l0" type="date" value={s.layer0} onChange={(e) => update({ layer0: e.target.value })} />
      </Field>
      <Field label="I will do the part about the two of us on" htmlFor="sched-l1">
        <input id="sched-l1" type="date" value={s.layer1} onChange={(e) => update({ layer1: e.target.value })} />
      </Field>
      <p className="text-xs text-muted sm:col-span-2">Informational only. Stored in this browser, not on the server.</p>
    </div>
  );
}
