import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { devLoginEnabled, getDevAgent } from "@/lib/scenius/dev-auth";

/**
 * DEV-ONLY login (hard-gated). Sets the `did` cookie to the app-password account
 * so Playwright can drive the authenticated UI. 404s unless SCENIUS_DEV_LOGIN=1
 * and not production.
 */
export async function GET() {
  if (!devLoginEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const dev = await getDevAgent();
  if (!dev) return NextResponse.json({ error: "dev login unavailable" }, { status: 500 });

  const cookieStore = await cookies();
  cookieStore.set("did", dev.did, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return NextResponse.json({ ok: true, did: dev.did });
}
