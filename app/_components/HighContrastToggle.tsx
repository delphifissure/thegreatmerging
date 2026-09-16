"use client";

import { useSyncExternalStore } from "react";

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
  const toggle = () => {
    const next = !on;
    document.documentElement.classList.toggle("high-contrast", next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // storage unavailable; the class still applies for this page
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <button type="button" role="switch" aria-checked={on} onClick={toggle} className="rounded border border-border px-2 py-1 text-sm">
      High contrast: {on ? "on" : "off"}
    </button>
  );
}
