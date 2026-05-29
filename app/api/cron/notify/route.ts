import { NextRequest, NextResponse } from "next/server";
import { runScheduler } from "@/lib/scenius/notify";

const CRON_SECRET = process.env.CRON_SECRET;

/** Notification scheduler cron. Point a scheduler at this every ~minute. */
export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await runScheduler();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("notify scheduler failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "scheduler failed" },
      { status: 500 },
    );
  }
}
