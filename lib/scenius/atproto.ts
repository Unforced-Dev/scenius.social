import { Agent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { getSession } from "@/lib/auth/session";

/**
 * An authenticated Agent built from the current user's OAuth session.
 * Returns null if not signed in. Use for any write to the user's PDS.
 */
export async function getAuthedAgent(): Promise<{ agent: Agent; did: string } | null> {
  const session = await getSession();
  if (!session) return null;
  const agent = new Agent(session);
  return { agent, did: session.did };
}

export type StrongRef = { uri: string; cid: string };

/**
 * Resolve an at:// URI to a strongRef (uri + current cid) by reading the
 * record from its owner's repo. atproto strongRefs require the cid.
 */
export async function resolveStrongRef(
  agent: Agent,
  uri: string,
): Promise<StrongRef> {
  const parsed = new AtUri(uri);
  const res = await agent.com.atproto.repo.getRecord({
    repo: parsed.hostname,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  if (!res.data.cid) {
    throw new Error(`No cid returned for ${uri}`);
  }
  return { uri, cid: res.data.cid };
}

export function parseAtUri(uri: string) {
  const u = new AtUri(uri);
  return { did: u.hostname, collection: u.collection, rkey: u.rkey };
}
