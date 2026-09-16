/**
 * Cost per couple run (cost control 7). Usage: pnpm cost:report <coupleId>
 */
import "dotenv/config";
import { costReportForCouple } from "@/lib/data";

async function main() {
  const coupleId = process.argv[2];
  if (!coupleId) {
    console.error("usage: pnpm cost:report <coupleId>");
    process.exit(2);
  }
  const report = await costReportForCouple(coupleId);
  console.table(report.rows.map((r) => ({ ...r, usd: r.usd.toFixed(4) })));
  console.log(`total: ${report.total_calls} call(s), $${report.total_usd.toFixed(4)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
