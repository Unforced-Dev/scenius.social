import { AtpAgent } from "@atproto/api";
import { indexIdentity } from "./indexer";

/**
 * DEV-ONLY test-login seam. Lets Playwright drive the authenticated UI (create
 * scene/event, RSVP) through the real server actions → PDS, without automating
 * bsky's OAuth consent page. HARD-GATED: only active when SCENIUS_DEV_LOGIN=1
 * AND not production. In normal use the flag is unset and only real atproto
 * OAuth works. Authenticates via BSKY_HANDLE / BSKY_APP_PASSWORD.
 */

let cached: { agent: AtpAgent; did: string } | null = null;

export function devLoginEnabled(): boolean {
  return process.env.SCENIUS_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";
}

export async function getDevAgent(): Promise<{ agent: AtpAgent; did: string } | null> {
  if (!devLoginEnabled()) return null;
  const handle = process.env.BSKY_HANDLE;
  const pw = process.env.BSKY_APP_PASSWORD;
  if (!handle || !pw) return null;
  if (cached) return cached;
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password: pw });
  cached = { agent, did: agent.session!.did };
  // Index the identity so the host/builder shows a real handle (no Tap locally).
  await indexIdentity(cached.did, agent.session!.handle ?? handle, true, new Date());
  return cached;
}
