"use client";

import Link from "next/link";
import { Button } from "@/app/_components/Button";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";

/**
 * Route error boundary. Nothing from the error itself is shown except the digest, which is safe:
 * messages could carry data from the request.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Something went wrong" lede="Nothing you saved is lost. You can try again, or go back to the start." />
      <Card>
        <div className="flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className="inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium">
            Back to the start
          </Link>
        </div>
        {error.digest ? <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p> : null}
      </Card>
    </div>
  );
}
