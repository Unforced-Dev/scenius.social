import type { EventResult, SceneResult } from "./discover";
import { formatEventDateTime, eventTz } from "./time";

/**
 * Stable JSON shapes for the public API + MCP. atproto at:// URIs are the IDs
 * (portable). Times are given both as the UTC instant and a human string in the
 * event's own zone, so agents don't have to do timezone math.
 */

export function serializeEvent(e: EventResult) {
  return {
    id: e.uri,
    name: e.name,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    timezone: eventTz(e.tzid),
    when: formatEventDateTime(e.startsAt, e.tzid),
    mode: e.mode,
    status: e.status,
    location: e.locationName,
    locality: e.locationLocality,
    pinned: e.pinned,
    scene: { name: e.sceneName, handle: e.sceneHandle },
    url: e.sceneHandle ? `/e/${encodeURIComponent(e.uri)}` : null,
  };
}

export function serializeScene(s: SceneResult) {
  return {
    id: s.uri,
    name: s.name,
    handle: s.handle,
    description: s.description,
    type: s.type,
    locality: s.locationLocality,
    region: s.locationRegion,
    memberCount: s.memberCount,
    tags: s.tags ?? [],
    url: s.handle ? `/s/${s.handle}` : null,
  };
}
