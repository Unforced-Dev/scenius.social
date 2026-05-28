/**
 * Phase 0 verification — THE load-bearing test for scenius's architecture.
 *
 * Question: will bsky.social's PDS accept writes to a custom `social.scenius.*`
 * lexicon collection? The entire "no PDS, just an AppView" architecture depends
 * on this. If it fails, we need to run our own PDS for scenius records.
 *
 * This writes one `social.scenius.scene` record to a real account, reads it
 * back, and deletes it (cleanup). It reports clearly which step failed.
 *
 * Usage:
 *   1. Create an app password at https://bsky.app/settings/app-passwords
 *      (a throwaway/test account is ideal, but cleanup makes any account safe)
 *   2. Run:
 *      BSKY_HANDLE=you.bsky.social BSKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
 *        npm run verify:pds
 *   (or put BSKY_HANDLE / BSKY_APP_PASSWORD in .env — it's gitignored)
 */

import { AtpAgent } from "@atproto/api";

const HANDLE = process.env.BSKY_HANDLE;
const APP_PASSWORD = process.env.BSKY_APP_PASSWORD;
const SERVICE = process.env.BSKY_SERVICE || "https://bsky.social";
const COLLECTION = "social.scenius.scene";

function ok(msg: string) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg: string) {
  console.log(`\x1b[31m✗\x1b[0m ${msg}`);
}
function info(msg: string) {
  console.log(`  ${msg}`);
}

async function main() {
  console.log("\n— scenius Phase 0: custom-lexicon PDS write verification —\n");

  if (!HANDLE || !APP_PASSWORD) {
    fail("Missing credentials.");
    info("Set BSKY_HANDLE and BSKY_APP_PASSWORD (app password from");
    info("https://bsky.app/settings/app-passwords). A throwaway account is ideal.");
    process.exit(1);
  }

  const agent = new AtpAgent({ service: SERVICE });

  // Step 1: authenticate
  let did: string;
  try {
    await agent.login({ identifier: HANDLE, password: APP_PASSWORD });
    did = agent.session!.did;
    ok(`Authenticated as ${HANDLE}`);
    info(`DID: ${did}`);
    info(`PDS service: ${SERVICE}`);
  } catch (err) {
    fail("Authentication failed.");
    info(err instanceof Error ? err.message : String(err));
    info("Check the handle and app password. This is NOT the architecture test —");
    info("it's just login. Fix creds and re-run.");
    process.exit(1);
  }

  // Step 2: the actual test — write a custom-lexicon record
  const now = new Date().toISOString();
  const record = {
    $type: COLLECTION,
    name: "scenius PDS write test (safe to delete)",
    handle: "verify-test-scene",
    description:
      "Temporary record written by scripts/verify-pds-write.ts to confirm " +
      "bsky.social accepts social.scenius.* writes. Auto-deleted.",
    type: "interest",
    visibility: "public",
    memberPolicy: "invite",
    governanceMode: "administered",
    createdAt: now,
  };

  let rkey: string;
  try {
    const res = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: COLLECTION,
      record,
    });
    const uri = res.data.uri;
    rkey = uri.split("/").pop()!;
    ok(`Wrote a ${COLLECTION} record`);
    info(`URI: ${uri}`);
    info(`CID: ${res.data.cid}`);
  } catch (err) {
    fail(`bsky.social REJECTED the custom-lexicon write.`);
    info(err instanceof Error ? err.message : String(err));
    console.log("\n\x1b[33m▶ ARCHITECTURE IMPACT:\x1b[0m the no-PDS plan does NOT hold as-is.");
    info("Fallback: run a small dedicated scenius PDS for social.scenius.* records,");
    info("while still using bsky.social for identity. This is recoverable but is a");
    info("meaningfully different build. Report this result before proceeding.");
    process.exit(2);
  }

  // Step 3: read it back
  try {
    const got = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: COLLECTION,
      rkey,
    });
    const gotName = (got.data.value as { name?: string }).name;
    if (gotName === record.name) {
      ok("Read the record back — content matches");
    } else {
      fail("Read back, but content did not match (unexpected).");
      info(`got name: ${gotName}`);
    }
  } catch (err) {
    fail("Wrote the record but could not read it back.");
    info(err instanceof Error ? err.message : String(err));
  }

  // Step 4: confirm it appears in the repo listing (what Tap/firehose would see)
  try {
    const list = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: COLLECTION,
    });
    ok(`Collection lists ${list.data.records.length} record(s) — firehose-visible`);
  } catch (err) {
    info("(Could not list collection; non-fatal)");
    info(err instanceof Error ? err.message : String(err));
  }

  // Step 5: cleanup
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: COLLECTION,
      rkey,
    });
    ok("Cleaned up the test record");
  } catch (err) {
    fail("Could not delete the test record — please remove it manually.");
    info(`rkey: ${rkey}`);
    info(err instanceof Error ? err.message : String(err));
  }

  console.log("\n\x1b[32m▶ RESULT: bsky.social ACCEPTS social.scenius.* writes.\x1b[0m");
  console.log("  The no-PDS architecture holds. Safe to build the real write loop.\n");
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
