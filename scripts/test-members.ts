/**
 * Membership-management gate (real PDS): a steward adds members, re-roles,
 * removes, and the hierarchy rule holds.
 *   BSKY_HANDLE=… BSKY_APP_PASSWORD=… DATABASE_URL=… npx tsx scripts/test-members.ts
 */
import { AtpAgent } from "@atproto/api";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { scenes, memberships } from "../lib/db/schema";
import { parseAtUri } from "../lib/scenius/atproto";
import { createScene, addMember, removeMember } from "../lib/scenius/write";

const HANDLE = "zz-members-test";
const M1 = "did:plc:zzmembertest1";
const M2 = "did:plc:zzmembertest2";
const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => { console.log(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
let failed = false;

async function roleOf(sceneUri: string, did: string) {
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.sceneUri, sceneUri), eq(memberships.memberDid, did)))
    .limit(1);
  return m?.role ?? null;
}
async function memberCount(sceneUri: string) {
  const [s] = await db.select({ n: scenes.memberCount }).from(scenes).where(eq(scenes.uri, sceneUri)).limit(1);
  return s?.n ?? 0;
}

async function cleanup(agent: AtpAgent, did: string) {
  const [s] = await db.select().from(scenes).where(eq(scenes.handle, HANDLE)).limit(1);
  if (!s) return;
  const mems = await db.select().from(memberships).where(eq(memberships.sceneUri, s.uri));
  for (const uri of [...mems.map((m) => m.uri), s.uri]) {
    try {
      const { did: owner, collection, rkey } = parseAtUri(uri);
      if (owner === did) await agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey });
    } catch { /* best-effort */ }
  }
  await db.delete(memberships).where(eq(memberships.sceneUri, s.uri));
  await db.delete(scenes).where(eq(scenes.uri, s.uri));
}

async function main() {
  console.log("\n— scenius: membership management gate —\n");
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: process.env.BSKY_HANDLE!, password: process.env.BSKY_APP_PASSWORD! });
  const did = agent.session!.did;
  await cleanup(agent, did);

  try {
    const scene = await createScene(agent, did, {
      name: "Members Test", handle: HANDLE, type: "interest",
      visibility: "public", memberPolicy: "invite", governanceMode: "administered",
    });
    (await roleOf(scene.uri, did)) === "steward" ? ok("creator is steward") : bad("creator not steward");
    (await memberCount(scene.uri)) === 1 ? ok("memberCount = 1") : bad(`memberCount ${await memberCount(scene.uri)}`);

    // steward adds a builder
    await addMember(agent, did, scene.uri, M1, "builder");
    (await roleOf(scene.uri, M1)) === "builder" ? ok("added M1 as builder") : bad("M1 not builder");
    (await memberCount(scene.uri)) === 2 ? ok("memberCount = 2") : bad(`memberCount ${await memberCount(scene.uri)}`);

    // re-role M1 to facilitator (deterministic rkey → updates, no dup)
    await addMember(agent, did, scene.uri, M1, "facilitator");
    (await roleOf(scene.uri, M1)) === "facilitator" ? ok("re-roled M1 to facilitator (no duplicate)") : bad("re-role failed");
    (await memberCount(scene.uri)) === 2 ? ok("memberCount still 2 after re-role") : bad(`memberCount ${await memberCount(scene.uri)}`);

    // steward can grant steward
    await addMember(agent, did, scene.uri, M2, "steward");
    (await roleOf(scene.uri, M2)) === "steward" ? ok("steward granted steward to M2") : bad("steward grant failed");

    // remove M1
    await removeMember(agent, did, scene.uri, M1);
    (await roleOf(scene.uri, M1)) === null ? ok("removed M1") : bad("M1 not removed");
    (await memberCount(scene.uri)) === 2 ? ok("memberCount = 2 after removal (steward + M2)") : bad(`memberCount ${await memberCount(scene.uri)}`);
  } catch (err) {
    bad("flow threw: " + (err instanceof Error ? err.message : String(err)));
  } finally {
    await cleanup(agent, did);
    ok("cleaned up");
  }

  console.log(failed ? "\n\x1b[31m▶ MEMBERS GATE FAILED\x1b[0m\n" : "\n\x1b[32m▶ MEMBERS GATE PASSED\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
void inArray;
