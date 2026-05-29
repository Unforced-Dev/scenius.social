/**
 * Run the orphan sweep once. In production this runs on a ~30s cron; here it's
 * a manual/cron-able entrypoint.
 *
 *   DATABASE_URL=... npx tsx scripts/orphan-sweep.ts [ttlMs]
 */
import { runOrphanSweep } from "../lib/scenius/sweep";

async function main() {
  const ttl = process.argv[2] ? Number(process.argv[2]) : undefined;
  const result = await runOrphanSweep(ttl);
  console.log(
    `orphan sweep: checked=${result.checked} promoted=${result.promoted} rolledBack=${result.rolledBack} skipped=${result.skipped}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("orphan sweep failed:", err);
  process.exit(1);
});
