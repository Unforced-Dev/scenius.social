import { sql, eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { scenes, memberships, eventInventory, acceptances } from "@/lib/db/schema";

/** Look up a DID's role in a scene (from the indexed memberships). */
export async function roleInScene(
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
 * Facilitators and stewards only. Same server-side-only contract as canCurate.
 */
export async function canManageMembers(
  sceneUri: string,
  did: string,
): Promise<boolean> {
  const role = await roleInScene(sceneUri, did);
  return !!role && ["facilitator", "steward"].includes(role);
}

/** Is this DID the owner (author) of the scene record? */
export async function isSceneOwner(sceneUri: string, did: string): Promise<boolean> {
  const [row] = await db
    .select({ authorDid: scenes.authorDid })
    .from(scenes)
    .where(eq(scenes.uri, sceneUri))
    .limit(1);
  return row?.authorDid === did;
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

export type EventCapacity = {
  capacity: number | null;
  approvalRequired: boolean;
  waitlistEnabled: boolean;
  confirmed: number;
  waitlisted: number;
  requested: number;
  spotsLeft: number | null; // null = unlimited
};

/** The live seat picture for an event (from the AppView-authoritative ledger). */
export async function getEventCapacity(eventUri: string): Promise<EventCapacity | null> {
  const [inv] = await db
    .select()
    .from(eventInventory)
    .where(eq(eventInventory.eventUri, eventUri))
    .limit(1);
  if (!inv) return null;

  const counts = await db
    .select({ state: acceptances.state, n: count() })
    .from(acceptances)
    .where(eq(acceptances.eventUri, eventUri))
    .groupBy(acceptances.state);
  const by = (s: string) => Number(counts.find((c) => c.state === s)?.n ?? 0);

  return {
    capacity: inv.capacity,
    approvalRequired: inv.approvalRequired,
    waitlistEnabled: inv.waitlistEnabled,
    confirmed: inv.confirmedCount,
    waitlisted: by("waitlisted"),
    requested: by("requested"),
    spotsLeft: inv.capacity == null ? null : Math.max(0, inv.capacity - inv.confirmedCount),
  };
}

/** A specific attendee's seat state for an event, or null if they haven't RSVP'd. */
export async function getSeatState(
  eventUri: string,
  did: string,
): Promise<{ state: string; position: number | null } | null> {
  const [row] = await db
    .select({ state: acceptances.state, position: acceptances.position })
    .from(acceptances)
    .where(and(eq(acceptances.eventUri, eventUri), eq(acceptances.attendeeDid, did)))
    .limit(1);
  return row ?? null;
}
