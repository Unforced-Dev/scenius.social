import { Agent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships } from "@/lib/db/schema";
import { resolveStrongRef } from "./atproto";
import { canCurate, roleInScene, isSceneOwner } from "./queries";
import {
  indexScene,
  indexMembership,
  indexEvent,
  indexEventContext,
  indexEventConfig,
  indexRsvp,
  upsertInventoryPolicy,
  setEventTzid,
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
  if (input.tzid) await setEventTzid(eventUri, input.tzid);

  // Capacity / approval / waitlist / tzid → an eventConfig sidecar (best-effort;
  // not on the critical path — a failure here doesn't orphan the event).
  const wantsConfig =
    input.capacity != null ||
    input.approvalRequired != null ||
    input.waitlistEnabled != null ||
    input.tzid != null;
  if (wantsConfig) {
    // Enforce the policy in the AppView ledger FIRST and unconditionally, so
    // capacity holds even if the portable eventConfig PDS write below fails.
    // (A failed PDS write must never silently leave the event uncapped.)
    await upsertInventoryPolicy(
      eventUri,
      input.capacity ?? null,
      input.approvalRequired ?? false,
      input.waitlistEnabled ?? true,
      new Date(),
    );

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
      // Policy is already enforced locally; the portable record can be retried.
      console.error("eventConfig PDS write failed (capacity still enforced):", err);
    }
  }

  return { eventUri };
}

/** Deterministic RSVP record key per (attendee, event) — one record, no races. */
function rsvpRkey(eventUri: string): string {
  return createHash("sha256").update(eventUri).digest("base64url").slice(0, 24);
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

  // Deterministic rkey per (attendee, event) → idempotent putRecord. No index
  // read, so concurrent RSVPs can't create two records for the same event.
  const rkey = rsvpRkey(eventUri);
  const res = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: NSID.rsvp,
    rkey,
    record,
  });
  await indexRsvp(res.data.uri, did, record, optimisticMeta(res.data));
}

/** Cancel an RSVP: delete the record (releases the seat; no auto-promote). */
export async function cancelRsvp(agent: Agent, did: string, eventUri: string): Promise<void> {
  const rkey = rsvpRkey(eventUri);
  const uri = `at://${did}/${NSID.rsvp}/${rkey}`;
  try {
    await agent.com.atproto.repo.deleteRecord({ repo: did, collection: NSID.rsvp, rkey });
  } catch (err) {
    // already gone is fine; surface anything else
    const msg = err instanceof Error ? err.message : String(err);
    if (!/not ?found|could not (find|locate)/i.test(msg)) throw err;
  }
  await applyDelete(uri, NSID.rsvp, null, new Date());
}

// --- Membership management (facilitator/steward manages the scene roster) ---

const RANK: Record<string, number> = { member: 1, builder: 2, facilitator: 3, steward: 4 };

/** Caller's effective rank in a scene (owner counts as steward). */
async function callerRank(sceneUri: string, callerDid: string): Promise<number> {
  if (await isSceneOwner(sceneUri, callerDid)) return 4;
  const r = await roleInScene(sceneUri, callerDid);
  return r ? RANK[r] ?? 0 : 0;
}

async function resolveDid(agent: Agent, handleOrDid: string): Promise<string> {
  const h = handleOrDid.trim().replace(/^@/, "");
  if (h.startsWith("did:")) return h;
  const res = await agent.com.atproto.identity.resolveHandle({ handle: h });
  return res.data.did;
}

function membershipRkey(sceneUri: string, memberDid: string): string {
  return createHash("sha256").update(`${sceneUri}|${memberDid}`).digest("base64url").slice(0, 24);
}

export type AddMemberRole = "member" | "builder" | "facilitator" | "steward";

/**
 * Add (or re-role) a member in a scene. Authored by the caller (the scene
 * operator's repo), so the AppView can rely on the roster and member-gating.
 * Hierarchy rule: you may grant only roles at or below your own, and must be a
 * facilitator+ to manage membership at all; only stewards grant steward.
 * Returns the resolved member DID.
 */
export async function addMember(
  agent: Agent,
  callerDid: string,
  sceneUri: string,
  memberHandleOrDid: string,
  role: AddMemberRole,
): Promise<string> {
  const cr = await callerRank(sceneUri, callerDid);
  const tr = RANK[role] ?? 0;
  if (cr < 3) throw new Error("Only facilitators and stewards can manage members.");
  if (cr < tr) throw new Error(`You can't grant a role above your own.`);

  const memberDid = await resolveDid(agent, memberHandleOrDid);
  const createdAt = new Date().toISOString();
  const sceneRef = await resolveStrongRef(agent, sceneUri);
  const record = {
    $type: NSID.membership,
    scene: sceneRef,
    member: memberDid,
    role,
    createdAt,
  };
  // deterministic rkey per (scene, member) → re-adding updates the role
  const rkey = membershipRkey(sceneUri, memberDid);
  const res = await agent.com.atproto.repo.putRecord({
    repo: callerDid,
    collection: NSID.membership,
    rkey,
    record,
  });
  await indexMembership(res.data.uri, callerDid, record, optimisticMeta(res.data));
  return memberDid;
}

/** Remove a member from a scene. Stewards can only be removed by stewards. */
export async function removeMember(
  agent: Agent,
  callerDid: string,
  sceneUri: string,
  memberDid: string,
): Promise<void> {
  const cr = await callerRank(sceneUri, callerDid);
  if (cr < 3) throw new Error("Only facilitators and stewards can manage members.");

  const [m] = await db
    .select({ uri: memberships.uri, role: memberships.role, authorDid: memberships.authorDid })
    .from(memberships)
    .where(and(eq(memberships.sceneUri, sceneUri), eq(memberships.memberDid, memberDid)))
    .limit(1);
  if (!m) return;
  if ((RANK[m.role] ?? 0) >= 4 && cr < 4) {
    throw new Error("Only a steward can remove a steward.");
  }

  // delete the PDS record if it's in the caller's repo; always de-index
  if (m.authorDid === callerDid) {
    try {
      const u = new AtUri(m.uri);
      await agent.com.atproto.repo.deleteRecord({
        repo: callerDid,
        collection: NSID.membership,
        rkey: u.rkey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/not ?found|could not (find|locate)/i.test(msg)) throw err;
    }
  }
  await applyDelete(m.uri, NSID.membership, null, new Date());
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
