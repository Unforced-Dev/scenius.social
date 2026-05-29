import { AtpAgent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  scenes,
  memberships,
  attestations,
  events,
  eventContexts,
  rsvps,
} from "@/lib/db/schema";

/**
 * Orphan sweep — turns optimistic rows into verifiable claims.
 *
 * For every row that is still `source='optimistic'`, unconfirmed, and older
 * than the TTL, read it back from its author's PDS:
 *   - present  → promote (set confirmedAt) so the UI's "confirmed" is grounded
 *     in the PDS write, not just our cache
 *   - absent   → roll back (delete the row); the write never durably landed
 *
 * The TTL is generous (default 10 min) so healthy writes are never falsely
 * rolled back during firehose/backfill lag.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

// Heterogeneous table iteration — Drizzle's generics don't unify across
// different table types, so we type the table loosely here. All six share the
// provenance columns (uri/authorDid/source/confirmedAt/pendingSince) at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

const TABLES: Array<{ name: string; table: AnyTable }> = [
  { name: "scenes", table: scenes },
  { name: "memberships", table: memberships },
  { name: "attestations", table: attestations },
  { name: "events", table: events },
  { name: "eventContexts", table: eventContexts },
  { name: "rsvps", table: rsvps },
];

const pdsCache = new Map<string, string>();

/** Resolve a DID's PDS service endpoint via the PLC directory (did:plc). */
async function resolvePds(did: string): Promise<string> {
  if (pdsCache.has(did)) return pdsCache.get(did)!;
  let endpoint = "https://bsky.social";
  try {
    const res = await fetch(`https://plc.directory/${did}`);
    if (res.ok) {
      const doc = (await res.json()) as { service?: Array<{ id: string; serviceEndpoint: string }> };
      const svc = doc.service?.find((s) => s.id === "#atproto_pds");
      if (svc?.serviceEndpoint) endpoint = svc.serviceEndpoint;
    }
  } catch {
    /* fall back to bsky.social */
  }
  pdsCache.set(did, endpoint);
  return endpoint;
}

async function existsOnPds(uri: string, authorDid: string): Promise<boolean> {
  const u = new AtUri(uri);
  const service = await resolvePds(authorDid);
  const agent = new AtpAgent({ service });
  try {
    await agent.com.atproto.repo.getRecord({
      repo: authorDid,
      collection: u.collection,
      rkey: u.rkey,
    });
    return true;
  } catch (err) {
    // A 400-class XRPC error means the record/repo genuinely isn't there
    // (RecordNotFound, RepoNotFound, could-not-resolve-did, InvalidRequest) →
    // treat as absent and roll back. Only 5xx / network / timeout are transient
    // (rethrow so the sweep skips rather than wrongly deleting).
    const e = err as { status?: number; error?: string; message?: string };
    const status = e?.status;
    const text = `${e?.error ?? ""} ${e?.message ?? ""}`;
    if (
      status === 400 ||
      status === 404 ||
      /not ?found|could not (find|locate|resolve)|repo.?not.?found|record.?not.?found|invalidrequest/i.test(
        text,
      )
    ) {
      return false;
    }
    throw err; // genuine transient failure
  }
}

export async function runOrphanSweep(
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<{ promoted: number; rolledBack: number; checked: number; skipped: number }> {
  const cutoff = new Date(Date.now() - ttlMs);
  const now = new Date();
  let promoted = 0;
  let rolledBack = 0;
  let checked = 0;
  let skipped = 0;

  for (const { table } of TABLES) {
    const rows: Array<{ uri: string; authorDid: string }> = await db
      .select({ uri: table.uri, authorDid: table.authorDid })
      .from(table)
      .where(
        and(
          eq(table.source, "optimistic"),
          isNull(table.confirmedAt),
          lt(table.pendingSince, cutoff),
        ),
      );

    for (const row of rows) {
      checked++;
      let present: boolean;
      try {
        present = await existsOnPds(row.uri, row.authorDid);
      } catch {
        skipped++; // transient — try again next sweep
        continue;
      }
      if (present) {
        await db.update(table).set({ confirmedAt: now }).where(eq(table.uri, row.uri));
        promoted++;
      } else {
        await db.delete(table).where(eq(table.uri, row.uri));
        rolledBack++;
      }
    }
  }

  return { promoted, rolledBack, checked, skipped };
}
