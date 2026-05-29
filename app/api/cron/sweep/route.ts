import { NextRequest, NextResponse } from "next/server";
import { runOrphanSweep } from "@/lib/scenius/sweep";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Orphan-sweep cron endpoint. Point a scheduler (Vercel Cron, etc.) at this
 * every ~30s. Promotes optimistic rows confirmed on the PDS; rolls back rows
 * whose PDS write never durably landed.
 */
export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await runOrphanSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("orphan sweep failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sweep failed" },
      { status: 500 },
    );
  }
}
