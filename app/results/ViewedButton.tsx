"use client";

import { useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { markViewed } from "./actions";

export function ViewedButton() {
  const [pending, start] = useTransition();
  return (
    <Button disabled={pending} aria-busy={pending} onClick={() => start(async () => void (await markViewed()))}>
      {pending ? "Saving…" : "I have read my results"}
    </Button>
  );
}
