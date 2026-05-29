/**
 * Import a Luma (or any .ics) calendar into a scenius scene — the RegenHub
 * off-Luma migration tool. Fetches the ICS and creates a calendar event +
 * eventContext per upcoming event, curated onto the target scene. Idempotent.
 * The host (app-password account) must hold a curation role in the scene.
 *
 *   BSKY_HANDLE=… BSKY_APP_PASSWORD=… DATABASE_URL=… \
 *     npx tsx scripts/import-luma.ts <ics-url-or-file> <scene-handle> [--past]
 */
import { readFileSync } from "node:fs";
import { AtpAgent } from "@atproto/api";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { scenes } from "../lib/db/schema";
import { importEventsFromIcs } from "../lib/scenius/import";

async function loadIcs(src: string): Promise<string> {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src} → ${res.status}`);
    return res.text();
  }
  return readFileSync(src, "utf8");
}

async function main() {
  const src = process.argv[2];
  const handle = process.argv[3];
  const includePast = process.argv.includes("--past");
  if (!src || !handle) {
    console.error("usage: import-luma.ts <ics-url-or-file> <scene-handle> [--past]");
    process.exit(1);
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: process.env.BSKY_HANDLE!, password: process.env.BSKY_APP_PASSWORD! });
  const did = agent.session!.did;

  const [scene] = await db.select().from(scenes).where(eq(scenes.handle, handle)).limit(1);
  if (!scene) { console.error(`no scene "${handle}" — create it first`); process.exit(1); }

  const r = await importEventsFromIcs(agent, did, scene.uri, await loadIcs(src), { includePast });
  console.log(
    `import → parsed ${r.parsed}, created ${r.created}, skipped ${r.skipped} (already present), failed ${r.failed}`,
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
