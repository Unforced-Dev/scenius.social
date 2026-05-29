"use client";

import { useActionState } from "react";
import { addMemberAction, removeMemberAction, type MemberActionState } from "@/app/s/[handle]/members/actions";

type Member = { memberDid: string; role: string; handle: string | null; displayName: string | null };

const initial: MemberActionState = {};

const ROLE_LABEL: Record<string, string> = {
  member: "Member",
  builder: "Builder",
  facilitator: "Facilitator",
  steward: "Steward",
};

export function ManageMembers({
  sceneHandle,
  members,
  canGrantSteward,
}: {
  sceneHandle: string;
  members: Member[];
  canGrantSteward: boolean;
}) {
  const [addState, addAction, adding] = useActionState(addMemberAction, initial);
  const [rmState, rmAction] = useActionState(removeMemberAction, initial);

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-5">
      <h3 className="text-xs font-semibold tracking-wide uppercase text-text-tertiary mb-4">
        Manage members
      </h3>

      <form action={addAction} className="space-y-2.5">
        <input type="hidden" name="sceneHandle" value={sceneHandle} />
        <input
          name="member"
          placeholder="handle.bsky.social or did:plc:…"
          className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm placeholder:text-ink-3 focus:border-scenius-400 focus:outline-none"
          autoCapitalize="none"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <select name="role" defaultValue="member" className="flex-1 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm">
            <option value="member">Member</option>
            <option value="builder">Builder — can curate the calendar</option>
            <option value="facilitator">Facilitator — can manage members</option>
            {canGrantSteward && <option value="steward">Steward — co-owner</option>}
          </select>
          <button
            type="submit"
            disabled={adding}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page hover:bg-ink/90 disabled:opacity-50 transition-colors"
          >
            {adding ? "…" : "Add"}
          </button>
        </div>
        {addState.error && <p className="text-xs text-red-700">{addState.error}</p>}
        {addState.ok && <p className="text-xs text-sage-600">{addState.ok}</p>}
      </form>

      <ul className="mt-4 space-y-1.5">
        {members.map((m) => (
          <li key={m.memberDid} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-ink">{m.displayName || `@${m.handle ?? m.memberDid.slice(0, 16)}`}</span>
              <span className="ml-2 text-[10px] kicker text-ink-3">{ROLE_LABEL[m.role] ?? m.role}</span>
            </span>
            <form action={rmAction}>
              <input type="hidden" name="sceneHandle" value={sceneHandle} />
              <input type="hidden" name="memberDid" value={m.memberDid} />
              <button
                type="submit"
                className="text-xs text-ink-3 hover:text-red-700 transition-colors"
                title="Remove"
              >
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>
      {rmState.error && <p className="mt-2 text-xs text-red-700">{rmState.error}</p>}
    </div>
  );
}
