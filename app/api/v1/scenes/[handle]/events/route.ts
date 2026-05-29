import { NextRequest, NextResponse } from "next/server";
import { searchEvents } from "@/lib/scenius/discover";
import { serializeEvent } from "@/lib/scenius/api-serialize";

/** GET /api/v1/scenes/:handle/events — a scene's curated calendar. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const p = req.nextUrl.searchParams;
  const results = await searchEvents({
    scene: handle,
    includePast: p.get("past") === "1",
    limit: Math.min(Number(p.get("limit") ?? 50) || 50, 100),
  });
  return NextResponse.json(
    { scene: handle, events: results.map(serializeEvent), count: results.length },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
