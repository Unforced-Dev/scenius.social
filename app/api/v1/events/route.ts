import { NextRequest, NextResponse } from "next/server";
import { searchEvents } from "@/lib/scenius/discover";
import { serializeEvent } from "@/lib/scenius/api-serialize";

/**
 * GET /api/v1/events — search curated events.
 * Query: q, scene, city (locality), tag, limit, offset, past=1
 * Public, anonymous-OK. This is the "what's happening" surface (web + MCP).
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const limit = Math.min(Number(p.get("limit") ?? 25) || 25, 100);
  const offset = Math.max(Number(p.get("offset") ?? 0) || 0, 0);

  const results = await searchEvents({
    q: p.get("q") ?? undefined,
    scene: p.get("scene") ?? undefined,
    locality: p.get("city") ?? undefined,
    tag: p.get("tag") ?? undefined,
    includePast: p.get("past") === "1",
    limit,
    offset,
  });

  return NextResponse.json(
    { events: results.map(serializeEvent), count: results.length, limit, offset },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
