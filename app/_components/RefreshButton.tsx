"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "./Button";

export function RefreshButton({ label = "Check again" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" onClick={() => start(() => router.refresh())} disabled={pending} aria-busy={pending}>
      {pending ? "Checking…" : label}
    </Button>
  );
}
