/**
 * Capacity keystone correctness gate. Exercises the indexer-side FOR UPDATE
 * arbitration WITHOUT Tap, by calling indexRsvp/indexEventConfig directly:
 *   - CONCURRENT mixed-origin RSVPs to a capacity-limited event → exactly
 *     capacity confirmed, contiguous waitlist, zero oversell
 *   - idempotent replay (firehose echo) → no double-count, no queue movement
 *   - release a confirmed seat → no auto-promote (Luma default)
 *   - approval mode → requested consumes no seat; host approve → confirmed
 *
 *   DATABASE_URL=... npx tsx scripts/test-capacity.ts
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { eventInventory, acceptances, rsvps, tombstones, events } from "../lib/db/schema";
import { indexRsvp, indexEventConfig, arbitrateSeat, approveRequest } from "../lib/scenius/indexer";

const HOST = "did:plc:cap-host";
const EVENT_A = `at://${HOST}/community.lexicon.calendar.event/capA`;
const EVENT_B = `at://${HOST}/community.lexicon.calendar.event/capB`;
const CONFIG_A = `at://${HOST}/social.scenius.eventConfig/cfgA`;
const CONFIG_B = `at://${HOST}/social.scenius.eventConfig/cfgB`;

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => { console.log(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
let failed = false;

const attendees = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => `did:plc:${prefix}-${String(i).padStart(2, "0")}`);

function rsvpRecord(eventUri: string, status = "going") {
  return { $type: "community.lexicon.calendar.rsvp", subject: { uri: eventUri }, status, createdAt: "2026-05-28T00:00:00.000Z" };
}
const rsvpUri = (did: string, ev: string) => `at://${did}/community.lexicon.calendar.rsvp/${ev.split("/").pop()}`;

async function counts(eventUri: string) {
  const [inv] = await db.select().from(eventInventory).where(eq(eventInventory.eventUri, eventUri)).limit(1);
  const accs = await db.select().from(acceptances).where(eq(acceptances.eventUri, eventUri));
  const by = (s: string) => accs.filter((a) => a.state === s);
  return { inv, confirmed: by("confirmed").length, waitlisted: by("waitlisted"), requested: by("requested").length, declined: by("declined").length };
}

async function cleanup() {
  for (const ev of [EVENT_A, EVENT_B]) {
    await db.delete(acceptances).where(eq(acceptances.eventUri, ev));
    await db.delete(eventInventory).where(eq(eventInventory.eventUri, ev));
    await db.delete(events).where(eq(events.uri, ev));
  }
  const allDids = [...attendees(10, "capA"), ...attendees(4, "capB")];
  await db.delete(rsvps).where(inArray(rsvps.authorDid, allDids));
  await db.delete(tombstones).where(inArray(tombstones.uri, allDids.flatMap((d) => [rsvpUri(d, EVENT_A), rsvpUri(d, EVENT_B)])));
}

async function insertEvent(uri: string) {
  await db
    .insert(events)
    .values({
      uri,
      authorDid: HOST,
      name: "Capacity Test Event",
      startsAt: new Date("2026-06-01T00:00:00Z"),
      status: "scheduled",
      createdAt: new Date("2026-05-28T00:00:00Z"),
    })
    .onConflictDoNothing();
}

async function main() {
  console.log("\n— scenius: capacity keystone gate —\n");
  await cleanup();
  const now = new Date();

  // --- Event A: capacity 3, waitlist on. 10 concurrent mixed-origin RSVPs. ---
  await insertEvent(EVENT_A);
  await indexEventConfig(CONFIG_A, HOST, { event: { uri: EVENT_A }, maxAttendees: 3, waitlistEnabled: true }, { source: "firehose", rev: "c1", now });
  const aDids = attendees(10, "capA");
  await Promise.all(
    aDids.map((did, i) =>
      indexRsvp(rsvpUri(did, EVENT_A), did, rsvpRecord(EVENT_A), {
        source: i % 2 === 0 ? "optimistic" : "firehose", // mixed origins
        rev: `r${i}`,
        now,
      }),
    ),
  );
  let c = await counts(EVENT_A);
  c.confirmed === 3 ? ok(`exactly 3 confirmed of 10 (cap 3)`) : bad(`oversell/undersell: ${c.confirmed} confirmed`);
  c.waitlisted.length === 7 ? ok(`7 waitlisted`) : bad(`waitlist count wrong: ${c.waitlisted.length}`);
  const positions = c.waitlisted.map((w) => w.position).sort((a, b) => (a ?? 0) - (b ?? 0));
  const expected = [1, 2, 3, 4, 5, 6, 7];
  JSON.stringify(positions) === JSON.stringify(expected)
    ? ok(`waitlist positions contiguous 1..7, no dupes/gaps`)
    : bad(`waitlist positions wrong: ${JSON.stringify(positions)}`);

  // --- Idempotent replay: re-deliver all 10 as firehose echoes ---
  await Promise.all(aDids.map((did, i) => indexRsvp(rsvpUri(did, EVENT_A), did, rsvpRecord(EVENT_A), { source: "firehose", rev: `r${i}`, now })));
  c = await counts(EVENT_A);
  c.confirmed === 3 && c.waitlisted.length === 7 && (c.inv?.waitlistSeq === 7)
    ? ok(`idempotent replay: still 3 confirmed, 7 waitlisted, seq unmoved (${c.inv?.waitlistSeq})`)
    : bad(`replay moved state: confirmed=${c.confirmed} wl=${c.waitlisted.length} seq=${c.inv?.waitlistSeq}`);

  // --- Release a confirmed seat → no auto-promote ---
  const confirmedDid = (await db.select().from(acceptances).where(eq(acceptances.eventUri, EVENT_A)))
    .find((a) => a.state === "confirmed")!.attendeeDid;
  await arbitrateSeat(EVENT_A, confirmedDid, rsvpUri(confirmedDid, EVENT_A), "notgoing", now);
  c = await counts(EVENT_A);
  c.confirmed === 2 && c.waitlisted.length === 7
    ? ok(`release frees seat, NO auto-promote (2 confirmed, 7 still waitlisted)`)
    : bad(`release wrong: confirmed=${c.confirmed} waitlisted=${c.waitlisted.length}`);

  // --- eventConfig authz: a non-host's config for EVENT_A must be rejected ---
  await indexEventConfig(`at://did:plc:attacker/social.scenius.eventConfig/x`, "did:plc:attacker", { event: { uri: EVENT_A }, maxAttendees: 999 }, { source: "firehose", rev: "evil", now });
  const [invA] = await db.select().from(eventInventory).where(eq(eventInventory.eventUri, EVENT_A)).limit(1);
  invA?.capacity === 3 ? ok(`unauthorized eventConfig rejected (capacity still 3, not 999)`) : bad(`attacker overrode capacity: ${invA?.capacity}`);

  // --- Event B: approval mode, capacity 2 ---
  await insertEvent(EVENT_B);
  await indexEventConfig(CONFIG_B, HOST, { event: { uri: EVENT_B }, maxAttendees: 2, approvalRequired: true, waitlistEnabled: true }, { source: "firehose", rev: "c2", now });
  const bDids = attendees(4, "capB");
  await Promise.all(bDids.map((did, i) => indexRsvp(rsvpUri(did, EVENT_B), did, rsvpRecord(EVENT_B), { source: "firehose", rev: `b${i}`, now })));
  c = await counts(EVENT_B);
  c.confirmed === 0 && c.requested === 4 && c.inv?.confirmedCount === 0
    ? ok(`approval mode: 4 requested, 0 confirmed, 0 seats consumed`)
    : bad(`approval wrong: confirmed=${c.confirmed} requested=${c.requested}`);

  // host approves two → confirmed; third → waitlisted (cap 2 full);
  await approveRequest(EVENT_B, bDids[0], "confirm", HOST, now);
  await approveRequest(EVENT_B, bDids[1], "confirm", HOST, now);
  const third = await approveRequest(EVENT_B, bDids[2], "confirm", HOST, now);
  c = await counts(EVENT_B);
  c.confirmed === 2 ? ok(`host approved 2 → 2 confirmed (cap honored under approval)`) : bad(`approve confirmed=${c.confirmed}`);
  c.waitlisted.length === 1 ? ok(`3rd approval waitlisted (full): ${third.reason}`) : bad(`3rd approval state wrong (wl=${c.waitlisted.length})`);

  // --- approveRequest authz: a non-host caller must be rejected ---
  const evil = await approveRequest(EVENT_B, bDids[3], "confirm", "did:plc:attacker", now);
  !evil.ok && evil.reason === "not authorized" ? ok(`approveRequest rejects non-host caller`) : bad(`approveRequest authz failed: ${JSON.stringify(evil)}`);

  await cleanup();
  console.log(failed ? "\n\x1b[31m▶ CAPACITY GATE FAILED\x1b[0m\n" : "\n\x1b[32m▶ CAPACITY GATE PASSED\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
