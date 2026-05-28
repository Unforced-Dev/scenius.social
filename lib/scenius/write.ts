import { Agent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  scenes,
  memberships,
  events,
  eventContexts,
} from "@/lib/db/schema";
import { resolveStrongRef } from "./atproto";

const NSID = {
  scene: "social.scenius.scene",
  membership: "social.scenius.membership",
  attestation: "social.scenius.attestation",
  eventContext: "social.scenius.eventContext",
  event: "community.lexicon.calendar.event",
} as const;

// --- Scene ---

export type SceneInput = {
  name: string;
  handle: string;
  description?: string;
  type?: "place" | "interest" | "hybrid";
  visibility?: "public" | "unlisted" | "members";
  memberPolicy?: "open" | "attestation" | "invite";
  governanceMode?: "administered" | "hybrid" | "emergent";
  location?: {
    name?: string;
    locality?: string;
    region?: string;
    country?: string;
    lat?: string;
    lon?: string;
  };
};

/**
 * Create a scene: writes a social.scenius.scene record to the creator's PDS,
 * writes their steward membership, and optimistically indexes both so the
 * scene is visible immediately (the firehose/Tap reconciles later).
 * Returns the scene's at:// URI.
 */
export async function createScene(
  agent: Agent,
  did: string,
  input: SceneInput,
): Promise<{ uri: string; handle: string }> {
  const createdAt = new Date().toISOString();

  const loc = input.location;
  const hasGeo = loc?.lat && loc?.lon;
  const hasAddress = loc?.locality && loc?.country;
  const location = hasGeo
    ? { $type: `${NSID.scene}#locationGeo`, lat: loc!.lat, lon: loc!.lon, name: loc!.name }
    : hasAddress
      ? {
          $type: `${NSID.scene}#locationAddress`,
          name: loc!.name,
          locality: loc!.locality,
          region: loc!.region,
          country: loc!.country,
        }
      : undefined;

  const record: Record<string, unknown> = {
    $type: NSID.scene,
    name: input.name,
    handle: input.handle,
    description: input.description,
    type: input.type,
    visibility: input.visibility ?? "public",
    memberPolicy: input.memberPolicy ?? "invite",
    governanceMode: input.governanceMode ?? "administered",
    createdAt,
  };
  if (location) record.location = location;

  // --- PDS writes first, with compensation on partial failure ---
  // atproto has no cross-record transaction; if the second write fails we
  // delete the first so we never leave a scene without its steward.
  const res = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: NSID.scene,
    record,
  });
  const sceneUri = res.data.uri;

  const mRecord = {
    $type: NSID.membership,
    scene: { uri: sceneUri, cid: res.data.cid },
    member: did,
    role: "steward",
    createdAt,
  };
  let mRes;
  try {
    mRes = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: NSID.membership,
      record: mRecord,
    });
  } catch (err) {
    // Compensate: remove the orphaned scene so it isn't left steward-less.
    await deleteRecordSafe(agent, did, sceneUri);
    throw err;
  }

  // --- Both PDS writes succeeded → optimistic index (Tap reconciles later) ---
  await db
    .insert(scenes)
    .values({
      uri: sceneUri,
      authorDid: did,
      name: input.name,
      handle: input.handle,
      description: input.description ?? null,
      type: input.type ?? null,
      visibility: input.visibility ?? "public",
      memberPolicy: input.memberPolicy ?? "invite",
      governanceMode: input.governanceMode ?? "administered",
      locationName: loc?.name ?? null,
      locationLat: loc?.lat ?? null,
      locationLon: loc?.lon ?? null,
      locationLocality: loc?.locality ?? null,
      locationRegion: loc?.region ?? null,
      locationCountry: loc?.country ?? null,
      createdAt: new Date(createdAt),
    })
    .onConflictDoUpdate({
      target: scenes.uri,
      set: { name: input.name, handle: input.handle },
    });

  await db
    .insert(memberships)
    .values({
      uri: mRes.data.uri,
      authorDid: did,
      sceneUri,
      memberDid: did,
      role: "steward",
      createdAt: new Date(createdAt),
    })
    .onConflictDoUpdate({ target: memberships.uri, set: { role: "steward" } });

  await recomputeMemberCount(sceneUri);

  return { uri: sceneUri, handle: input.handle };
}

// --- Event + curation onto a scene ---

export type EventInput = {
  name: string;
  description?: string;
  startsAt: string; // ISO
  endsAt?: string; // ISO
  mode?: "inperson" | "virtual" | "hybrid";
  location?: { name?: string; locality?: string };
  virtualUri?: string;
};

/**
 * Create an event and curate it onto a scene in one flow:
 * - writes a community.lexicon.calendar.event to the author's PDS
 * - writes a social.scenius.eventContext linking event -> scene
 * Both optimistically indexed. Returns the event's at:// URI.
 *
 * Self-defending: verifies the author holds a curation role in the scene
 * before writing anything (callers should also gate, but this is the floor).
 */
export async function createEvent(
  agent: Agent,
  did: string,
  sceneUri: string,
  input: EventInput,
): Promise<{ eventUri: string }> {
  // Authorization floor — don't trust the caller alone (defense-in-depth +
  // closes the check/write gap by validating immediately before the writes).
  if (!(await canCurate(sceneUri, did))) {
    throw new Error("Not authorized to curate this scene.");
  }

  const createdAt = new Date().toISOString();

  // Resolve the scene's strongRef FIRST — before writing the event — so a
  // missing/unresolvable scene can never orphan an event on the PDS.
  const sceneRef = await resolveStrongRef(agent, sceneUri);

  // 1. The event itself (shared community lexicon — interoperable)
  const locations: Array<Record<string, unknown>> = [];
  if (input.location?.name || input.location?.locality) {
    locations.push({
      $type: "community.lexicon.location.address",
      name: input.location.name,
      locality: input.location.locality,
      country: "US",
    });
  }
  const uris: string[] = [];
  if (input.virtualUri) uris.push(input.virtualUri);

  const eventRecord: Record<string, unknown> = {
    $type: NSID.event,
    name: input.name,
    description: input.description,
    createdAt,
    startsAt: input.startsAt,
    status: "scheduled",
    mode: input.mode ?? "inperson",
  };
  if (input.endsAt) eventRecord.endsAt = input.endsAt;
  if (locations.length) eventRecord.locations = locations;
  if (uris.length) eventRecord.uris = uris;

  const eRes = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: NSID.event,
    record: eventRecord,
  });
  const eventUri = eRes.data.uri;

  // 2. The curation edge — compensate by deleting the event if this fails,
  // so we never leave a globally-visible event without its scene link.
  const ctxRecord = {
    $type: NSID.eventContext,
    event: { uri: eventUri, cid: eRes.data.cid },
    scene: sceneRef,
    curatedBy: did,
    visibility: "public",
    pinned: false,
    createdAt,
  };
  let cRes;
  try {
    cRes = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: NSID.eventContext,
      record: ctxRecord,
    });
  } catch (err) {
    await deleteRecordSafe(agent, did, eventUri);
    throw err;
  }

  // --- Both PDS writes succeeded → optimistic index ---
  await db
    .insert(events)
    .values({
      uri: eventUri,
      authorDid: did,
      name: input.name,
      description: input.description ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      mode: input.mode ?? "inperson",
      status: "scheduled",
      locationName: input.location?.name ?? null,
      locationLocality: input.location?.locality ?? null,
      virtualUri: input.virtualUri ?? null,
      createdAt: new Date(createdAt),
    })
    .onConflictDoUpdate({ target: events.uri, set: { name: input.name } });

  await db
    .insert(eventContexts)
    .values({
      uri: cRes.data.uri,
      authorDid: did,
      eventUri,
      sceneUri,
      curatedByDid: did,
      visibility: "public",
      pinned: false,
      createdAt: new Date(createdAt),
    })
    .onConflictDoUpdate({
      target: eventContexts.uri,
      set: { eventUri, sceneUri },
    });

  return { eventUri };
}

// --- Helpers ---

/** Delete a record by at:// URI, swallowing errors (best-effort compensation). */
async function deleteRecordSafe(
  agent: Agent,
  did: string,
  uri: string,
): Promise<void> {
  try {
    const u = new AtUri(uri);
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: u.collection,
      rkey: u.rkey,
    });
  } catch (err) {
    console.error(`Compensation delete failed for ${uri}:`, err);
  }
}

/** Recompute a scene's denormalized member_count from the memberships table. */
export async function recomputeMemberCount(sceneUri: string): Promise<void> {
  await db
    .update(scenes)
    .set({
      memberCount: sql`(SELECT COUNT(*)::int FROM ${memberships} WHERE ${memberships.sceneUri} = ${sceneUri})`,
    })
    .where(eq(scenes.uri, sceneUri));
}

/** Look up a DID's role in a scene (from the indexed memberships). */
async function roleInScene(
  sceneUri: string,
  did: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      sql`${memberships.sceneUri} = ${sceneUri} AND ${memberships.memberDid} = ${did}`,
    )
    .limit(1);
  return row?.role ?? null;
}

/**
 * Does the given DID hold a curation-capable role (builder+) in the scene?
 *
 * SERVER-SIDE AUTHORIZATION ONLY. The `did` MUST come from a verified source
 * (an OAuth session, or a firehose record's signing DID). Never pass a
 * client-supplied DID without verifying it first.
 */
export async function canCurate(sceneUri: string, did: string): Promise<boolean> {
  const role = await roleInScene(sceneUri, did);
  return !!role && ["builder", "facilitator", "steward"].includes(role);
}

/**
 * May the given DID manage membership (add/remove members) in the scene?
 * Facilitators and stewards only. Used to authorize firehose-ingested
 * membership records. Same server-side-only contract as canCurate.
 */
export async function canManageMembers(
  sceneUri: string,
  did: string,
): Promise<boolean> {
  const role = await roleInScene(sceneUri, did);
  return !!role && ["facilitator", "steward"].includes(role);
}
