/**
 * End-to-end Luma-import gate (real PDS): create a scene, import a synthetic
 * Luma-style ICS, verify the events landed on the scene calendar with correct
 * times, confirm idempotency, then clean up.
 *   BSKY_HANDLE=… BSKY_APP_PASSWORD=… DATABASE_URL=… npx tsx scripts/test-import.ts
 */
import { AtpAgent } from "@atproto/api";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { scenes, memberships, events, eventContexts, acceptances, eventInventory } from "../lib/db/schema";
import { parseAtUri } from "../lib/scenius/atproto";
import { createScene } from "../lib/scenius/write";
import { importEventsFromIcs } from "../lib/scenius/import";
import { searchEvents } from "../lib/scenius/discover";

const HANDLE = "zz-import-test";
const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => { console.log(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
let failed = false;

// two future events, Luma-style (one TZID, one UTC)
function sampleIcs(): string {
  const y = new Date().getUTCFullYear() + 1;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Luma//EN",
    "BEGIN:VEVENT", "UID:luma-a", "SUMMARY:Imported Regen Salon",
    `DTSTART;TZID=America/Denver:${y}1015T180000`, `DTEND;TZID=America/Denver:${y}1015T200000`,
    "LOCATION:The Greenhouse", "DESCRIPTION:Monthly salon", "END:VEVENT",
    "BEGIN:VEVENT", "UID:luma-b", "SUMMARY:Imported Soil Workshop",
    `DTSTART:${y}1020T010000Z`, "LOCATION:RegenHub Lab", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

async function cleanup(agent: AtpAgent, did: string) {
  const [s] = await db.select().from(scenes).where(eq(scenes.handle, HANDLE)).limit(1);
  if (!s) return;
  const ctxs = await db.select().from(eventContexts).where(eq(eventContexts.sceneUri, s.uri));
  const mems = await db.select().from(memberships).where(eq(memberships.sceneUri, s.uri));
  const eventUris = ctxs.map((c) => c.eventUri);
  for (const uri of [...ctxs.map((c) => c.uri), ...mems.map((m) => m.uri), ...eventUris, s.uri]) {
    try {
      const { did: owner, collection, rkey } = parseAtUri(uri);
      if (owner === did) await agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey });
    } catch { /* best-effort */ }
  }
  if (eventUris.length) {
    await db.delete(acceptances).where(inArray(acceptances.eventUri, eventUris));
    await db.delete(eventInventory).where(inArray(eventInventory.eventUri, eventUris));
  }
  await db.delete(eventContexts).where(eq(eventContexts.sceneUri, s.uri));
  for (const e of eventUris) await db.delete(events).where(eq(events.uri, e));
  await db.delete(memberships).where(eq(memberships.sceneUri, s.uri));
  await db.delete(scenes).where(eq(scenes.uri, s.uri));
}

async function main() {
  console.log("\n— scenius: Luma import gate —\n");
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: process.env.BSKY_HANDLE!, password: process.env.BSKY_APP_PASSWORD! });
  const did = agent.session!.did;
  await cleanup(agent, did);

  try {
    const scene = await createScene(agent, did, {
      name: "Import Test Scene", handle: HANDLE, type: "hybrid",
      visibility: "public", memberPolicy: "invite", governanceMode: "administered",
      location: { locality: "Boulder", region: "CO" },
    });
    ok(`created scene ${HANDLE}`);

    const r1 = await importEventsFromIcs(agent, did, scene.uri, sampleIcs());
    r1.created === 2 && r1.failed === 0
      ? ok(`imported 2 events (parsed ${r1.parsed})`)
      : bad(`import wrong: ${JSON.stringify(r1)}`);

    // verify they're on the scene calendar via the discovery layer
    const found = await searchEvents({ scene: HANDLE, limit: 10 });
    found.some((e) => e.name === "Imported Regen Salon") && found.some((e) => e.name === "Imported Soil Workshop")
      ? ok("both imported events appear on the scene calendar (discoverable)")
      : bad(`events not discoverable: ${found.map((e) => e.name).join(", ")}`);

    // tzid preserved (Denver) on the TZID event → renders correct wall-clock
    const salon = found.find((e) => e.name === "Imported Regen Salon");
    salon?.tzid === "America/Denver" ? ok("imported event preserves tzid (America/Denver)") : bad(`tzid lost: ${salon?.tzid}`);

    // idempotency: re-import → everything skipped, nothing duplicated
    const r2 = await importEventsFromIcs(agent, did, scene.uri, sampleIcs());
    r2.created === 0 && r2.skipped === 2
      ? ok("re-import is idempotent (0 created, 2 skipped)")
      : bad(`re-import not idempotent: ${JSON.stringify(r2)}`);
  } catch (err) {
    bad("import flow threw: " + (err instanceof Error ? err.message : String(err)));
  } finally {
    await cleanup(agent, did);
    ok("cleaned up");
  }

  console.log(failed ? "\n\x1b[31m▶ IMPORT GATE FAILED\x1b[0m\n" : "\n\x1b[32m▶ IMPORT GATE PASSED\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
