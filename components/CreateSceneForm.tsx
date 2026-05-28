"use client";

import { useActionState } from "react";
import { createSceneAction, type CreateSceneState } from "@/app/scenes/new/actions";

const initial: CreateSceneState = {};

export function CreateSceneForm() {
  const [state, formAction, pending] = useActionState(createSceneAction, initial);

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Name" hint="What the scene is called.">
        <input
          name="name"
          required
          maxLength={256}
          placeholder="Boulder Ecstatic Dance"
          className="input"
        />
      </Field>

      <Field
        label="Handle"
        hint="The URL slug (scenius.social/s/…). Leave blank to derive from the name."
      >
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary text-sm select-none">
            /s/
          </span>
          <input
            name="handle"
            maxLength={64}
            placeholder="boulder-ecstatic-dance"
            className="input pl-9"
          />
        </div>
      </Field>

      <Field label="What kind of scene?" hint="">
        <select name="type" defaultValue="interest" className="input">
          <option value="interest">Interest — defined by what people gather around</option>
          <option value="place">Place — a neighborhood, venue, or city</option>
          <option value="hybrid">Hybrid — both a place and an interest</option>
        </select>
      </Field>

      <Field label="Description" hint="A sentence or two about the scene.">
        <textarea
          name="description"
          rows={3}
          maxLength={3000}
          placeholder="Weekly freeform dance gatherings in Boulder — no talking on the floor, all bodies welcome."
          className="input resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City / locality" hint="">
          <input name="locality" placeholder="Boulder" className="input" />
        </Field>
        <Field label="Region" hint="">
          <input name="region" placeholder="CO" className="input" />
        </Field>
      </div>

      <Field label="Venue name" hint="Optional — if this scene has a home base.">
        <input name="locationName" placeholder="RegenHub" className="input" />
      </Field>

      <input type="hidden" name="visibility" value="public" />

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
        {pending ? "Creating scene…" : "Create scene"}
      </button>
      <p className="text-center text-xs text-text-tertiary">
        You&apos;ll become the scene&apos;s first steward. The record is written to
        your own PDS.
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
