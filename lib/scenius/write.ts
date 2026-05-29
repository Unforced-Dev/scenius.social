import { Agent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { rsvps } from "@/lib/db/schema";
import { resolveStrongRef } from "./atproto";
import { canCurate } from "./queries";
import {
  indexScene,
  indexMembership,
  indexEvent,
  indexEventContext,
  indexEventConfig,
  indexRsvp,
  applyDelete,
  type IndexMeta,
} from "./indexer";

// Re-export the authz/query helpers so existing call sites keep working.
export { canCurate, canManageMembers, recomputeMemberCount } from "./queries";

const NSID = {
  scene: "social.scenius.scene",
  membership: "social.scenius.membership",
  attestation: "social.scenius.attestation",
  eventContext: "social.scenius.eventContext",
  eventConfig: "social.scenius.eventConfig",
  event: "community.lexicon.calendar.event",
  rsvp: "community.lexicon.calendar.rsvp",
} as const;

/** Build optimistic-write provenance from a createRecord response. */
function optimisticMeta(res: { cid?: string; commit?: { rev?: string } }): IndexMeta {
  return {
    source: "optimistic",
    cid: res.cid ?? null,
    rev: res.commit?.rev ?? null,
    now: new Date(),
  };
}

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
 * Create a scene: writes a social.scenius.scene to the creator's PDS, writes
 * their steward membership, and indexes both optimistically (the firehose
 * reconciles later, via the same indexer). Returns the scene's at:// URI.
 *
 * PDS writes run first with compensation: if the membership write fails, the
 * orphaned scene is deleted so we never leave a scene without its steward.
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

  const sceneRecord: Record<string, unknown> = {
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
  if (location) sceneRecord.location = location;

  const res = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: NSID.scene,
    record: sceneRecord,
  });
  const sceneUri = res.data.uri;

  const mRecord: Record<string, unknown> = {
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
    await deleteRecordSafe(agent, did, sceneUri); // compensate
    throw err;
  }

  // Both PDS writes succeeded → optimistic index through the shared indexer.
  await indexScene(sceneUri, did, sceneRecord, optimisticMeta(res.data));
  await indexMembership(mRes.data.uri, did, mRecord, optimisticMeta(mRes.data));

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
  // capacity config (writes a social.scenius.eventConfig sidecar)
  capacity?: number;
  approvalRequired?: boolean;
  waitlistEnabled?: boolean;
  tzid?: string;
};

/**
 * Create an event and curate it onto a scene in one flow:
 * - writes a community.lexicon.calendar.event to the author's PDS
 * - writes a social.scenius.eventContext linking event -> scene
 * Self-defending: verifies the author can curate the scene before writing
 * anything; resolves the scene strongRef first so a bad scene can't orphan an
 * event; deletes the event if the eventContext write fails.
 */
export async function createEvent(
  agent: Agent,
  did: string,
  sceneUri: string,
  input: EventInput,
): Promise<{ eventUri: string }> {
  if (!(await canCurate(sceneUri, did))) {
    throw new Error("Not authorized to curate this scene.");
  }

  const createdAt = new Date().toISOString();
  const sceneRef = await resolveStrongRef(agent, sceneUri); // before any write

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

  const ctxRecord: Record<string, unknown> = {
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
    await deleteRecordSafe(agent, did, eventUri); // compensate
    throw err;
  }

  await indexEvent(eventUri, did, eventRecord, optimisticMeta(eRes.data));
  await indexEventContext(cRes.data.uri, did, ctxRecord, optimisticMeta(cRes.data));

  // Capacity / approval / waitlist / tzid → an eventConfig sidecar (best-effort;
  // not on the critical path — a failure here doesn't orphan the event).
  const wantsConfig =
    input.capacity != null ||
    input.approvalRequired != null ||
    input.waitlistEnabled != null ||
    input.tzid != null;
  if (wantsConfig) {
    const cfgRecord: Record<string, unknown> = {
      $type: NSID.eventConfig,
      event: { uri: eventUri, cid: eRes.data.cid },
      createdAt,
    };
    if (input.capacity != null) cfgRecord.maxAttendees = input.capacity;
    if (input.approvalRequired != null) cfgRecord.approvalRequired = input.approvalRequired;
    if (input.waitlistEnabled != null) cfgRecord.waitlistEnabled = input.waitlistEnabled;
    if (input.tzid) cfgRecord.tzid = input.tzid;
    try {
      const cfgRes = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: NSID.eventConfig,
        record: cfgRecord,
      });
      await indexEventConfig(cfgRes.data.uri, did, cfgRecord, optimisticMeta(cfgRes.data));
    } catch (err) {
      console.error("eventConfig write failed (event still created):", err);
    }
  }

  return { eventUri };
}

// --- RSVP (intent) → arbitrated seat ---

/**
 * RSVP to an event: writes a community.lexicon.calendar.rsvp to the attendee's
 * PDS and indexes it, which runs seat arbitration. One record per (attendee,
 * event) — re-RSVPing updates the existing record. Returns nothing; read the
 * seat state separately (it's the AppView's decision, not the RSVP's claim).
 */
export async function createRsvp(
  agent: Agent,
  did: string,
  eventUri: string,
  status: "going" | "interested" | "notgoing" = "going",
): Promise<void> {
  const createdAt = new Date().toISOString();
  const eventRef = await resolveStrongRef(agent, eventUri);
  const record = {
    $type: NSID.rsvp,
    subject: eventRef,
    status,
    createdAt,
  };

  // One RSVP record per (attendee, event): reuse the rkey if one exists.
  const [existing] = await db
    .select({ uri: rsvps.uri })
    .from(rsvps)
    .where(and(eq(rsvps.authorDid, did), eq(rsvps.eventUri, eventUri)))
    .limit(1);

  let uri: string;
  let res;
  if (existing) {
    const u = new AtUri(existing.uri);
    res = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: NSID.rsvp,
      rkey: u.rkey,
      record,
    });
    uri = existing.uri;
  } else {
    res = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: NSID.rsvp,
      record,
    });
    uri = res.data.uri;
  }

  await indexRsvp(uri, did, record, optimisticMeta(res.data));
}

/** Cancel an RSVP: delete the record (releases the seat; no auto-promote). */
export async function cancelRsvp(agent: Agent, did: string, eventUri: string): Promise<void> {
  const [existing] = await db
    .select({ uri: rsvps.uri })
    .from(rsvps)
    .where(and(eq(rsvps.authorDid, did), eq(rsvps.eventUri, eventUri)))
    .limit(1);
  if (!existing) return;

  const u = new AtUri(existing.uri);
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: NSID.rsvp,
    rkey: u.rkey,
  });
  await applyDelete(existing.uri, NSID.rsvp, null, new Date());
}

// --- Helpers ---

/** Delete a record by at:// URI, swallowing errors (best-effort compensation). */
async function deleteRecordSafe(agent: Agent, did: string, uri: string): Promise<void> {
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
