import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, eventContexts, scenes } from "@/lib/db/schema";
import { getEventCapacity } from "@/lib/scenius/queries";
import { formatEventDateTime, eventTz } from "@/lib/scenius/time";

/** GET /api/v1/events/:id — full event detail (id = the at:// URI, encoded). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const uri = decodeURIComponent(id);

  const [event] = await db.select().from(events).where(eq(events.uri, uri)).limit(1);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [ctx, capacity] = await Promise.all([
    db
      .select({ name: scenes.name, handle: scenes.handle })
      .from(eventContexts)
      .innerJoin(scenes, eq(eventContexts.sceneUri, scenes.uri))
      .where(eq(eventContexts.eventUri, uri))
      .limit(1)
      .then((r) => r[0] ?? null),
    getEventCapacity(uri),
  ]);

  return NextResponse.json(
    {
      id: event.uri,
      name: event.name,
      description: event.description,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      timezone: eventTz(event.tzid),
      when: formatEventDateTime(event.startsAt, event.tzid),
      mode: event.mode,
      status: event.cancelledAt ? "cancelled" : event.status,
      location: event.locationName,
      locality: event.locationLocality,
      scene: ctx,
      capacity: capacity
        ? {
            limit: capacity.capacity,
            confirmed: capacity.confirmed,
            waitlisted: capacity.waitlisted,
            spotsLeft: capacity.spotsLeft,
            approvalRequired: capacity.approvalRequired,
          }
        : null,
    },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
