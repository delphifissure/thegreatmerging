import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { safeNext } from "@/app/_lib/actions";
import { PageHeader } from "@/app/_components/PageHeader";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const user = await currentUser();
  if (user) redirect(next);
  return (
    <div className="space-y-6">
      <PageHeader title="Sign in" lede="Use your email and password, or ask for a one-time link by email." />
      {sp.error === "link" ? (
        <p role="alert" className="rounded border border-warn-border bg-warn-bg px-3 py-2 text-sm">
          That sign-in link did not work. It may have expired; request a new one below.
        </p>
      ) : null}
      <SignInForm next={next} />
    </div>
  );
}
