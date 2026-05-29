"use client";

import { useActionState } from "react";
import {
  createEventAction,
  type CreateEventState,
} from "@/app/s/[handle]/events/new/actions";

const initial: CreateEventState = {};

export function CreateEventForm({ sceneHandle }: { sceneHandle: string }) {
  const [state, formAction, pending] = useActionState(createEventAction, initial);

  // Compute the UTC instant HERE, in the organizer's browser, where their zone
  // is known, and stash it (+ tzid) in hidden fields so the standard form action
  // sends them. The server must NOT re-parse the naive date/time in its own zone.
  function recompute(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const date = (form.elements.namedItem("date") as HTMLInputElement)?.value;
    const st = (form.elements.namedItem("startTime") as HTMLInputElement)?.value;
    const et = (form.elements.namedItem("endTime") as HTMLInputElement)?.value;
    const set = (name: string, val: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (el) el.value = val;
    };
    if (date && st) set("startsAtUtc", new Date(`${date}T${st}`).toISOString());
    if (date && et) set("endsAtUtc", new Date(`${date}T${et}`).toISOString());
    set("tzid", Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  return (
    <form action={formAction} onChange={recompute} className="space-y-5">
      <input type="hidden" name="sceneHandle" value={sceneHandle} />
      <input type="hidden" name="tzid" defaultValue="" />
      <input type="hidden" name="startsAtUtc" defaultValue="" />
      <input type="hidden" name="endsAtUtc" defaultValue="" />

      <Field label="Event name" hint="">
        <input
          name="name"
          required
          maxLength={256}
          placeholder="Sunday Morning Dance Wave"
          className="input"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Date" hint="">
          <input name="date" type="date" required className="input" />
        </Field>
        <Field label="Start" hint="">
          <input name="startTime" type="time" required className="input" />
        </Field>
        <Field label="End" hint="">
          <input name="endTime" type="time" className="input" />
        </Field>
      </div>

      <Field label="Format" hint="">
        <select name="mode" defaultValue="inperson" className="input">
          <option value="inperson">In person</option>
          <option value="virtual">Online</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Venue" hint="Place name.">
          <input name="locationName" placeholder="RegenHub" className="input" />
        </Field>
        <Field label="City" hint="For discovery.">
          <input name="locality" placeholder="Boulder" className="input" />
        </Field>
      </div>

      <Field label="Meeting link" hint="Optional — for online/hybrid events.">
        <input name="virtualUri" type="url" placeholder="https://…" className="input" />
      </Field>

      <Field label="Description" hint="">
        <textarea
          name="description"
          rows={4}
          maxLength={3000}
          placeholder="What's happening, what to bring, who it's for…"
          className="input resize-none"
        />
      </Field>

      <div className="rounded-xl border border-hairline bg-paper/50 p-4 space-y-4">
        <p className="kicker text-[10px] text-ink-3">Capacity</p>
        <Field label="Max attendees" hint="Leave blank for unlimited.">
          <input name="capacity" type="number" min={1} placeholder="40" className="input" />
        </Field>
        <label className="flex items-center gap-2.5 text-sm">
          <input name="approvalRequired" type="checkbox" className="h-4 w-4 accent-brick" />
          <span>Require host approval (RSVPs are requests until you confirm)</span>
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input name="waitlistEnabled" type="checkbox" defaultChecked className="h-4 w-4 accent-brick" />
          <span>Waitlist once full</span>
        </label>
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200/60 px-3 py-2">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-text py-2.5 text-sm font-semibold text-surface-raised hover:bg-text/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
      >
        {pending ? "Adding event…" : "Add to scene calendar"}
      </button>
      <p className="text-center text-xs text-text-tertiary">
        The event is written to your PDS as a standard calendar event and curated
        onto this scene.
      </p>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          outline: none;
          transition: all 0.15s;
        }
        .input::placeholder { color: var(--color-text-tertiary); }
        .input:focus {
          border-color: var(--color-scenius-400);
          box-shadow: 0 0 0 2px var(--color-scenius-100);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}
