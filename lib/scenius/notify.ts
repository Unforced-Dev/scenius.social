import { and, eq, lte, lt, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationJobs, contactChannels, acceptances, events } from "@/lib/db/schema";
import { formatEventDateTime } from "./time";

/**
 * Notifications. Two concerns kept separate:
 *  - the SCHEDULER (durable jobs, leased so two workers can't double-send,
 *    exactly-once via a dedupeKey id) — fully built + testable here.
 *  - the TRANSPORT (actually sending email) — pluggable. v0 ships a dev
 *    transport that logs; Postmark is wired behind POSTMARK_TOKEN. Real delivery
 *    needs a warmed domain + ESP account (operator-provided), so it's a config
 *    swap, not a code change.
 *
 * Reminders are derived off the event's startsAt (1 day + 1 hour before) and
 * re-checked at send time against the live seat ledger, so a cancelled RSVP is
 * silently dropped without any job bookkeeping.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const LEASE_MS = 60 * 1000;
const BATCH = 25;

// --- transport ---

interface Transport {
  name: string;
  send(to: string, subject: string, body: string): Promise<void>;
}

const devTransport: Transport = {
  name: "dev",
  async send(to, subject) {
    console.log(`[notify:dev] → ${to} :: ${subject}`);
  },
};

const postmarkTransport: Transport = {
  name: "postmark",
  async send(to, subject, body) {
    const token = process.env.POSTMARK_TOKEN!;
    const from = process.env.NOTIFY_FROM || "notifications@scenius.social";
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({ From: from, To: to, Subject: subject, TextBody: body, MessageStream: "outbound" }),
    });
    if (!res.ok) throw new Error(`postmark ${res.status}: ${await res.text()}`);
  },
};

function transport(): Transport {
  return process.env.POSTMARK_TOKEN ? postmarkTransport : devTransport;
}

// --- enqueue ---

const REMINDERS: Array<{ kind: string; lead: number }> = [
  { kind: "reminder_1d", lead: DAY_MS },
  { kind: "reminder_1h", lead: HOUR_MS },
];

/** Enqueue reminder jobs for a confirmed attendee. Idempotent (dedupeKey id). */
export async function enqueueReminders(
  eventUri: string,
  recipientDid: string,
  startsAt: Date,
  now: Date = new Date(),
): Promise<void> {
  for (const { kind, lead } of REMINDERS) {
    const scheduledFor = new Date(startsAt.getTime() - lead);
    if (scheduledFor.getTime() <= now.getTime()) continue; // already past — skip
    await db
      .insert(notificationJobs)
      .values({
        id: `${kind}:${eventUri}:${recipientDid}`,
        kind,
        recipientDid,
        eventUri,
        scheduledFor,
      })
      .onConflictDoNothing();
  }
}

// --- run ---

export type SchedulerResult = { claimed: number; sent: number; skipped: number; failed: number };

/**
 * Claim due jobs (leased, SKIP LOCKED so concurrent workers don't collide),
 * re-validate the seat, resolve a verified email, send, and mark terminal.
 */
export async function runScheduler(now: Date = new Date()): Promise<SchedulerResult> {
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(notificationJobs)
      .where(
        and(
          eq(notificationJobs.status, "pending"),
          lte(notificationJobs.scheduledFor, now),
          or(isNull(notificationJobs.leasedUntil), lt(notificationJobs.leasedUntil, now)),
        ),
      )
      .orderBy(notificationJobs.scheduledFor)
      .limit(BATCH)
      .for("update", { skipLocked: true });

    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    for (const j of due) {
      await tx
        .update(notificationJobs)
        .set({ leasedUntil: leaseUntil, attempts: j.attempts + 1 })
        .where(eq(notificationJobs.id, j.id));
    }
    return due;
  });

  const t = transport();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of claimed) {
    try {
      // re-validate: only remind a still-confirmed attendee
      const [acc] = await db
        .select({ state: acceptances.state })
        .from(acceptances)
        .where(
          and(
            eq(acceptances.eventUri, job.eventUri),
            eq(acceptances.attendeeDid, job.recipientDid),
          ),
        )
        .limit(1);
      if (!acc || acc.state !== "confirmed") {
        await markTerminal(job.id, "skipped", now);
        skipped++;
        continue;
      }

      const [chan] = await db
        .select()
        .from(contactChannels)
        .where(eq(contactChannels.did, job.recipientDid))
        .limit(1);
      if (!chan?.email || !chan.verified) {
        await markTerminal(job.id, "skipped", now); // no deliverable channel
        skipped++;
        continue;
      }

      const [ev] = await db
        .select({ name: events.name, startsAt: events.startsAt, tzid: events.tzid })
        .from(events)
        .where(eq(events.uri, job.eventUri))
        .limit(1);
      const when = ev ? formatEventDateTime(ev.startsAt, ev.tzid) : "";
      const lead = job.kind === "reminder_1h" ? "in an hour" : "tomorrow";
      await t.send(
        chan.email,
        `Reminder: ${ev?.name ?? "your event"} is ${lead}`,
        `${ev?.name ?? "Your event"} is ${lead} — ${when}.`,
      );
      await markTerminal(job.id, "sent", now);
      sent++;
    } catch (err) {
      console.error(`notify job ${job.id} failed:`, err);
      // release the lease so a later run retries
      await db
        .update(notificationJobs)
        .set({ leasedUntil: null, status: job.attempts >= 5 ? "failed" : "pending" })
        .where(eq(notificationJobs.id, job.id));
      failed++;
    }
  }

  return { claimed: claimed.length, sent, skipped, failed };
}

async function markTerminal(id: string, status: "sent" | "skipped", now: Date) {
  await db
    .update(notificationJobs)
    .set({ status, sentAt: status === "sent" ? now : null, leasedUntil: null })
    .where(eq(notificationJobs.id, id));
}
