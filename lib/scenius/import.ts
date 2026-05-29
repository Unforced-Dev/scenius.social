import { Agent } from "@atproto/api";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, eventContexts } from "@/lib/db/schema";
import { parseIcs } from "./ical-parse";
import { createEvent } from "./write";

/**
 * Import events from an .ics feed into a scene's curated calendar (the RegenHub
 * off-Luma path). Idempotent: skips events already on the scene (matched by
 * name + start). Caller (the host) must hold a curation role in the scene.
 */
export async function importEventsFromIcs(
  agent: Agent,
  did: string,
  sceneUri: string,
  icsText: string,
  opts: { includePast?: boolean } = {},
): Promise<{ parsed: number; created: number; skipped: number; failed: number }> {
  const parsed = parseIcs(icsText);
  const now = Date.now();
  const todo = parsed.filter((e) => opts.includePast || e.start.getTime() >= now);

  const existing = await db
    .select({ name: events.name, startsAt: events.startsAt })
    .from(events)
    .innerJoin(eventContexts, eq(events.uri, eventContexts.eventUri))
    .where(eq(eventContexts.sceneUri, sceneUri));
  const seen = new Set(existing.map((e) => `${e.name}|${e.startsAt.toISOString()}`));

  let created = 0, skipped = 0, failed = 0;
  for (const ev of todo) {
    const key = `${ev.summary}|${ev.start.toISOString()}`;
    if (seen.has(key)) { skipped++; continue; }
    try {
      await createEvent(agent, did, sceneUri, {
        name: ev.summary,
        description: ev.description,
        startsAt: ev.start.toISOString(),
        endsAt: ev.end?.toISOString(),
        mode: "inperson",
        location: ev.location ? { name: ev.location } : undefined,
        tzid: ev.tzid,
      });
      created++;
      seen.add(key);
    } catch {
      failed++;
    }
  }
  return { parsed: parsed.length, created, skipped, failed };
}
