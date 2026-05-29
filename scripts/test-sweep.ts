/**
 * Orphan-sweep self-test: a bogus optimistic row (no PDS record behind it) must
 * be rolled back; firehose rows must be untouched.
 *   DATABASE_URL=... npx tsx scripts/test-sweep.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { scenes } from "../lib/db/schema";
import { runOrphanSweep } from "../lib/scenius/sweep";

const BOGUS = "at://did:plc:zzsweeptest/social.scenius.scene/bogus1";
const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => { console.log(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
let failed = false;

async function main() {
  console.log("\n— scenius: orphan-sweep self-test —\n");
  await db.delete(scenes).where(eq(scenes.uri, BOGUS));

  // a real seed scene (firehose source) that must NOT be touched
  const [seed] = await db.select().from(scenes).where(eq(scenes.handle, "techne")).limit(1);

  // insert a bogus optimistic, unconfirmed, already-past-TTL row
  await db.insert(scenes).values({
    uri: BOGUS,
    authorDid: "did:plc:zzsweeptest",
    name: "Bogus optimistic scene",
    handle: "zz-sweep-bogus",
    visibility: "public",
    memberPolicy: "invite",
    governanceMode: "administered",
    createdAt: new Date("2026-05-28T00:00:00Z"),
    source: "optimistic",
    pendingSince: new Date("2026-05-28T00:00:00Z"),
    confirmedAt: null,
  });
  ok("inserted bogus optimistic row");

  const res = await runOrphanSweep(0); // ttl=0 → everything optimistic-unconfirmed is eligible
  console.log(`  sweep: checked=${res.checked} promoted=${res.promoted} rolledBack=${res.rolledBack} skipped=${res.skipped}`);

  const [gone] = await db.select().from(scenes).where(eq(scenes.uri, BOGUS)).limit(1);
  !gone ? ok("bogus row rolled back (deleted)") : bad("bogus row survived the sweep");

  if (seed) {
    const [stillThere] = await db.select().from(scenes).where(eq(scenes.uri, seed.uri)).limit(1);
    stillThere ? ok("firehose seed row untouched") : bad("sweep deleted a firehose row!");
  }

  await db.delete(scenes).where(eq(scenes.uri, BOGUS));
  console.log(failed ? "\n\x1b[31m▶ SWEEP TEST FAILED\x1b[0m\n" : "\n\x1b[32m▶ SWEEP OK\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
