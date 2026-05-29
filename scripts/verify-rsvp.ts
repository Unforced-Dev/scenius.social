/**
 * Verify RSVP works on the (now real) seeded events — the exact path that was
 * failing with "Could not find repo". Logs in, RSVPs to a seeded event,
 * confirms a seat, then cancels (leaves the seed clean).
 *   BSKY_HANDLE=… BSKY_APP_PASSWORD=… DATABASE_URL=… npx tsx scripts/verify-rsvp.ts
 */
import { AtpAgent } from "@atproto/api";
import { eq, asc } from "drizzle-orm";
import { db } from "../lib/db";
import { events, eventContexts, scenes } from "../lib/db/schema";
import { createRsvp, cancelRsvp } from "../lib/scenius/write";
import { getSeatState } from "../lib/scenius/queries";

async function main() {
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: process.env.BSKY_HANDLE!, password: process.env.BSKY_APP_PASSWORD! });
  const did = agent.session!.did;

  // a seeded event on the techne scene
  const [row] = await db
    .select({ uri: events.uri, name: events.name })
    .from(events)
    .innerJoin(eventContexts, eq(events.uri, eventContexts.eventUri))
    .innerJoin(scenes, eq(eventContexts.sceneUri, scenes.uri))
    .where(eq(scenes.handle, "techne"))
    .orderBy(asc(events.startsAt))
    .limit(1);
  if (!row) { console.log("✗ no seeded techne event found"); process.exit(1); }
  console.log(`RSVPing to "${row.name}"\n  ${row.uri}`);

  await createRsvp(agent, did, row.uri, "going");
  const seat = await getSeatState(row.uri, did);
  console.log(seat?.state === "confirmed" ? "\x1b[32m✓ RSVP confirmed (resolveStrongRef on the real event repo worked)\x1b[0m" : `\x1b[31m✗ seat: ${JSON.stringify(seat)}\x1b[0m`);

  await cancelRsvp(agent, did, row.uri);
  const seat2 = await getSeatState(row.uri, did);
  console.log(!seat2 || seat2.state === "declined" ? "\x1b[32m✓ cancel released the seat (seed left clean)\x1b[0m" : `\x1b[31m✗ not released: ${JSON.stringify(seat2)}\x1b[0m`);

  process.exit(seat?.state === "confirmed" ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
