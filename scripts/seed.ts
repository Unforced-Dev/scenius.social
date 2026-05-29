/**
 * Seed the demo as REAL atproto records on the app-password account's PDS, so
 * the whole demo is genuinely usable (RSVP-able) — seeded events must be real
 * records or RSVP fails with "Could not find repo" (the RSVP references the
 * event's strongRef, resolved from the author's PDS).
 *
 * Idempotent: wipes the demo scenes (by handle) first, then recreates them via
 * the real write helpers. The signed-in account becomes steward of each scene.
 * Demo "people" (Maya, Kai, …) are added as members with display-name accounts
 * for nice rendering, though their DIDs are placeholders.
 *
 *   BSKY_HANDLE=… BSKY_APP_PASSWORD=… DATABASE_URL=… npm run db:seed
 */
import { AtpAgent } from "@atproto/api";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import {
  scenes, memberships, events, eventContexts, acceptances, eventInventory, rsvps,
} from "../lib/db/schema";
import { parseAtUri } from "../lib/scenius/atproto";
import { createScene, createEvent, addMember, curateEvent } from "../lib/scenius/write";
import { indexIdentity } from "../lib/scenius/indexer";

const HANDLES = ["techne", "woven-web", "north-boulder", "boulder-regen"];
const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number, hour = 18) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

// demo personas (placeholder DIDs, real display names for nice rendering)
const PEOPLE = {
  maya: { did: "did:plc:demo-maya", handle: "maya.example", name: "Maya Chen" },
  kai: { did: "did:plc:demo-kai", handle: "kai.example", name: "Kai Rivera" },
  luna: { did: "did:plc:demo-luna", handle: "luna.example", name: "Luna Park" },
  river: { did: "did:plc:demo-river", handle: "river.example", name: "River Stone" },
};

async function wipeScene(agent: AtpAgent, did: string, handle: string) {
  const [s] = await db.select().from(scenes).where(eq(scenes.handle, handle)).limit(1);
  if (!s) return;
  const ctxs = await db.select().from(eventContexts).where(eq(eventContexts.sceneUri, s.uri));
  const mems = await db.select().from(memberships).where(eq(memberships.sceneUri, s.uri));
  const eventUris = ctxs.map((c) => c.eventUri);
  const rs = eventUris.length ? await db.select().from(rsvps).where(inArray(rsvps.eventUri, eventUris)) : [];
  for (const uri of [...rs.map((r) => r.uri), ...ctxs.map((c) => c.uri), ...mems.map((m) => m.uri), ...eventUris, s.uri]) {
    try {
      const { did: owner, collection, rkey } = parseAtUri(uri);
      if (owner === did) await agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey });
    } catch { /* best-effort */ }
  }
  if (eventUris.length) {
    await db.delete(acceptances).where(inArray(acceptances.eventUri, eventUris));
    await db.delete(eventInventory).where(inArray(eventInventory.eventUri, eventUris));
    await db.delete(rsvps).where(inArray(rsvps.eventUri, eventUris));
  }
  await db.delete(eventContexts).where(eq(eventContexts.sceneUri, s.uri));
  for (const e of eventUris) await db.delete(events).where(eq(events.uri, e));
  await db.delete(memberships).where(eq(memberships.sceneUri, s.uri));
  await db.delete(scenes).where(eq(scenes.uri, s.uri));
}

async function main() {
  if (!process.env.BSKY_HANDLE || !process.env.BSKY_APP_PASSWORD) {
    console.error("Set BSKY_HANDLE + BSKY_APP_PASSWORD — the seed writes real records to that PDS.");
    process.exit(1);
  }
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: process.env.BSKY_HANDLE, password: process.env.BSKY_APP_PASSWORD });
  const did = agent.session!.did;
  console.log(`Seeding as ${process.env.BSKY_HANDLE} (${did})`);

  console.log("Wiping existing demo scenes…");
  for (const h of HANDLES) await wipeScene(agent, did, h);

  // display-name accounts for the demo personas
  for (const p of Object.values(PEOPLE)) await indexIdentity(p.did, p.handle, true, new Date());

  // --- scenes (signed-in account = steward) ---
  console.log("Creating scenes…");
  const techne = await createScene(agent, did, {
    name: "Techne", handle: "techne", type: "interest", visibility: "public", memberPolicy: "invite",
    description: "Boulder's community of practice for technology, craft, and making. Weekly gatherings, workshops, and conversations about building things that matter.",
    location: { locality: "Boulder", region: "CO" },
  });
  const woven = await createScene(agent, did, {
    name: "Woven Web", handle: "woven-web", type: "hybrid", visibility: "public", memberPolicy: "invite",
    description: "Regenerative community coordination in Boulder. Mutual aid, local food systems, neighborhood resilience, and the infrastructure of care.",
    location: { locality: "Boulder", region: "CO" },
  });
  const nobo = await createScene(agent, did, {
    name: "North Boulder", handle: "north-boulder", type: "place", visibility: "public", memberPolicy: "invite",
    description: "The neighborhood scene for North Boulder. Block parties, trail runs, local business support, and civic life above Iris.",
    location: { locality: "Boulder", region: "CO" },
  });
  const regen = await createScene(agent, did, {
    name: "Boulder Regenerative", handle: "boulder-regen", type: "interest", visibility: "public", memberPolicy: "invite",
    description: "Exploring regenerative economics, land stewardship, and what it means to build an economy that gives back more than it takes.",
    location: { locality: "Boulder", region: "CO" },
  });

  // --- members (added by the steward) ---
  console.log("Adding members…");
  await addMember(agent, did, techne.uri, PEOPLE.kai.did, "builder");
  await addMember(agent, did, techne.uri, PEOPLE.maya.did, "member");
  await addMember(agent, did, woven.uri, PEOPLE.luna.did, "builder");
  await addMember(agent, did, woven.uri, PEOPLE.river.did, "member");
  await addMember(agent, did, nobo.uri, PEOPLE.maya.did, "builder");
  await addMember(agent, did, regen.uri, PEOPLE.kai.did, "builder");

  // --- events (real records, some with capacity) ---
  console.log("Creating events…");
  await createEvent(agent, did, techne.uri, {
    name: "Techne Weekly: Building on AT Protocol",
    description: "Diving into the AT Protocol ecosystem — what it is, how it works, and why it matters for community infrastructure. Bring your laptop to hack along.",
    startsAt: iso(3, 18), endsAt: iso(3, 20), mode: "inperson", location: { name: "The Riverside", locality: "Boulder" },
    tzid: "America/Denver", capacity: 30, pinned: true,
  });
  await createEvent(agent, did, nobo.uri, {
    name: "North Boulder Block Party",
    description: "Annual block party on Wonderland Hill. Live music, potluck, kids activities, and a chance to meet your neighbors. Bring a dish to share.",
    startsAt: iso(7, 16), endsAt: iso(7, 21), mode: "inperson", location: { name: "Wonderland Hill Park", locality: "Boulder" },
    tzid: "America/Denver",
  });
  await createEvent(agent, did, regen.uri, {
    name: "Regen Economics Reading Group",
    description: "Discussing Chapter 5 of Doughnut Economics and its implications for local community currencies. Online and in person at Trident.",
    startsAt: iso(5, 17), endsAt: iso(5, 19), mode: "hybrid", location: { name: "Trident Booksellers & Cafe", locality: "Boulder" },
    tzid: "America/Denver", capacity: 20, waitlistEnabled: true,
  });
  await createEvent(agent, did, woven.uri, {
    name: "Community Kitchen: Summer Solstice",
    description: "Cook and eat together to mark the solstice. Woven Web provides ingredients from local farms; everyone helps cook. Vegetarian menu.",
    startsAt: iso(10, 17), endsAt: iso(10, 20), mode: "inperson", location: { name: "The Community Table", locality: "Boulder" },
    tzid: "America/Denver", capacity: 24, approvalRequired: true,
  });
  const ev5 = await createEvent(agent, did, techne.uri, {
    name: "Scenius Hack Night",
    description: "Building the community coordination tools we wish existed. This month: agent-native event discovery via MCP. All skill levels welcome.",
    startsAt: iso(14, 18), endsAt: iso(14, 21), mode: "inperson", location: { name: "The Co-op", locality: "Boulder" },
    tzid: "America/Denver", capacity: 40,
  });
  await createEvent(agent, did, woven.uri, {
    name: "Trail Run & Coffee",
    description: "Easy 5k on the Mesa Trail followed by coffee at Boxcar. All paces welcome.",
    startsAt: iso(2, 8), endsAt: iso(2, 10), mode: "inperson", location: { name: "Mesa Trail South", locality: "Boulder" },
    tzid: "America/Denver",
  });

  // cross-scene curation: Hack Night appears on Woven Web's calendar too
  await curateEvent(agent, did, ev5.eventUri, woven.uri);

  console.log("\nSeed complete — all real records on the PDS (RSVP-able).");
  console.log("  4 scenes, 6 events, 6 members");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
