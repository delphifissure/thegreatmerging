"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/app/_components/Button";
import { Card } from "@/app/_components/Card";
import { Field, Notice } from "@/app/_components/Field";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "magic" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("password");
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(null);
    if (err) {
      setError("Sign-in did not work. Check the email and password and try again.");
      return;
    }
    // Full navigation so the server sees the new session cookies.
    window.location.assign(next);
  }

  async function withMagicLink() {
    setError(null);
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setBusy("magic");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: err } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    setBusy(null);
    if (err) {
      setError("The link could not be sent. Try again in a minute.");
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <form onSubmit={withPassword} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full" />
        </Field>
        <Field label="Password" htmlFor="password" hint="Leave this empty if you would rather get a link by email.">
          <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full" />
        </Field>
        {error ? <Notice tone="warn">{error}</Notice> : null}
        {sent ? <Notice>A sign-in link is on its way to {email.trim()}. Open it on this device.</Notice> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy !== null || !password} aria-busy={busy === "password"}>
            {busy === "password" ? "Signing in…" : "Sign in"}
          </Button>
          <Button type="button" variant="secondary" onClick={withMagicLink} disabled={busy !== null} aria-busy={busy === "magic"}>
            {busy === "magic" ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
