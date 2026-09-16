import * as data from "@/lib/data";
import { signedExportUrl } from "@/inngest/export";
import { RefreshButton } from "@/app/_components/RefreshButton";

/** Recent exports of one kind with short-lived download links (signed for 15 minutes). */
export async function ExportList({ coupleId, userId, kinds }: { coupleId: string | null; userId: string; kinds: Array<"brief" | "plan" | "profile"> }) {
  const rows = (await data.listExports({ coupleId, userId })).filter((r) => kinds.includes(r.kind)).slice(0, 10);
  const links = await Promise.all(
    rows.map(async (r) => {
      try {
        return { row: r, url: await signedExportUrl(r.storage_path) };
      } catch {
        return { row: r, url: null };
      }
    }),
  );
  return (
    <div className="mt-3 space-y-2 text-sm">
      {links.length === 0 ? <p className="text-muted">No exports yet.</p> : null}
      <ul className="space-y-1">
        {links.map(({ row, url }) => (
          <li key={row.id}>
            {row.kind} ({row.format.toUpperCase()}), {row.created_at.toISOString().slice(0, 16).replace("T", " ")}:{" "}
            {url ? (
              <a href={url} className="underline">
                download (link valid 15 minutes)
              </a>
            ) : (
              <span className="text-muted">stored; download link unavailable right now</span>
            )}
          </li>
        ))}
      </ul>
      <RefreshButton label="Check again" />
    </div>
  );
}
