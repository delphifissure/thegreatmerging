import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { APP_NAME } from "@/lib/brand";
import { AcceptForm } from "./AcceptForm";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await currentUser();
  const here = `/invite/${encodeURIComponent(token)}`;
  return (
    <div className="space-y-6">
      <PageHeader title="You have been invited" lede={`Someone has asked you to join them on ${APP_NAME}. Accepting links your account to theirs so the two of you can go through it together.`} />
      <Card>
        <p className="text-sm text-muted">
          Each of you answers alone. Nothing you write is compared or shown until both of you have finished, and you choose what
          your partner can see.
        </p>
        {user ? (
          <div className="mt-4">
            <AcceptForm token={token} />
          </div>
        ) : (
          <p className="mt-4">
            <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="underline">
              Sign in or create your account
            </Link>{" "}
            to accept.
          </p>
        )}
      </Card>
    </div>
  );
}
