/**
 * Delete a scene by handle — its PDS records (scene, membership, events,
 * eventContexts, eventConfigs, rsvps) and all derived DB rows. For tearing down
 * test/walkthrough scenes.
 *   BSKY_HANDLE=... BSKY_APP_PASSWORD=... DATABASE_URL=... \
 *     npx tsx scripts/cleanup-scene.ts <handle>
 */
import { AtpAgent } from "@atproto/api";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import {
  scenes, memberships, events, eventContexts, rsvps, acceptances, eventInventory,
} from "../lib/db/schema";
import { parseAtUri } from "../lib/scenius/atproto";

async function main() {
  const handle = process.argv[2];
  if (!handle) { console.error("usage: cleanup-scene.ts <handle>"); process.exit(1); }
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: process.env.BSKY_HANDLE!, password: process.env.BSKY_APP_PASSWORD! });
  const did = agent.session!.did;

  const [s] = await db.select().from(scenes).where(eq(scenes.handle, handle)).limit(1);
  if (!s) { console.log("no such scene:", handle); process.exit(0); }

  const mems = await db.select().from(memberships).where(eq(memberships.sceneUri, s.uri));
  const ctxs = await db.select().from(eventContexts).where(eq(eventContexts.sceneUri, s.uri));
  const eventUris = ctxs.map((c) => c.eventUri);
  const rs = eventUris.length ? await db.select().from(rsvps).where(inArray(rsvps.eventUri, eventUris)) : [];

  // delete PDS records (only those in our repo)
  const uris = [...rs.map((r) => r.uri), ...ctxs.map((c) => c.uri), ...mems.map((m) => m.uri), ...eventUris, s.uri];
  for (const uri of uris) {
    try {
      const { did: owner, collection, rkey } = parseAtUri(uri);
      if (owner === did) await agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey });
    } catch { /* best-effort */ }
  }
  // also try to delete any eventConfig records (deterministic? no — list + match event)
  for (const ev of eventUris) {
    try {
      const list = await agent.com.atproto.repo.listRecords({ repo: did, collection: "social.scenius.eventConfig" });
      for (const rec of list.data.records) {
        const evt = (rec.value as { event?: { uri?: string } }).event?.uri;
        if (evt === ev) {
          const { collection, rkey } = parseAtUri(rec.uri);
          await agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey });
        }
      }
    } catch { /* best-effort */ }
  }

  // DB rows
  if (eventUris.length) {
    await db.delete(rsvps).where(inArray(rsvps.eventUri, eventUris));
    await db.delete(acceptances).where(inArray(acceptances.eventUri, eventUris));
    await db.delete(eventInventory).where(inArray(eventInventory.eventUri, eventUris));
  }
  await db.delete(eventContexts).where(eq(eventContexts.sceneUri, s.uri));
  for (const ev of eventUris) await db.delete(events).where(eq(events.uri, ev));
  await db.delete(memberships).where(eq(memberships.sceneUri, s.uri));
  await db.delete(scenes).where(eq(scenes.uri, s.uri));

  console.log(`cleaned scene "${handle}": ${eventUris.length} events, ${mems.length} memberships, ${rs.length} rsvps`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
