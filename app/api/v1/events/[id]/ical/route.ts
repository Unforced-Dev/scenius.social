import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { buildCalendar, type IcsEvent } from "@/lib/scenius/ical";

/** GET /api/v1/events/:id/ical — single-event .ics ("add to calendar"). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const uri = decodeURIComponent(id);
  const [event] = await db.select().from(events).where(eq(events.uri, uri)).limit(1);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ics = buildCalendar(event.name, [event as IcsEvent]);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="event.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
