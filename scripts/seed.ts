import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  accounts,
  scenes,
  memberships,
  events,
  eventContexts,
} from "../lib/db/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://scenius:scenius@localhost:5432/scenius";

async function main() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding database...");

  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  // Demo accounts
  await db
    .insert(accounts)
    .values([
      { did: "did:plc:demo-aaron", handle: "aaron.scenius.social", displayName: "Aaron" },
      { did: "did:plc:demo-maya", handle: "maya.bsky.social", displayName: "Maya Chen" },
      { did: "did:plc:demo-kai", handle: "kai.bsky.social", displayName: "Kai Rivera" },
      { did: "did:plc:demo-luna", handle: "luna.bsky.social", displayName: "Luna Park" },
      { did: "did:plc:demo-river", handle: "river.bsky.social", displayName: "River Stone" },
    ])
    .onConflictDoNothing();

  // Scenes
  const sceneValues = [
    {
      uri: "at://did:plc:demo-aaron/social.scenius.scene/techne",
      authorDid: "did:plc:demo-aaron",
      name: "Techne",
      handle: "techne",
      description:
        "Boulder's community of practice for technology, craft, and making. Weekly gatherings, workshops, and conversations about building things that matter.",
      type: "interest",
      visibility: "public",
      memberPolicy: "attestation",
      locationLocality: "Boulder",
      locationRegion: "CO",
      locationCountry: "US",
      locationLat: "40.0150",
      locationLon: "-105.2705",
      tags: ["tech", "craft", "making", "boulder"],
      memberCount: 42,
      createdAt: new Date(now.getTime() - 90 * day),
    },
    {
      uri: "at://did:plc:demo-aaron/social.scenius.scene/woven-web",
      authorDid: "did:plc:demo-aaron",
      name: "Woven Web",
      handle: "woven-web",
      description:
        "Regenerative community coordination in Boulder. Mutual aid, local food systems, neighborhood resilience, and the infrastructure of care.",
      type: "hybrid",
      visibility: "public",
      memberPolicy: "attestation",
      locationLocality: "Boulder",
      locationRegion: "CO",
      locationCountry: "US",
      locationLat: "40.0150",
      locationLon: "-105.2705",
      tags: ["regenerative", "mutual-aid", "community", "boulder"],
      memberCount: 28,
      createdAt: new Date(now.getTime() - 60 * day),
    },
    {
      uri: "at://did:plc:demo-maya/social.scenius.scene/north-boulder",
      authorDid: "did:plc:demo-maya",
      name: "North Boulder",
      handle: "north-boulder",
      description:
        "The neighborhood scene for North Boulder. Block parties, trail runs, local business support, and civic life above Iris.",
      type: "place",
      visibility: "public",
      memberPolicy: "open",
      locationLocality: "Boulder",
      locationRegion: "CO",
      locationCountry: "US",
      locationLat: "40.0350",
      locationLon: "-105.2755",
      tags: ["neighborhood", "north-boulder", "civic"],
      memberCount: 67,
      createdAt: new Date(now.getTime() - 120 * day),
    },
    {
      uri: "at://did:plc:demo-kai/social.scenius.scene/boulder-regen",
      authorDid: "did:plc:demo-kai",
      name: "Boulder Regenerative",
      handle: "boulder-regen",
      description:
        "Exploring regenerative economics, land stewardship, and what it means to build an economy that gives back more than it takes.",
      type: "interest",
      visibility: "public",
      memberPolicy: "attestation",
      locationLocality: "Boulder",
      locationRegion: "CO",
      locationCountry: "US",
      tags: ["regen", "economics", "land", "stewardship"],
      memberCount: 19,
      createdAt: new Date(now.getTime() - 45 * day),
    },
  ];

  await db.insert(scenes).values(sceneValues).onConflictDoNothing();

  // Memberships (scene builders + members)
  await db
    .insert(memberships)
    .values([
      { uri: "at://did:plc:demo-aaron/social.scenius.membership/1", authorDid: "did:plc:demo-aaron", sceneUri: sceneValues[0].uri, memberDid: "did:plc:demo-aaron", role: "builder", createdAt: sceneValues[0].createdAt },
      { uri: "at://did:plc:demo-maya/social.scenius.membership/2", authorDid: "did:plc:demo-maya", sceneUri: sceneValues[0].uri, memberDid: "did:plc:demo-maya", role: "member", createdAt: new Date(now.getTime() - 80 * day) },
      { uri: "at://did:plc:demo-kai/social.scenius.membership/3", authorDid: "did:plc:demo-kai", sceneUri: sceneValues[0].uri, memberDid: "did:plc:demo-kai", role: "builder", createdAt: new Date(now.getTime() - 70 * day) },
      { uri: "at://did:plc:demo-aaron/social.scenius.membership/4", authorDid: "did:plc:demo-aaron", sceneUri: sceneValues[1].uri, memberDid: "did:plc:demo-aaron", role: "builder", createdAt: sceneValues[1].createdAt },
      { uri: "at://did:plc:demo-luna/social.scenius.membership/5", authorDid: "did:plc:demo-luna", sceneUri: sceneValues[1].uri, memberDid: "did:plc:demo-luna", role: "builder", createdAt: new Date(now.getTime() - 50 * day) },
      { uri: "at://did:plc:demo-river/social.scenius.membership/6", authorDid: "did:plc:demo-river", sceneUri: sceneValues[1].uri, memberDid: "did:plc:demo-river", role: "member", createdAt: new Date(now.getTime() - 40 * day) },
      { uri: "at://did:plc:demo-maya/social.scenius.membership/7", authorDid: "did:plc:demo-maya", sceneUri: sceneValues[2].uri, memberDid: "did:plc:demo-maya", role: "builder", createdAt: sceneValues[2].createdAt },
      { uri: "at://did:plc:demo-kai/social.scenius.membership/8", authorDid: "did:plc:demo-kai", sceneUri: sceneValues[3].uri, memberDid: "did:plc:demo-kai", role: "builder", createdAt: sceneValues[3].createdAt },
    ])
    .onConflictDoNothing();

  // Events (using community.lexicon.calendar.event format)
  const eventValues = [
    {
      uri: "at://did:plc:demo-aaron/community.lexicon.calendar.event/1",
      authorDid: "did:plc:demo-aaron",
      name: "Techne Weekly: Building on AT Protocol",
      description:
        "This week we're diving into the AT Protocol ecosystem — what it is, how it works, and why it matters for community infrastructure. Bring your laptop if you want to hack along.",
      startsAt: new Date(now.getTime() + 3 * day),
      endsAt: new Date(now.getTime() + 3 * day + 2 * 60 * 60 * 1000),
      mode: "inperson",
      status: "scheduled",
      locationName: "The Riverside",
      locationLocality: "Boulder",
      createdAt: new Date(now.getTime() - 2 * day),
    },
    {
      uri: "at://did:plc:demo-maya/community.lexicon.calendar.event/2",
      authorDid: "did:plc:demo-maya",
      name: "North Boulder Block Party",
      description:
        "Annual block party on Wonderland Hill. Live music, potluck, kids activities, and a chance to meet your neighbors. Bring a dish to share.",
      startsAt: new Date(now.getTime() + 7 * day),
      endsAt: new Date(now.getTime() + 7 * day + 5 * 60 * 60 * 1000),
      mode: "inperson",
      status: "scheduled",
      locationName: "Wonderland Hill Park",
      locationLocality: "Boulder",
      createdAt: new Date(now.getTime() - 14 * day),
    },
    {
      uri: "at://did:plc:demo-kai/community.lexicon.calendar.event/3",
      authorDid: "did:plc:demo-kai",
      name: "Regen Economics Reading Group",
      description:
        "Discussing Chapter 5 of Doughnut Economics and its implications for local community currencies. Online and in-person at Trident.",
      startsAt: new Date(now.getTime() + 5 * day),
      endsAt: new Date(now.getTime() + 5 * day + 90 * 60 * 1000),
      mode: "hybrid",
      status: "scheduled",
      locationName: "Trident Booksellers & Cafe",
      locationLocality: "Boulder",
      createdAt: new Date(now.getTime() - 5 * day),
    },
    {
      uri: "at://did:plc:demo-luna/community.lexicon.calendar.event/4",
      authorDid: "did:plc:demo-luna",
      name: "Community Kitchen: Summer Solstice",
      description:
        "Cook and eat together to mark the solstice. Woven Web provides ingredients from local farms; everyone helps cook. Vegetarian menu.",
      startsAt: new Date(now.getTime() + 10 * day),
      endsAt: new Date(now.getTime() + 10 * day + 3 * 60 * 60 * 1000),
      mode: "inperson",
      status: "scheduled",
      locationName: "The Community Table",
      locationLocality: "Boulder",
      createdAt: new Date(now.getTime() - 7 * day),
    },
    {
      uri: "at://did:plc:demo-aaron/community.lexicon.calendar.event/5",
      authorDid: "did:plc:demo-aaron",
      name: "Scenius Hack Night",
      description:
        "Building the community coordination tools we wish existed. This month: agent-native event discovery via MCP. All skill levels welcome.",
      startsAt: new Date(now.getTime() + 14 * day),
      endsAt: new Date(now.getTime() + 14 * day + 3 * 60 * 60 * 1000),
      mode: "inperson",
      status: "scheduled",
      locationName: "The Co-op",
      locationLocality: "Boulder",
      createdAt: new Date(now.getTime() - 1 * day),
    },
    {
      uri: "at://did:plc:demo-river/community.lexicon.calendar.event/6",
      authorDid: "did:plc:demo-river",
      name: "Trail Run & Coffee",
      description:
        "Easy 5k on the Mesa Trail followed by coffee at Boxcar. All paces welcome.",
      startsAt: new Date(now.getTime() + 2 * day),
      endsAt: new Date(now.getTime() + 2 * day + 2 * 60 * 60 * 1000),
      mode: "inperson",
      status: "scheduled",
      locationName: "Mesa Trail South",
      locationLocality: "Boulder",
      createdAt: new Date(now.getTime() - 3 * day),
    },
  ];

  await db.insert(events).values(eventValues).onConflictDoNothing();

  // Event contexts — scene builders curating events onto scene calendars
  await db
    .insert(eventContexts)
    .values([
      { uri: "at://did:plc:demo-aaron/social.scenius.eventContext/1", authorDid: "did:plc:demo-aaron", eventUri: eventValues[0].uri, sceneUri: sceneValues[0].uri, curatedByDid: "did:plc:demo-aaron", visibility: "public", pinned: true, createdAt: eventValues[0].createdAt },
      { uri: "at://did:plc:demo-maya/social.scenius.eventContext/2", authorDid: "did:plc:demo-maya", eventUri: eventValues[1].uri, sceneUri: sceneValues[2].uri, curatedByDid: "did:plc:demo-maya", visibility: "public", pinned: true, createdAt: eventValues[1].createdAt },
      { uri: "at://did:plc:demo-kai/social.scenius.eventContext/3", authorDid: "did:plc:demo-kai", eventUri: eventValues[2].uri, sceneUri: sceneValues[3].uri, curatedByDid: "did:plc:demo-kai", visibility: "public", pinned: false, createdAt: eventValues[2].createdAt },
      { uri: "at://did:plc:demo-luna/social.scenius.eventContext/4", authorDid: "did:plc:demo-luna", eventUri: eventValues[3].uri, sceneUri: sceneValues[1].uri, curatedByDid: "did:plc:demo-luna", visibility: "public", pinned: false, createdAt: eventValues[3].createdAt },
      { uri: "at://did:plc:demo-aaron/social.scenius.eventContext/5", authorDid: "did:plc:demo-aaron", eventUri: eventValues[4].uri, sceneUri: sceneValues[0].uri, curatedByDid: "did:plc:demo-aaron", visibility: "public", pinned: false, createdAt: eventValues[4].createdAt },
      { uri: "at://did:plc:demo-river/social.scenius.eventContext/6", authorDid: "did:plc:demo-river", eventUri: eventValues[5].uri, sceneUri: sceneValues[1].uri, curatedByDid: "did:plc:demo-luna", visibility: "public", pinned: false, createdAt: eventValues[5].createdAt },
      // Cross-scene: Techne event also appears in Woven Web
      { uri: "at://did:plc:demo-luna/social.scenius.eventContext/7", authorDid: "did:plc:demo-luna", eventUri: eventValues[4].uri, sceneUri: sceneValues[1].uri, curatedByDid: "did:plc:demo-luna", visibility: "public", pinned: false, createdAt: eventValues[4].createdAt },
    ])
    .onConflictDoNothing();

  console.log("Seed complete.");
  console.log("  4 scenes: techne, woven-web, north-boulder, boulder-regen");
  console.log("  6 events across the next 2 weeks");
  console.log("  8 memberships (with builder roles)");

  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
