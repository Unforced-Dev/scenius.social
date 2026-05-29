import { NextRequest, NextResponse } from "next/server";
import { parseTapEvent, assureAdminAuth } from "@atproto/tap";
import { AtUri } from "@atproto/syntax";
import { db } from "@/lib/db";
import { firehoseCursor } from "@/lib/db/schema";
import {
  indexRecord,
  indexIdentity,
  deleteAccount,
  applyDelete,
} from "@/lib/scenius/indexer";

const TAP_ADMIN_PASSWORD = process.env.TAP_ADMIN_PASSWORD;

/**
 * Tap firehose webhook. Thin layer: parse the event, hand record changes to the
 * shared indexer (source:'firehose'), and persist the cursor watermark so lag
 * is observable and the consumer can resume.
 */
export async function POST(request: NextRequest) {
  if (TAP_ADMIN_PASSWORD) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      assureAdminAuth(TAP_ADMIN_PASSWORD, authHeader);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();
  const evt = parseTapEvent(body);
  const now = new Date();

  // event metadata (defensive — Tap may or may not surface these on every event)
  const e = evt as unknown as Record<string, unknown>;
  const rev = (e.rev as string) ?? null;
  const cid = (e.cid as string) ?? null;
  const cursor = (e.cursor as string) ?? (e.seq != null ? String(e.seq) : null);
  const eventTime = e.time ? new Date(e.time as string) : now;

  if (evt.type === "identity") {
    if (evt.status === "deleted") {
      await deleteAccount(evt.did);
    } else {
      await indexIdentity(evt.did, evt.handle, !!evt.isActive, now);
    }
  }

  if (evt.type === "record") {
    const uri = AtUri.make(evt.did, evt.collection, evt.rkey).toString();
    if (evt.action === "delete") {
      await applyDelete(uri, evt.collection, rev, now);
    } else {
      await indexRecord(evt.collection, uri, evt.did, evt.record as Record<string, unknown>, {
        source: "firehose",
        rev,
        cid,
        now,
      });
    }
  }

  // Persist the cursor watermark (single row, id=1).
  await db
    .insert(firehoseCursor)
    .values({ id: 1, cursor, lastEventAt: eventTime, updatedAt: now })
    .onConflictDoUpdate({
      target: firehoseCursor.id,
      set: { cursor, lastEventAt: eventTime, updatedAt: now },
    });

  return NextResponse.json({ success: true });
}
