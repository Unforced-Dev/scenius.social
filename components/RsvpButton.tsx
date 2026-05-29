"use client";

import { useState, useTransition } from "react";
import { rsvpAction, cancelRsvpAction } from "@/app/e/[id]/actions";

type Seat = { state: string; position: number | null } | null;

const STATE_LABEL: Record<string, string> = {
  confirmed: "You're in",
  waitlisted: "On the waitlist",
  requested: "Request pending",
  declined: "Not attending",
};

export function RsvpButton({
  eventUri,
  seat,
  approvalRequired,
  full,
}: {
  eventUri: string;
  seat: Seat;
  approvalRequired: boolean;
  full: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = seat && seat.state !== "declined";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
    });
  }

  if (active && seat) {
    const tone =
      seat.state === "confirmed"
        ? "bg-moss/10 text-moss ring-1 ring-moss/20"
        : seat.state === "waitlisted"
          ? "bg-ochre/10 text-ochre ring-1 ring-ochre/25"
          : "bg-sky/10 text-sky ring-1 ring-sky/20";
    return (
      <div className="space-y-2.5">
        <div className={`rounded-lg px-3 py-2.5 text-sm font-medium ${tone}`}>
          {STATE_LABEL[seat.state] ?? seat.state}
          {seat.state === "waitlisted" && seat.position ? ` · #${seat.position}` : ""}
        </div>
        <button
          onClick={() => run(() => cancelRsvpAction(eventUri))}
          disabled={pending}
          className="w-full rounded-lg py-2 text-sm font-medium text-ink-2 ring-1 ring-hairline hover:bg-sunken disabled:opacity-50 transition-colors"
        >
          {pending ? "…" : "Cancel RSVP"}
        </button>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  const label = approvalRequired ? "Request to join" : full ? "Join the waitlist" : "RSVP";
  return (
    <div className="space-y-2">
      <button
        onClick={() => run(() => rsvpAction(eventUri))}
        disabled={pending}
        className="w-full rounded-lg bg-brick py-2.5 text-sm font-semibold text-page hover:bg-brick/90 disabled:opacity-50 transition-colors shadow-sm"
      >
        {pending ? "…" : label}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
