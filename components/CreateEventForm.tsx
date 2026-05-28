"use client";

import { useActionState } from "react";
import {
  createEventAction,
  type CreateEventState,
} from "@/app/s/[handle]/events/new/actions";

const initial: CreateEventState = {};

export function CreateEventForm({ sceneHandle }: { sceneHandle: string }) {
  const [state, formAction, pending] = useActionState(createEventAction, initial);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="sceneHandle" value={sceneHandle} />

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

      <Field label="Location" hint="Venue or place name.">
        <input name="locationName" placeholder="RegenHub" className="input" />
      </Field>

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
