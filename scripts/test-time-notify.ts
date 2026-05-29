/**
 * T2 gate: timezone-correct rendering (incl. DST) + the notification scheduler
 * (enqueue → due → lease → send-once → re-check seat).
 *   DATABASE_URL=... npx tsx scripts/test-time-notify.ts
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { events, eventInventory, acceptances, contactChannels, notificationJobs } from "../lib/db/schema";
import { formatEventDateTime, formatEventTime } from "../lib/scenius/time";
import { enqueueReminders, runScheduler } from "../lib/scenius/notify";

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => { console.log(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
let failed = false;

const DID = "did:plc:tz-test";
const EVENT = `at://${DID}/community.lexicon.calendar.event/tz1`;

async function cleanup() {
  await db.delete(notificationJobs).where(eq(notificationJobs.eventUri, EVENT));
  await db.delete(acceptances).where(eq(acceptances.eventUri, EVENT));
  await db.delete(eventInventory).where(eq(eventInventory.eventUri, EVENT));
  await db.delete(events).where(eq(events.uri, EVENT));
  await db.delete(contactChannels).where(inArray(contactChannels.did, [DID]));
}

async function main() {
  console.log("\n— scenius: timezone + notification gate —\n");
  await cleanup();

  // --- 1. Timezone correctness (incl. DST) ---
  // 7:00 PM Denver in June (MDT, UTC-6) = 01:00 UTC next day.
  const juneUtc = new Date("2026-06-02T01:00:00Z");
  const juneStr = formatEventTime(juneUtc, "America/Denver");
  juneStr === "7:00 PM" ? ok(`June: 01:00Z renders 7:00 PM in Denver (MDT)`) : bad(`June render wrong: ${juneStr}`);

  // 7:00 PM Denver in December (MST, UTC-7) = 02:00 UTC next day.
  const decUtc = new Date("2026-12-02T02:00:00Z");
  const decStr = formatEventTime(decUtc, "America/Denver");
  decStr === "7:00 PM" ? ok(`Dec: 02:00Z renders 7:00 PM in Denver (MST) — DST handled`) : bad(`Dec render wrong: ${decStr}`);

  // Same instant, different viewer zone — the event keeps its own wall-clock.
  const ny = formatEventTime(juneUtc, "America/New_York");
  ny === "9:00 PM" ? ok(`Same instant in NY zone renders 9:00 PM (event keeps its tz, not viewer's)`) : bad(`NY render wrong: ${ny}`);
  formatEventDateTime(juneUtc, "America/Denver").includes("MDT") ? ok(`full format includes zone abbrev (MDT)`) : bad(`no zone abbrev`);

  // --- 2. Notification scheduler ---
  const startsAt = new Date(Date.now() + 90 * 60 * 1000); // 90 min out
  await db.insert(events).values({
    uri: EVENT, authorDid: DID, name: "TZ Test Event", startsAt, status: "scheduled",
    tzid: "America/Denver", createdAt: new Date(),
  });
  // confirmed seat + verified email so the reminder is deliverable
  await db.insert(acceptances).values({ eventUri: EVENT, attendeeDid: DID, rsvpUri: "x", state: "confirmed", decidedAt: new Date() });
  await db.insert(contactChannels).values({ did: DID, email: "test@example.com", verified: true, source: "test" });

  await enqueueReminders(EVENT, DID, startsAt);
  const jobs = await db.select().from(notificationJobs).where(eq(notificationJobs.eventUri, EVENT));
  // event is 90 min out → reminder_1h is due-able (scheduledFor = start-1h = 30 min from now, future),
  // reminder_1d is in the past relative to start → skipped at enqueue.
  jobs.length === 1 && jobs[0].kind === "reminder_1h"
    ? ok(`enqueue: only the future 1h reminder created (1d skipped — event <1d out)`)
    : bad(`enqueue wrong: ${jobs.map((j) => j.kind).join(",")}`);

  // not due yet (scheduledFor 30 min out) → scheduler is a no-op
  let r = await runScheduler(new Date());
  r.sent === 0 && r.claimed === 0 ? ok(`scheduler: nothing due yet (no premature send)`) : bad(`premature send: ${JSON.stringify(r)}`);

  // jump past the scheduledFor → should send exactly once
  const after = new Date(jobs[0].scheduledFor.getTime() + 1000);
  r = await runScheduler(after);
  r.sent === 1 ? ok(`scheduler: reminder sent when due`) : bad(`send wrong: ${JSON.stringify(r)}`);

  // run again → idempotent (already sent, no double-send)
  r = await runScheduler(after);
  r.sent === 0 && r.claimed === 0 ? ok(`scheduler: no double-send on re-run`) : bad(`double-send: ${JSON.stringify(r)}`);

  // seat re-check: cancel the seat, enqueue a fresh due job → skipped (not confirmed)
  await db.update(acceptances).set({ state: "declined" }).where(eq(acceptances.eventUri, EVENT));
  await db.insert(notificationJobs).values({
    id: `reminder_1h:${EVENT}:${DID}:recheck`, kind: "reminder_1h", recipientDid: DID, eventUri: EVENT,
    scheduledFor: new Date(Date.now() - 1000), status: "pending",
  });
  r = await runScheduler(new Date());
  r.skipped >= 1 && r.sent === 0 ? ok(`scheduler: cancelled seat → reminder skipped at send time`) : bad(`recheck wrong: ${JSON.stringify(r)}`);

  await cleanup();
  console.log(failed ? "\n\x1b[31m▶ T2 GATE FAILED\x1b[0m\n" : "\n\x1b[32m▶ T2 GATE PASSED\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
