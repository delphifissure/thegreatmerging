"use client";

/** Last-resort boundary for errors in the root layout itself. Renders its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "40rem", margin: "0 auto", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
        <p>Nothing you saved is lost. Reload the page or try again.</p>
        <button type="button" onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1rem", border: "1px solid #999", borderRadius: "6px", background: "transparent", cursor: "pointer" }}>
          Try again
        </button>
        {error.digest ? <p style={{ marginTop: "1rem", fontSize: "0.75rem", opacity: 0.7 }}>Reference: {error.digest}</p> : null}
      </body>
    </html>
  );
}
