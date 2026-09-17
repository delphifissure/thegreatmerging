"use client";

import { useSyncExternalStore } from "react";
import { Toggle } from "./Toggle";

const KEY = "the-plan:high-contrast";
const EVENT = "the-plan:contrast";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function snapshot(): boolean {
  return document.documentElement.classList.contains("high-contrast");
}

export function HighContrastToggle() {
  const on = useSyncExternalStore(subscribe, snapshot, () => false);
  const set = (next: boolean) => {
    document.documentElement.classList.toggle("high-contrast", next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // storage unavailable; the class still applies for this page
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span id="hc-label">High contrast</span>
      <Toggle checked={on} onChange={set} aria-labelledby="hc-label" />
    </span>
  );
}
