"use server";

import { revalidatePath } from "next/cache";
import { getAuthedAgent } from "@/lib/scenius/atproto";
import { createRsvp, cancelRsvp } from "@/lib/scenius/write";

export type RsvpResult = { ok: boolean; error?: string };

export async function rsvpAction(eventUri: string): Promise<RsvpResult> {
  const auth = await getAuthedAgent();
  if (!auth) return { ok: false, error: "Please sign in to RSVP." };
  try {
    await createRsvp(auth.agent, auth.did, eventUri, "going");
  } catch (err) {
    console.error("rsvp failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "RSVP failed." };
  }
  revalidatePath(`/e/${encodeURIComponent(eventUri)}`);
  return { ok: true };
}

export async function cancelRsvpAction(eventUri: string): Promise<RsvpResult> {
  const auth = await getAuthedAgent();
  if (!auth) return { ok: false, error: "Please sign in." };
  try {
    await cancelRsvp(auth.agent, auth.did, eventUri);
  } catch (err) {
    console.error("cancel rsvp failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Could not cancel." };
  }
  revalidatePath(`/e/${encodeURIComponent(eventUri)}`);
  return { ok: true };
}
