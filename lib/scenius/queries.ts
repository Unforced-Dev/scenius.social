import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scenes, memberships } from "@/lib/db/schema";

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
