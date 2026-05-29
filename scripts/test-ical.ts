/**
 * iCal gate: build → parse round-trip, DST-correct TZID parsing (Luma import),
 * and cancellation. Pure (no DB).
 *   npx tsx scripts/test-ical.ts
 */
import { buildCalendar, type IcsEvent } from "../lib/scenius/ical";
import { parseIcs } from "../lib/scenius/ical-parse";

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => { console.log(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
let failed = false;

function main() {
  console.log("\n— scenius: iCal gate —\n");

  // 1. build → parse round-trip
  const start = new Date("2026-09-15T01:00:00Z");
  const end = new Date("2026-09-15T03:00:00Z");
  const ev: IcsEvent = {
    uri: "at://did:plc:x/community.lexicon.calendar.event/abc",
    name: "Soil & Capital, Salon; night",
    description: "Line one\nline two, with comma",
    startsAt: start,
    endsAt: end,
    locationName: "RegenHub",
    status: "scheduled",
    cancelledAt: null,
  };
  const ics = buildCalendar("Test Scene", [ev]);
  ics.startsWith("BEGIN:VCALENDAR") && ics.includes("END:VCALENDAR") ? ok("builds a VCALENDAR") : bad("bad calendar wrapper");
  ics.includes("\r\n") ? ok("uses CRLF line endings (RFC 5545)") : bad("no CRLF");

  const parsed = parseIcs(ics);
  parsed.length === 1 ? ok("round-trips 1 event") : bad(`parsed ${parsed.length}`);
  const p = parsed[0];
  p.summary === "Soil & Capital, Salon; night" ? ok("summary escaped + unescaped correctly (comma/semicolon)") : bad(`summary: ${p.summary}`);
  p.start.getTime() === start.getTime() ? ok("DTSTART round-trips (UTC)") : bad(`start: ${p.start.toISOString()}`);
  p.end?.getTime() === end.getTime() ? ok("DTEND round-trips") : bad(`end: ${p.end?.toISOString()}`);
  p.location === "RegenHub" ? ok("location round-trips") : bad(`loc: ${p.location}`);
  p.description?.includes("\n") && p.description.includes("comma") ? ok("description newline + comma round-trip") : bad(`desc: ${p.description}`);

  // 2. Luma-style TZID parse (DST-aware): 7pm Denver in Sept (MDT) = 01:00Z next day
  const luma = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:luma-1",
    "SUMMARY:RegenHub Mixer",
    "DTSTART;TZID=America/Denver:20260915T190000",
    "DTEND;TZID=America/Denver:20260915T210000",
    "LOCATION:The Greenhouse",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const lp = parseIcs(luma);
  lp.length === 1 ? ok("parses Luma-style TZID event") : bad(`luma parsed ${lp.length}`);
  lp[0]?.start.toISOString() === "2026-09-16T01:00:00.000Z"
    ? ok("TZID wall-time → correct UTC (Sep 15 7pm MDT = Sep 16 01:00Z, DST-aware)")
    : bad(`tzid start wrong: ${lp[0]?.start.toISOString()}`);
  lp[0]?.tzid === "America/Denver" ? ok("captures tzid for our rendering") : bad(`tzid: ${lp[0]?.tzid}`);

  // 3. cancellation
  const cancelledIcs = buildCalendar("S", [{ ...ev, cancelledAt: new Date() }]);
  cancelledIcs.includes("STATUS:CANCELLED") ? ok("cancelled event → STATUS:CANCELLED") : bad("no CANCELLED status");
  parseIcs(cancelledIcs)[0]?.cancelled === true ? ok("parses CANCELLED back") : bad("cancelled not parsed");

  console.log(failed ? "\n\x1b[31m▶ ICAL GATE FAILED\x1b[0m\n" : "\n\x1b[32m▶ ICAL GATE PASSED\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main();
