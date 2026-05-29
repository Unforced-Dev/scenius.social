import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { scenes, events, eventContexts } from "@/lib/db/schema";
import { buildCalendar, type IcsEvent } from "@/lib/scenius/ical";

/** GET /api/v1/scenes/:handle/ical — subscribable .ics feed for a scene. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const [scene] = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.handle, handle), eq(scenes.visibility, "public")))
    .limit(1);
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // include a window of past + all future so subscribers keep recent context
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      uri: events.uri,
      name: events.name,
      description: events.description,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      locationName: events.locationName,
      status: events.status,
      cancelledAt: events.cancelledAt,
    })
    .from(events)
    .innerJoin(eventContexts, eq(events.uri, eventContexts.eventUri))
    .where(and(eq(eventContexts.sceneUri, scene.uri), gte(events.startsAt, since)))
    .orderBy(asc(events.startsAt));

  const ics = buildCalendar(scene.name, rows as IcsEvent[]);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${handle}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
