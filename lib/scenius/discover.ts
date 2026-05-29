import { and, or, eq, gte, lte, ilike, asc, desc, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, eventContexts, scenes } from "@/lib/db/schema";

/**
 * Discovery — the read surface behind the city feed, the open HTTP API, and the
 * MCP server. v0 policy (from the strategy): curation-as-allowlist. Only events
 * a scene builder has curated onto a PUBLIC scene's calendar are discoverable;
 * uncurated firehose events are not promoted. This is the v0 defense against the
 * (deferred) trust-weighted-ranking problem — no spam in the city feed.
 */

export type EventResult = {
  uri: string;
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  mode: string | null;
  status: string;
  locationName: string | null;
  locationLocality: string | null;
  tzid: string | null;
  authorDid: string;
  pinned: boolean;
  sceneName: string;
  sceneHandle: string | null;
};

export type SearchEventsArgs = {
  q?: string;
  scene?: string; // scene handle
  locality?: string; // city, e.g. "Boulder"
  tag?: string; // scene tag
  startsAfter?: Date;
  endsBefore?: Date;
  includePast?: boolean;
  limit?: number;
  offset?: number;
};

const MAX_LIMIT = 100;

/**
 * Search curated events across all public scenes. Curated-first by construction
 * (inner join on eventContext → public scene); pinned first, then soonest.
 */
export async function searchEvents(args: SearchEventsArgs = {}): Promise<EventResult[]> {
  const limit = Math.min(args.limit ?? 25, MAX_LIMIT);
  const offset = Math.max(args.offset ?? 0, 0);
  const startsAfter = args.startsAfter ?? (args.includePast ? undefined : new Date());

  const conds = [
    eq(scenes.visibility, "public"),
    eq(eventContexts.visibility, "public"),
  ];
  if (startsAfter) conds.push(gte(events.startsAt, startsAfter));
  if (args.endsBefore) conds.push(lte(events.startsAt, args.endsBefore));
  if (args.scene) conds.push(eq(scenes.handle, args.scene));
  if (args.locality) conds.push(ilike(events.locationLocality, args.locality));
  if (args.tag) conds.push(sql`${args.tag} = ANY(${scenes.tags})`);
  if (args.q) {
    const like = `%${args.q}%`;
    conds.push(
      or(ilike(events.name, like), ilike(events.description, like))!,
    );
  }

  // An event curated into multiple scenes joins to multiple rows; fetch a wider
  // window, then dedupe by event uri (keeping the highest-ranked scene context).
  const rows = await db
    .select({
      uri: events.uri,
      name: events.name,
      description: events.description,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      mode: events.mode,
      status: events.status,
      locationName: events.locationName,
      locationLocality: events.locationLocality,
      tzid: events.tzid,
      authorDid: events.authorDid,
      pinned: eventContexts.pinned,
      sceneName: scenes.name,
      sceneHandle: scenes.handle,
    })
    .from(events)
    .innerJoin(eventContexts, eq(events.uri, eventContexts.eventUri))
    .innerJoin(scenes, eq(eventContexts.sceneUri, scenes.uri))
    .where(and(...conds))
    .orderBy(desc(eventContexts.pinned), asc(events.startsAt), asc(events.uri))
    .limit(limit * 3 + offset)
    .offset(0);

  const seen = new Set<string>();
  const deduped: EventResult[] = [];
  for (const r of rows) {
    if (seen.has(r.uri)) continue;
    seen.add(r.uri);
    deduped.push(r);
  }
  return deduped.slice(offset, offset + limit);
}

export type SceneResult = {
  uri: string;
  name: string;
  handle: string | null;
  description: string | null;
  type: string | null;
  locationLocality: string | null;
  locationRegion: string | null;
  memberCount: number;
  tags: string[] | null;
};

export type ListScenesArgs = {
  q?: string;
  locality?: string;
  tag?: string;
  limit?: number;
  offset?: number;
};

/** List public scenes with optional text/locality/tag filters. */
export async function listScenes(args: ListScenesArgs = {}): Promise<SceneResult[]> {
  const limit = Math.min(args.limit ?? 50, MAX_LIMIT);
  const offset = Math.max(args.offset ?? 0, 0);

  const conds = [eq(scenes.visibility, "public")];
  if (args.locality) conds.push(ilike(scenes.locationLocality, args.locality));
  if (args.tag) conds.push(sql`${args.tag} = ANY(${scenes.tags})`);
  if (args.q) {
    const like = `%${args.q}%`;
    conds.push(or(ilike(scenes.name, like), ilike(scenes.description, like))!);
  }

  return db
    .select({
      uri: scenes.uri,
      name: scenes.name,
      handle: scenes.handle,
      description: scenes.description,
      type: scenes.type,
      locationLocality: scenes.locationLocality,
      locationRegion: scenes.locationRegion,
      memberCount: scenes.memberCount,
      tags: scenes.tags,
    })
    .from(scenes)
    .where(and(...conds))
    .orderBy(desc(scenes.memberCount), asc(scenes.name))
    .limit(limit)
    .offset(offset);
}

/** Distinct localities that have public scenes — for the city filter. */
export async function listLocalities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ locality: scenes.locationLocality })
    .from(scenes)
    .where(and(eq(scenes.visibility, "public"), sql`${scenes.locationLocality} IS NOT NULL`));
  return rows.map((r) => r.locality!).filter(Boolean).sort();
}

// keep inArray imported for future multi-scene filters
void inArray;
