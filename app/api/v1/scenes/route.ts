import { NextRequest, NextResponse } from "next/server";
import { listScenes } from "@/lib/scenius/discover";
import { serializeScene } from "@/lib/scenius/api-serialize";

/** GET /api/v1/scenes — list public scenes. Query: q, city, tag, limit, offset. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const limit = Math.min(Number(p.get("limit") ?? 50) || 50, 100);
  const offset = Math.max(Number(p.get("offset") ?? 0) || 0, 0);

  const scenes = await listScenes({
    q: p.get("q") ?? undefined,
    locality: p.get("city") ?? undefined,
    tag: p.get("tag") ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json(
    { scenes: scenes.map(serializeScene), count: scenes.length, limit, offset },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
