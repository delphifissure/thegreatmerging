import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/brand";
import { FEATURES } from "@/config/features";
import { Mark } from "./Mark";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/instruments", label: "Questionnaires" },
  { href: "/results", label: "Results" },
  { href: "/brief", label: "Brief" },
  { href: "/plan", label: "Plan" },
  // The intervention prototype: biographer, documents, avatars and the replay all hang off this page.
  ...(FEATURES.biographer
    ? [
        { href: "/biographer", label: "Biographer" },
        { href: "/sandbox", label: "Sandbox" },
      ]
    : []),
];

export async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5">
        <Link href="/" className="inline-flex items-center gap-2.5 font-display text-[22px] text-accent">
          <Mark size={24} />
          <span className="text-ink">{APP_NAME}</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {user ? (
            <>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-muted hover:text-ink">
                  {n.label}
                </Link>
              ))}
              <form action="/sign-out" method="post">
                <button type="submit" className="text-muted underline decoration-rule underline-offset-4 hover:text-ink">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/sign-in" className="text-ink">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
