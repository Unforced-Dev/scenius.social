import { NextRequest, NextResponse } from "next/server";
import { Agent } from "@atproto/api";
import { getOAuthClient } from "@/lib/auth/client";
import { indexIdentity } from "@/lib/scenius/indexer";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://127.0.0.1:3000";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const client = await getOAuthClient();
    const { session } = await client.callback(params);

    // Index the signer's handle so they show up as a real host/member (the
    // firehose/Tap also does this; doing it here means it's immediate at login).
    try {
      const profile = await new Agent(session).getProfile({ actor: session.did });
      await indexIdentity(session.did, profile.data.handle, true, new Date());
    } catch {
      /* non-fatal — Tap will reconcile */
    }

    const response = NextResponse.redirect(new URL("/", PUBLIC_URL));
    response.cookies.set("did", session.did, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=login_failed", PUBLIC_URL));
  }
}
