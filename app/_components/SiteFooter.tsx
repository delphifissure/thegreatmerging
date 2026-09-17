import Link from "next/link";
import { HighContrastToggle } from "./HighContrastToggle";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5 text-sm text-muted">
        <p className="max-w-prose">Scores come from published questionnaires and are labelled by source. Anything the app wrote is labelled as such. Nothing here is a verdict.</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/revisit" className="hover:text-ink">
            Revisits
          </Link>
          <Link href="/results/profile" className="hover:text-ink">
            My profile
          </Link>
          <HighContrastToggle />
        </div>
      </div>
    </footer>
  );
}
