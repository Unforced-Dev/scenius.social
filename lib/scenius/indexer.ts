import { sql, eq, and } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  scenes,
  memberships,
  attestations,
  events,
  eventContexts,
  rsvps,
  tombstones,
  accounts,
  eventInventory,
  acceptances,
} from "@/lib/db/schema";
import {
  recomputeMemberCount,
  canManageMembers,
  canCurate,
  isSceneOwner,
} from "./queries";

/**
 * The single place a record becomes a row — called by BOTH the optimistic
 * write path (source:'optimistic') and the Tap firehose webhook
 * (source:'firehose'). Reconciliation is identical regardless of origin, so a
 * record created in our UI and the same record arriving via the firehose (or a
 * record created in another app entirely) all converge to the same state.
 *
 * Rules:
 *   - firehose beats optimistic (firehose is canonical truth)
 *   - among firehose writes, higher `rev` wins (idempotent replay: re-delivering
 *     the same rev is a no-op)
 *   - optimistic never clobbers a firehose row
 *   - deletes write a tombstone; a stale/replayed create can't resurrect a
 *     deleted record (only a strictly-higher rev does)
 *   - firehose-origin membership/eventContext writes are authorized before
 *     indexing (you can't forge a curation role by writing to your own PDS)
 */

export type IndexMeta = {
  source: "optimistic" | "firehose";
  rev?: string | null;
  cid?: string | null;
  now: Date;
};

// --- reconciliation primitives ---

/** True if the record is tombstoned and the incoming write does not supersede it. */
async function blockedByTombstone(uri: string, rev?: string | null): Promise<boolean> {
  const [t] = await db
    .select()
    .from(tombstones)
    .where(eq(tombstones.uri, uri))
    .limit(1);
  if (!t) return false;
  // A genuine re-create has a strictly-higher rev than the delete.
  if (rev && t.rev && rev > t.rev) {
    await db.delete(tombstones).where(eq(tombstones.uri, uri));
    return false;
  }
  return true; // stale, replayed, or rev-unknown → stays dead
}

function provValues(meta: IndexMeta) {
  return {
    cid: meta.cid ?? null,
    rev: meta.rev ?? null,
    source: meta.source,
    pendingSince: meta.source === "optimistic" ? meta.now : null,
    confirmedAt: meta.source === "firehose" ? meta.now : null,
    indexedAt: meta.now,
  };
}

/** The DO-UPDATE WHERE guard implementing the reconciliation rule. */
function setWhere(meta: IndexMeta, srcCol: PgColumn, revCol: PgColumn) {
  return meta.source === "firehose"
    ? sql`(${srcCol} = 'optimistic' OR ${revCol} IS NULL OR (excluded.rev IS NOT NULL AND excluded.rev > ${revCol}))`
    : sql`${srcCol} = 'optimistic'`;
}

function omit<T extends Record<string, unknown>>(obj: T, key: keyof T) {
  const { [key]: _omitted, ...rest } = obj;
  return rest;
}

// --- per-collection indexers (record -> row + reconcile) ---

export async function indexScene(
  uri: string,
  authorDid: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  if (await blockedByTombstone(uri, meta.rev)) return;
  const loc = (record.location as Record<string, unknown>) ?? {};
  const values = {
    uri,
    authorDid,
    name: record.name as string,
    handle: (record.handle as string) ?? null,
    description: (record.description as string) ?? null,
    type: (record.type as string) ?? null,
    visibility: (record.visibility as string) ?? "public",
    memberPolicy: (record.memberPolicy as string) ?? "attestation",
    governanceMode: (record.governanceMode as string) ?? "administered",
    locationName: (loc.name as string) ?? null,
    locationLat: (loc.lat as string) ?? null,
    locationLon: (loc.lon as string) ?? null,
    locationLocality: (loc.locality as string) ?? null,
    locationRegion: (loc.region as string) ?? null,
    locationCountry: (loc.country as string) ?? null,
    tags: (record.tags as string[]) ?? null,
    createdAt: new Date(record.createdAt as string),
    ...provValues(meta),
  };
  await db
    .insert(scenes)
    .values(values)
    .onConflictDoUpdate({
      target: scenes.uri,
      set: omit(values, "uri"),
      setWhere: setWhere(meta, scenes.source, scenes.rev),
    });
}

export async function indexMembership(
  uri: string,
  authorDid: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  if (await blockedByTombstone(uri, meta.rev)) return;
  const sceneUri = (record.scene as { uri: string }).uri;

  // Firehose authz: a membership is only trustworthy if its author may manage
  // the scene roster — the owner (bootstrap) or an existing facilitator/steward.
  // Optimistic writes already passed action-level authz, so they're trusted.
  if (meta.source === "firehose") {
    const owner = await isSceneOwner(sceneUri, authorDid);
    if (!owner && !(await canManageMembers(sceneUri, authorDid))) {
      console.warn(`indexer: rejected unauthorized membership ${uri} from ${authorDid}`);
      return;
    }
  }

  const values = {
    uri,
    authorDid,
    sceneUri,
    memberDid: record.member as string,
    role: (record.role as string) ?? "member",
    createdAt: new Date(record.createdAt as string),
    ...provValues(meta),
  };
  await db
    .insert(memberships)
    .values(values)
    .onConflictDoUpdate({
      target: memberships.uri,
      set: omit(values, "uri"),
      setWhere: setWhere(meta, memberships.source, memberships.rev),
    });
  await recomputeMemberCount(sceneUri);
}

export async function indexAttestation(
  uri: string,
  authorDid: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  if (await blockedByTombstone(uri, meta.rev)) return;
  const values = {
    uri,
    authorDid,
    sceneUri: (record.scene as { uri: string }).uri,
    subjectDid: record.subject as string,
    statement: (record.statement as string) ?? null,
    createdAt: new Date(record.createdAt as string),
    ...provValues(meta),
  };
  await db
    .insert(attestations)
    .values(values)
    .onConflictDoUpdate({
      target: attestations.uri,
      set: omit(values, "uri"),
      setWhere: setWhere(meta, attestations.source, attestations.rev),
    });
}

export async function indexEvent(
  uri: string,
  authorDid: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  if (await blockedByTombstone(uri, meta.rev)) return;
  const locations = record.locations as Array<Record<string, unknown>> | undefined;
  const loc = locations?.[0] ?? {};
  const uris = record.uris as string[] | undefined;
  const virtualUri = uris?.find(
    (u) => u.startsWith("https://zoom.") || u.startsWith("https://meet."),
  );
  const values = {
    uri,
    authorDid,
    name: record.name as string,
    description: (record.description as string) ?? null,
    startsAt: new Date(record.startsAt as string),
    endsAt: record.endsAt ? new Date(record.endsAt as string) : null,
    mode: (record.mode as string) ?? null,
    status: (record.status as string) ?? "scheduled",
    locationName: (loc.name as string) ?? null,
    locationLat: ("lat" in loc ? (loc.lat as string) : null) ?? null,
    locationLon: ("lon" in loc ? (loc.lon as string) : null) ?? null,
    locationLocality: ("locality" in loc ? (loc.locality as string) : null) ?? null,
    locationAddress: ("street" in loc ? (loc.street as string) : null) ?? null,
    virtualUri: virtualUri ?? null,
    createdAt: new Date(record.createdAt as string),
    ...provValues(meta),
  };
  await db
    .insert(events)
    .values(values)
    .onConflictDoUpdate({
      target: events.uri,
      set: omit(values, "uri"),
      setWhere: setWhere(meta, events.source, events.rev),
    });
}

export async function indexEventContext(
  uri: string,
  authorDid: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  if (await blockedByTombstone(uri, meta.rev)) return;
  const sceneUri = (record.scene as { uri: string }).uri;

  // Firehose authz: only a builder+ of the scene may curate an event onto it.
  if (meta.source === "firehose") {
    if (!(await canCurate(sceneUri, authorDid))) {
      console.warn(`indexer: rejected unauthorized eventContext ${uri} from ${authorDid}`);
      return;
    }
  }

  const values = {
    uri,
    authorDid,
    eventUri: (record.event as { uri: string }).uri,
    sceneUri,
    curatedByDid: (record.curatedBy as string) ?? null,
    visibility: (record.visibility as string) ?? "public",
    pinned: (record.pinned as boolean) ?? false,
    createdAt: new Date(record.createdAt as string),
    ...provValues(meta),
  };
  await db
    .insert(eventContexts)
    .values(values)
    .onConflictDoUpdate({
      target: eventContexts.uri,
      set: omit(values, "uri"),
      setWhere: setWhere(meta, eventContexts.source, eventContexts.rev),
    });
}

export async function indexRsvp(
  uri: string,
  authorDid: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  if (await blockedByTombstone(uri, meta.rev)) return;
  const values = {
    uri,
    authorDid,
    eventUri: (record.subject as { uri: string }).uri,
    status: record.status as string,
    createdAt: new Date(record.createdAt as string),
    ...provValues(meta),
  };
  await db
    .insert(rsvps)
    .values(values)
    .onConflictDoUpdate({
      target: rsvps.uri,
      set: omit(values, "uri"),
      setWhere: setWhere(meta, rsvps.source, rsvps.rev),
    });

  // Every indexed RSVP — ours OR a firehose RSVP from another app — runs through
  // the same seat arbitration. Idempotent on (eventUri, attendeeDid), so the
  // firehose echo of our optimistic RSVP doesn't re-arbitrate or move the queue.
  await arbitrateSeat(values.eventUri, authorDid, uri, values.status);
}

// --- Capacity arbitration (the keystone) ---

export async function indexEventConfig(
  uri: string,
  authorDid: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  if (await blockedByTombstone(uri, meta.rev)) return;
  const eventUri = (record.event as { uri: string }).uri;
  const capacity = (record.maxAttendees as number | undefined) ?? null;
  const approvalRequired = (record.approvalRequired as boolean) ?? false;
  const waitlistEnabled = (record.waitlistEnabled as boolean) ?? true;

  // Upsert the inventory row's policy. Counts are owned by arbitration, so we
  // never overwrite confirmedCount/waitlistSeq here.
  await db
    .insert(eventInventory)
    .values({ eventUri, capacity, approvalRequired, waitlistEnabled, updatedAt: meta.now })
    .onConflictDoUpdate({
      target: eventInventory.eventUri,
      set: { capacity, approvalRequired, waitlistEnabled, updatedAt: meta.now },
    });
}

const SEAT_SEEKING = "going"; // community.lexicon.calendar.rsvp status that wants a seat

/**
 * Decide a seat for (event, attendee) under capacity, in a single Postgres
 * transaction that locks the event's inventory row (FOR UPDATE). This is the
 * legitimate centralization: atomicity across attendee PDSes is impossible, so
 * Postgres is the serialization point. Idempotent: a 'going' RSVP whose seat is
 * already decided is a no-op (no double-count, no queue movement).
 */
export async function arbitrateSeat(
  eventUri: string,
  attendeeDid: string,
  rsvpUri: string,
  rsvpStatus: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    // Ensure a locked inventory row exists (uncapped default if none yet).
    await tx
      .insert(eventInventory)
      .values({ eventUri, updatedAt: now })
      .onConflictDoNothing();
    const [inv] = await tx
      .select()
      .from(eventInventory)
      .where(eq(eventInventory.eventUri, eventUri))
      .for("update");
    if (!inv) return;

    const [existing] = await tx
      .select()
      .from(acceptances)
      .where(
        and(eq(acceptances.eventUri, eventUri), eq(acceptances.attendeeDid, attendeeDid)),
      )
      .limit(1);

    const wantsSeat = rsvpStatus === SEAT_SEEKING;
    const hasActiveSeat =
      existing && ["confirmed", "waitlisted", "requested"].includes(existing.state);

    if (!wantsSeat) {
      // Released (notgoing / interested). Free a confirmed seat; NO auto-promote
      // (Luma's deliberate default — avoids surprise charges/confusion).
      if (existing && existing.state !== "declined") {
        if (existing.state === "confirmed") {
          await tx
            .update(eventInventory)
            .set({ confirmedCount: Math.max(0, inv.confirmedCount - 1), updatedAt: now })
            .where(eq(eventInventory.eventUri, eventUri));
        }
        await tx
          .update(acceptances)
          .set({ state: "declined", position: null, rsvpUri, decidedAt: now })
          .where(
            and(eq(acceptances.eventUri, eventUri), eq(acceptances.attendeeDid, attendeeDid)),
          );
      }
      return;
    }

    // wantsSeat: idempotent if already seated/queued.
    if (hasActiveSeat) return;

    // Assign a fresh seat.
    let state: string;
    let position: number | null = null;
    let newConfirmed = inv.confirmedCount;
    let newSeq = inv.waitlistSeq;

    if (inv.approvalRequired) {
      state = "requested"; // consumes no seat until a host confirms
    } else if (inv.capacity == null || inv.confirmedCount < inv.capacity) {
      state = "confirmed";
      newConfirmed = inv.confirmedCount + 1;
    } else if (inv.waitlistEnabled) {
      state = "waitlisted";
      newSeq = inv.waitlistSeq + 1;
      position = newSeq;
    } else {
      state = "declined"; // full, no waitlist
    }

    await tx
      .insert(acceptances)
      .values({ eventUri, attendeeDid, rsvpUri, state, position, decidedAt: now })
      .onConflictDoUpdate({
        target: [acceptances.eventUri, acceptances.attendeeDid],
        set: { rsvpUri, state, position, decidedAt: now },
      });

    if (newConfirmed !== inv.confirmedCount || newSeq !== inv.waitlistSeq) {
      await tx
        .update(eventInventory)
        .set({ confirmedCount: newConfirmed, waitlistSeq: newSeq, updatedAt: now })
        .where(eq(eventInventory.eventUri, eventUri));
    }
  });
}

/**
 * Host approves a 'requested' attendee → confirmed (capacity permitting).
 * Runs under the inventory lock so it can't oversell against concurrent RSVPs.
 */
export async function approveRequest(
  eventUri: string,
  attendeeDid: string,
  decision: "confirm" | "decline",
  now: Date = new Date(),
): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(eventInventory)
      .where(eq(eventInventory.eventUri, eventUri))
      .for("update");
    const [acc] = await tx
      .select()
      .from(acceptances)
      .where(
        and(eq(acceptances.eventUri, eventUri), eq(acceptances.attendeeDid, attendeeDid)),
      )
      .limit(1);
    if (!acc || acc.state !== "requested") return { ok: false, reason: "not pending" };

    if (decision === "decline") {
      await tx
        .update(acceptances)
        .set({ state: "declined", decidedAt: now })
        .where(and(eq(acceptances.eventUri, eventUri), eq(acceptances.attendeeDid, attendeeDid)));
      return { ok: true };
    }

    if (inv && inv.capacity != null && inv.confirmedCount >= inv.capacity) {
      if (!inv.waitlistEnabled) return { ok: false, reason: "full" };
      const pos = inv.waitlistSeq + 1;
      await tx
        .update(acceptances)
        .set({ state: "waitlisted", position: pos, decidedAt: now })
        .where(and(eq(acceptances.eventUri, eventUri), eq(acceptances.attendeeDid, attendeeDid)));
      await tx
        .update(eventInventory)
        .set({ waitlistSeq: pos, updatedAt: now })
        .where(eq(eventInventory.eventUri, eventUri));
      return { ok: true, reason: "waitlisted (full)" };
    }

    await tx
      .update(acceptances)
      .set({ state: "confirmed", position: null, decidedAt: now })
      .where(and(eq(acceptances.eventUri, eventUri), eq(acceptances.attendeeDid, attendeeDid)));
    if (inv) {
      await tx
        .update(eventInventory)
        .set({ confirmedCount: inv.confirmedCount + 1, updatedAt: now })
        .where(eq(eventInventory.eventUri, eventUri));
    }
    return { ok: true };
  });
}

// --- identity + deletes ---

export async function indexIdentity(
  did: string,
  handle: string,
  active: boolean,
  now: Date,
): Promise<void> {
  await db
    .insert(accounts)
    .values({ did, handle, active, indexedAt: now })
    .onConflictDoUpdate({ target: accounts.did, set: { handle, active, indexedAt: now } });
}

export async function deleteAccount(did: string): Promise<void> {
  await db.delete(accounts).where(eq(accounts.did, did));
}

/**
 * Apply a record deletion: hard-delete the row and write a tombstone so a late
 * or replayed create cannot resurrect it. Recomputes member count on membership
 * deletes.
 */
export async function applyDelete(
  uri: string,
  collection: string,
  rev: string | null,
  now: Date,
): Promise<void> {
  // capture sceneUri before deleting a membership so we can recompute its count
  let membershipScene: string | null = null;
  if (collection === "social.scenius.membership") {
    const [m] = await db
      .select({ sceneUri: memberships.sceneUri })
      .from(memberships)
      .where(eq(memberships.uri, uri))
      .limit(1);
    membershipScene = m?.sceneUri ?? null;
  }

  // capture rsvp's event+attendee before deleting so we can release its seat
  let releasedRsvp: { eventUri: string; attendeeDid: string } | null = null;
  if (collection === "community.lexicon.calendar.rsvp") {
    const [r] = await db
      .select({ eventUri: rsvps.eventUri, authorDid: rsvps.authorDid })
      .from(rsvps)
      .where(eq(rsvps.uri, uri))
      .limit(1);
    if (r) releasedRsvp = { eventUri: r.eventUri, attendeeDid: r.authorDid };
  }

  switch (collection) {
    case "community.lexicon.calendar.event":
      await db.delete(events).where(eq(events.uri, uri));
      break;
    case "community.lexicon.calendar.rsvp":
      await db.delete(rsvps).where(eq(rsvps.uri, uri));
      break;
    case "social.scenius.scene":
      await db.delete(scenes).where(eq(scenes.uri, uri));
      break;
    case "social.scenius.membership":
      await db.delete(memberships).where(eq(memberships.uri, uri));
      break;
    case "social.scenius.attestation":
      await db.delete(attestations).where(eq(attestations.uri, uri));
      break;
    case "social.scenius.eventContext":
      await db.delete(eventContexts).where(eq(eventContexts.uri, uri));
      break;
    case "social.scenius.eventConfig":
      // policy record gone — leave the inventory ledger (counts) intact
      break;
  }

  await db
    .insert(tombstones)
    .values({ uri, collection, rev, deletedAt: now })
    .onConflictDoUpdate({ target: tombstones.uri, set: { rev, deletedAt: now } });

  if (membershipScene) await recomputeMemberCount(membershipScene);
  // deleting an RSVP releases its seat (treated as 'notgoing'; no auto-promote)
  if (releasedRsvp) {
    await arbitrateSeat(releasedRsvp.eventUri, releasedRsvp.attendeeDid, uri, "notgoing", now);
  }
}

/** Dispatch a record create/update by collection (used by the firehose webhook). */
export async function indexRecord(
  collection: string,
  uri: string,
  did: string,
  record: Record<string, unknown>,
  meta: IndexMeta,
): Promise<void> {
  switch (collection) {
    case "community.lexicon.calendar.event":
      return indexEvent(uri, did, record, meta);
    case "community.lexicon.calendar.rsvp":
      return indexRsvp(uri, did, record, meta);
    case "social.scenius.scene":
      return indexScene(uri, did, record, meta);
    case "social.scenius.membership":
      return indexMembership(uri, did, record, meta);
    case "social.scenius.attestation":
      return indexAttestation(uri, did, record, meta);
    case "social.scenius.eventContext":
      return indexEventContext(uri, did, record, meta);
    case "social.scenius.eventConfig":
      return indexEventConfig(uri, did, record, meta);
  }
}
