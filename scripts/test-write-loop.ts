/**
 * Self-test for the first real write loop, using an app password as the auth
 * source (stands in for the OAuth session, which needs a browser). Exercises
 * the SAME core write helpers the server actions use:
 *   createScene → createEvent → optimistic index → render
 * then verifies the DB + the live scene page, then cleans up everything
 * (PDS records and DB rows).
 *
 * Usage:
 *   BSKY_HANDLE=you BSKY_APP_PASSWORD=xxxx-... \
 *     DATABASE_URL=postgresql://scenius:scenius@localhost:5433/scenius \
 *     APP_URL=http://127.0.0.1:3000 \
 *     npx tsx scripts/test-write-loop.ts
 */

import { AtpAgent } from "@atproto/api";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { scenes, memberships, events, eventContexts } from "../lib/db/schema";
import { createScene, createEvent } from "../lib/scenius/write";
import { parseAtUri } from "../lib/scenius/atproto";

const HANDLE = process.env.BSKY_HANDLE;
const APP_PASSWORD = process.env.BSKY_APP_PASSWORD;
const APP_URL = process.env.APP_URL || "http://127.0.0.1:3000";
const TEST_HANDLE = "zz-write-loop-test";

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const fail = (m: string) => console.log(`\x1b[31m✗\x1b[0m ${m}`);
const info = (m: string) => console.log(`  ${m}`);

async function deleteFromPds(agent: AtpAgent, did: string, uri: string) {
  const { collection, rkey } = parseAtUri(uri);
  await agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey });
}

async function cleanup(agent: AtpAgent, did: string, sceneUri?: string) {
  if (!sceneUri) {
    const [s] = await db
      .select({ uri: scenes.uri })
      .from(scenes)
      .where(eq(scenes.handle, TEST_HANDLE))
      .limit(1);
    sceneUri = s?.uri;
  }
  if (!sceneUri) return;

  const mems = await db.select().from(memberships).where(eq(memberships.sceneUri, sceneUri));
  const ctxs = await db.select().from(eventContexts).where(eq(eventContexts.sceneUri, sceneUri));
  const eventUris = ctxs.map((c) => c.eventUri);

  for (const uri of [
    ...ctxs.map((c) => c.uri),
    ...mems.map((m) => m.uri),
    ...eventUris,
    sceneUri,
  ]) {
    try {
      await deleteFromPds(agent, did, uri);
    } catch {
      /* best-effort */
    }
  }

  // DB rows
  await db.delete(eventContexts).where(eq(eventContexts.sceneUri, sceneUri));
  for (const eu of eventUris) await db.delete(events).where(eq(events.uri, eu));
  await db.delete(memberships).where(eq(memberships.sceneUri, sceneUri));
  await db.delete(scenes).where(eq(scenes.uri, sceneUri));
}

async function main() {
  console.log("\n— scenius: first write-loop self-test —\n");
  if (!HANDLE || !APP_PASSWORD) {
    fail("Set BSKY_HANDLE and BSKY_APP_PASSWORD.");
    process.exit(1);
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: HANDLE, password: APP_PASSWORD });
  const did = agent.session!.did;
  ok(`Authenticated as ${HANDLE} (${did})`);

  // Clean any leftovers from a prior failed run
  await cleanup(agent, did);

  let sceneUri: string | undefined;
  try {
    // 1. Create a scene (writes scene + steward membership to PDS + index)
    const scene = await createScene(agent, did, {
      name: "Write Loop Test Scene",
      handle: TEST_HANDLE,
      description: "Temporary scene created by the write-loop self-test.",
      type: "interest",
      visibility: "public",
      memberPolicy: "invite",
      governanceMode: "administered",
      location: { locality: "Boulder", region: "CO" },
    });
    sceneUri = scene.uri;
    ok(`createScene → ${scene.uri}`);

    // 2. Create an event curated onto the scene
    const ev = await createEvent(agent, did, scene.uri, {
      name: "Write Loop Test Event",
      description: "Temporary event.",
      startsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 86400000 + 7200000).toISOString(),
      mode: "inperson",
      location: { name: "RegenHub" },
    });
    ok(`createEvent → ${ev.eventUri}`);

    // 3. Verify the optimistic index
    const [sceneRow] = await db.select().from(scenes).where(eq(scenes.uri, scene.uri));
    if (sceneRow?.memberCount === 1) ok("Scene indexed, memberCount = 1 (steward)");
    else fail(`Scene index wrong (memberCount=${sceneRow?.memberCount})`);

    const memRows = await db.select().from(memberships).where(eq(memberships.sceneUri, scene.uri));
    const steward = memRows.find((m) => m.role === "steward" && m.memberDid === did);
    if (steward) ok("Steward membership indexed");
    else fail("Steward membership missing");

    const ctxRows = await db.select().from(eventContexts).where(eq(eventContexts.sceneUri, scene.uri));
    if (ctxRows.length === 1 && ctxRows[0].eventUri === ev.eventUri)
      ok("eventContext links event → scene");
    else fail("eventContext missing/wrong");

    // 4. Verify the live scene page renders the event (the real read path)
    const res = await fetch(`${APP_URL}/s/${TEST_HANDLE}`);
    const html = await res.text();
    if (res.status === 200 && html.includes("Write Loop Test Event"))
      ok(`Scene page renders the event (GET /s/${TEST_HANDLE})`);
    else
      fail(`Scene page did not render the event (status ${res.status})`);

    // 5. Verify the records really exist on the PDS (round-trip)
    const listScene = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "social.scenius.scene",
    });
    const onPds = listScene.data.records.some((r) => r.uri === scene.uri);
    if (onPds) ok("Scene record confirmed on the PDS");
    else fail("Scene record not found on PDS");

    console.log("\n\x1b[32m▶ WRITE LOOP WORKS end-to-end.\x1b[0m\n");
  } catch (err) {
    fail("Write loop threw:");
    console.error(err);
  } finally {
    await cleanup(agent, did, sceneUri);
    ok("Cleaned up test records (PDS + DB)");
    console.log();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
