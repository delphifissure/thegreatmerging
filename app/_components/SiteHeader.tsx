import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { HighContrastToggle } from "./HighContrastToggle";

export async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="font-semibold">
          The Plan
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/setup">Setup</Link>
              <Link href="/instruments">Instruments</Link>
              <Link href="/results">Results</Link>
              <Link href="/brief">Brief</Link>
              <Link href="/plan">Plan</Link>
              <Link href="/revisit">Revisit</Link>
              <form action="/sign-out" method="post">
                <button type="submit" className="underline">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/sign-in">Sign in</Link>
          )}
          <HighContrastToggle />
        </nav>
      </div>
    </header>
  );
}
