"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { getAuthedAgent } from "@/lib/scenius/atproto";
import { addMember, removeMember, type AddMemberRole } from "@/lib/scenius/write";

export type MemberActionState = { error?: string; ok?: string };

async function sceneFor(handle: string) {
  const [s] = await db.select({ uri: scenes.uri }).from(scenes).where(eq(scenes.handle, handle)).limit(1);
  return s ?? null;
}

export async function addMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const auth = await getAuthedAgent();
  if (!auth) return { error: "Sign in required." };
  const handle = formData.get("sceneHandle") as string;
  const scene = await sceneFor(handle);
  if (!scene) return { error: "Scene not found." };

  const who = ((formData.get("member") as string) || "").trim();
  if (!who) return { error: "Enter a handle or DID." };
  const role = ((formData.get("role") as string) || "member") as AddMemberRole;

  try {
    await addMember(auth.agent, auth.did, scene.uri, who, role);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add member." };
  }
  revalidatePath(`/s/${handle}`);
  return { ok: `Added ${who} as ${role}.` };
}

export async function removeMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const auth = await getAuthedAgent();
  if (!auth) return { error: "Sign in required." };
  const handle = formData.get("sceneHandle") as string;
  const memberDid = formData.get("memberDid") as string;
  const scene = await sceneFor(handle);
  if (!scene) return { error: "Scene not found." };

  try {
    await removeMember(auth.agent, auth.did, scene.uri, memberDid);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove member." };
  }
  revalidatePath(`/s/${handle}`);
  return { ok: "Removed." };
}
