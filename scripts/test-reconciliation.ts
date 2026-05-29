/**
 * Reconciliation self-test — exercises the indexer's ordering/idempotency rules
 * WITHOUT needing Tap running, by calling indexScene/applyDelete directly with
 * synthetic firehose events. This is the firehose path's correctness gate:
 * "replay the firehose twice → identical index."
 *
 *   DATABASE_URL=... npx tsx scripts/test-reconciliation.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { scenes, tombstones } from "../lib/db/schema";
import { indexScene, applyDelete } from "../lib/scenius/indexer";

const DID = "did:plc:zzrecontest";
const URI = `at://${DID}/social.scenius.scene/recon1`;
const COLL = "social.scenius.scene";

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => {
  console.log(`\x1b[31m✗ ${m}\x1b[0m`);
  failed = true;
};
let failed = false;

function rec(name: string) {
  return {
    $type: COLL,
    name,
    handle: "zz-recon",
    visibility: "public",
    memberPolicy: "invite",
    governanceMode: "administered",
    createdAt: "2026-05-28T00:00:00.000Z",
  };
}

async function nameOf(): Promise<string | null> {
  const [r] = await db.select().from(scenes).where(eq(scenes.uri, URI)).limit(1);
  return r?.name ?? null;
}
async function rowOf() {
  const [r] = await db.select().from(scenes).where(eq(scenes.uri, URI)).limit(1);
  return r ?? null;
}

async function cleanup() {
  await db.delete(scenes).where(eq(scenes.uri, URI));
  await db.delete(tombstones).where(eq(tombstones.uri, URI));
}

async function main() {
  console.log("\n— scenius: reconciliation self-test —\n");
  await cleanup();
  const now = new Date();

  // 1. firehose insert
  await indexScene(URI, DID, rec("V1"), { source: "firehose", rev: "r1", cid: "cidA", now });
  (await nameOf()) === "V1" ? ok("firehose insert") : bad("firehose insert");
  (await rowOf())?.source === "firehose" ? ok("source=firehose") : bad("source not firehose");
  (await rowOf())?.confirmedAt ? ok("firehose row confirmed") : bad("firehose row not confirmed");

  // 2. idempotent replay (same rev) — no change
  await indexScene(URI, DID, rec("V1-replay"), { source: "firehose", rev: "r1", cid: "cidA", now });
  (await nameOf()) === "V1" ? ok("idempotent replay (same rev ignored)") : bad("replay changed state");

  // 3. higher rev wins
  await indexScene(URI, DID, rec("V2"), { source: "firehose", rev: "r2", cid: "cidB", now });
  (await nameOf()) === "V2" ? ok("higher rev wins") : bad("higher rev did not win");

  // 4. lower rev ignored
  await indexScene(URI, DID, rec("V0"), { source: "firehose", rev: "r0", cid: "cid0", now });
  (await nameOf()) === "V2" ? ok("lower rev ignored") : bad("lower rev overwrote");

  // 5. optimistic must NOT clobber a firehose row
  await indexScene(URI, DID, rec("Vopt"), { source: "optimistic", cid: "cidOpt", now });
  (await nameOf()) === "V2" ? ok("optimistic does not clobber firehose") : bad("optimistic clobbered firehose");

  // 6. delete → tombstone; row gone
  await applyDelete(URI, COLL, "r3", now);
  (await rowOf()) === null ? ok("delete removed the row") : bad("delete left a row");
  const [tomb] = await db.select().from(tombstones).where(eq(tombstones.uri, URI)).limit(1);
  tomb ? ok("tombstone written") : bad("no tombstone");

  // 7. stale create cannot resurrect (rev <= tombstone rev)
  await indexScene(URI, DID, rec("Vresurrect-stale"), { source: "firehose", rev: "r3", cid: "x", now });
  (await rowOf()) === null ? ok("stale create cannot resurrect tombstone") : bad("tombstone resurrected by stale rev");

  // 8. genuinely newer create resurrects + clears tombstone
  await indexScene(URI, DID, rec("V4"), { source: "firehose", rev: "r4", cid: "y", now });
  (await nameOf()) === "V4" ? ok("newer rev resurrects") : bad("newer rev did not resurrect");
  const [tomb2] = await db.select().from(tombstones).where(eq(tombstones.uri, URI)).limit(1);
  !tomb2 ? ok("tombstone cleared on resurrect") : bad("tombstone not cleared");

  // 9. fresh optimistic → firehose promotion path
  await cleanup();
  await indexScene(URI, DID, rec("Opt1"), { source: "optimistic", cid: "o1", now });
  const optRow = await rowOf();
  optRow?.source === "optimistic" && optRow?.pendingSince && !optRow?.confirmedAt
    ? ok("optimistic insert: pending, unconfirmed")
    : bad("optimistic insert state wrong");
  await indexScene(URI, DID, rec("Opt1"), { source: "firehose", rev: "r1", cid: "o1", now });
  const confRow = await rowOf();
  confRow?.source === "firehose" && confRow?.confirmedAt
    ? ok("firehose confirms the optimistic row")
    : bad("firehose did not confirm optimistic row");

  await cleanup();
  console.log(failed ? "\n\x1b[31m▶ RECONCILIATION TEST FAILED\x1b[0m\n" : "\n\x1b[32m▶ RECONCILIATION OK\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
