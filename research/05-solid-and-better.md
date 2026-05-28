# scenius.social: The Solidity-on-Decentralization Strategy

## The thesis

Luma is solid because it owns the bottlenecks: one transactional database, one warmed sending domain, one payment rail, total stack control. Every one of those bottlenecks is *also* its extraction surface and its lock-in. scenius is better because it removes them — users own their data on their PDS, events are portable, community is the primitive, no rent is collected. The central tension is that "solid" and "decentralized" appear to want opposite things.

They don't, once you cut the substrate at the right joint. **The resolving principle: the PDS is authoritative for portable *data*; the AppView is authoritative for time-sensitive *behavior*. We centralize the clock and the cache, never the canon.**

- **Data (PDS-owned, portable, world-readable):** the event, the RSVP intent, the scene, the membership claim, the attestation, the curation edge. These are records on users' own repos in schemas scenius does not own (`community.lexicon.calendar.*` is owned by Lexicon Community; we mint `social.scenius.*` only for genuinely novel primitives). They survive scenius dying.
- **Behavior (AppView-centralized, operational, rebuildable):** the capacity decision, the confirmed seat, the reminder schedule, email deliverability, the payment charge, the search index, the cache, moderation labels, private/member-only data. None of these belong in a public repo, and all of them are *rebuildable from the firehose* — which is the dividend Luma structurally cannot offer.

**The litmus test for the line:** *If our Postgres is wiped, does the user lose anything they own?* If yes, we centralized the wrong thing — move it to the PDS. *If a record is written to a public repo, does it leak something a user expects private, or assert authority over someone else's resource?* If yes, it doesn't belong on the PDS — move it to the AppView. Everything reduces to those two questions. Portable data must survive us; behavioral truth must be ours to compute and re-derive.

The second-order principle that makes the line honest: **we refuse to honor, we never pretend to prevent.** Anyone's PDS can write a `social.scenius.membership` claiming they belong to RegenHub. We can't stop that write (it's their repo). We *don't index it* unless it passes scene policy. Ownership of your repo never grants authorship of my scene's truth.

This is not a compromise of decentralization — it's the Statusphere / Smoke Signal / Frontpage pattern, validated across the atmosphere. The graveyard (Solid, Diaspora, SocialFi at 92% 30-day churn) died of the opposite error: they shipped the principle and asked the user to suffer for it. **scenius ships a better calendar; the ownership comes free underneath.**

---

## Part I — The solidity bar, dimension by dimension

The hard ones are flagged. Two genuinely fight the substrate — **capacity/RSVP integrity** and **private/member-only data** — and one is a hidden moat people underestimate: **email deliverability.**

### 0. Identity, the OAuth session, and account recovery (HARD — the load-bearing onboarding claim)

Everything else assumes a working identity and a live write-session. The previous draft hid the cost of "OAuth to bsky.social, never learn the word PDS." Honest accounting:

**bsky.social as IdP is a real SPOF, and we name it.** For a user whose DID is hosted on bsky.social, login and *all* writes route through one provider. If bsky.social is down: existing AppView reads stay up (replica + CDN, Part I.8), but new logins fail and optimistic writes cannot reach the PDS. This is strictly *worse* than Luma at the auth layer for that window, and we say so. Three mitigations, in build order: (a) **session longevity** — atproto OAuth issues refresh tokens; we hold an encrypted refresh token per DID and silently re-mint access tokens, so a transient bsky.social blip does not log the user out; (b) **read-path independence** — nothing a logged-in user *reads* depends on their IdP being up; (c) **multi-PDS reality** — as soon as a non-trivial fraction of users are on PDSes other than bsky.social, the SPOF de-concentrates by construction. We do not pretend bsky.social outage is a non-event; we engineer the window to be read-survivable and write-deferred, not catastrophic.

**The OAuth-session lifecycle is load-bearing for optimistic writes, so it gets a real design.** Optimistic indexing requires the AppView to write to the user's PDS on their behalf. That requires a live OAuth session (DPoP-bound access token + refresh token). The rules:

- We persist the encrypted refresh token (`authSession` already exists; it gains `refreshToken`, `expiresAt`, `dpopKey`). A background refresher renews access tokens ahead of expiry.
- **Writes that need a session and don't have one fail visibly, never silently.** If the refresh token is revoked or expired, the next write surfaces "re-connect your account," never a phantom optimistic row. The orphan sweep (Part I.1) already catches the case where a write *was* attempted against a now-dead session — it rolls back rather than confirming.
- **Mid-flow expiry** (RSVP arbitration in progress, session dies before the PDS write): the AppView's transactional seat decision (Part I.2) is independent of the PDS write — the seat is decided in Postgres regardless. What can fail is *minting the attendee's RSVP record* or *the acceptance*. We handle this as: arbitrate and reserve the seat with a short hold; attempt the PDS write; on session failure, surface re-auth and keep the hold alive for the hold-TTL; on success, confirm. The seat is never lost to a session blip, and the user is never told "confirmed" without a durable basis.

**Account recovery and continuity — what "identity continuity through provider death" actually requires.** This is an atproto-level property, not something scenius invents, and we must not over-claim it. The truthful version: a DID (`did:plc`) can rotate its signing keys and *migrate to a new PDS* via the PLC directory; an account that does so keeps its identifier and its records. So "your scene survives your PDS provider dying" is real *if* the user (or their new provider) executes a migration — it is not automatic and not something scenius performs for them in v0. What scenius commits to: (a) we key everything on DID, never on handle or PDS host, so a migrated account Just Works in our index without re-import; (b) we publish a plain-language "what happens if bsky.social disappears" doc pointing at atproto account migration; (c) we do **not** claim to be a recovery provider or to custody keys. The honest scorecard line is "identity continuity is *possible and preserved by our DID-keying*, executed by atproto, not delivered by scenius."

### 1. Consistency & correctness (HARD)

**Luma-grade target:** no half-created events, no duplicate RSVPs, no stale guest counts, no write that "succeeded" then vanished. Read-your-writes 100% for the writer; convergence for everyone else within ~60s; exactly-once effect under at-least-once delivery; no orphans.

**The design.** The current schema cannot tell truth from staleness — it has `indexedAt` but no `cid`, no `rev`, no `source` flag. The load-bearing fix is provenance columns on every indexed table: `cid` (content-addressed reconciliation), `rev` (detect "PDS ahead of AppView"), `source ∈ {optimistic, firehose}`, `confirmedAt`, `deletedAt` (tombstone). The reconciliation rule, applied in every `onConflictDoUpdate`: **firehose always beats optimistic; between two firehose writes, higher `rev` wins; deletes leave a tombstone so a late create can't resurrect.** This makes indexing commutative and idempotent regardless of delivery order — the root fix.

Critical correctness reframing: **the UI "confirmed" state derives from the PDS write's returned CID, not from the index.** Durability is the write receipt, not the cache. An optimistic row is a verifiable claim, not a hope: a sweep (every ~30s) finds `source='optimistic' AND pendingSince < now()-TTL`, calls `getRecord` against the author's PDS, and either promotes or visibly rolls back — never a phantom success.

Two honest limits: (a) `getRecord` only audits rows we already know about; detecting records that were *never indexed* requires periodic `listRecords` over a bounded `tracked_dids` set (scene owners, builders, any DID with a confirmed record) — true completeness over arbitrary attendee PDSes is the one place we accept best-effort. (b) The orphan TTL must tolerate Tap backfill lag after relay incidents (the Jan 2026 cursor-jump class) — set it generous (10 min, not 60s) so healthy writes never get false "failed" rollbacks.

### 2. Capacity / waitlist / approval / RSVP integrity (HARDEST)

**Luma-grade target:** 40-seat event admits exactly 40; 200 simultaneous RSVPs → 40 confirmed, 160 waitlisted, zero oversell. Deterministic waitlist order, identical for every viewer. Approval gates real (pending consumes no seat). Paid = no double-charge, no ghost seat. No auto-promotion on cancellation (Luma's deliberate default — avoids surprise charges).

**The design — the keystone of the whole strategy.** An RSVP is a `community.lexicon.calendar.rsvp` on the *attendee's* PDS; there is no atomic "is a spot left?" across N repos. So we split two concepts the schema currently conflates: **RSVP = intent (PDS); seat = acceptance (AppView).**

1. RSVP arrives (optimistic *or* firehose). Index the raw intent (preserves interop).
2. **In one Postgres transaction keyed on the event** (`SELECT … FOR UPDATE` on an `event_inventory` row, or advisory lock on `eventUri`): count confirmed; if under capacity → confirmed; if approval mode → requested; else waitlisted with `seq = nextval()` — a DB sequence, *never* the attendee's clock. Postgres is the serialization point. This is the legitimate centralization.
3. Mint a **`social.scenius.acceptance`** record (new lexicon, modeled on Smoke Signal's `acceptance` / Acudo's signed RSVPs): strongRef to RSVP + event + state + position. The seat becomes a portable, host-countersigned credential — the ticket is the host's countersignature, not the attendee's claim.

**Arbitration is purely AppView-side, on the indexing path — this is the resolution to cross-app concurrency.** The critical clarification the previous draft underspecified: arbitration runs **wherever a record is indexed, regardless of origin**, and origin can be (a) our own optimistic client, (b) the firehose echo of that same write, or (c) the firehose carrying an RSVP from an *external* app (a Smoke Signal user RSVPing to a RegenHub event). Paths (a) and (c) have *no shared session and no shared client* — the only common chokepoint is the AppView's indexer. Therefore the `FOR UPDATE` arbitration must live in the indexer, triggered by *every* newly-indexed RSVP on a capacity-managed event, and must be idempotent on `(eventUri, attendeeDid)` so the firehose echo of an optimistic RSVP does not re-run arbitration or move `seq`. A Smoke Signal RSVP hits the exact same transaction the moment Tap delivers it; it gets the next `seq`, confirmed or waitlisted by the same rule, with no privileged fast path for our own client. **The correctness gate must test this directly:** not just 200 concurrent RSVPs from our own client, but a mixed load of N optimistic-client RSVPs interleaved with M firehose-delivered external RSVPs to the same 40-seat event, asserting exactly 40 confirmed and a single globally-deterministic `seq` order. Own-client-only testing would mask the real risk.

Three things the design must own honestly:

- **Distinct lexicons.** `acceptance` is NOT `attestation`. Overloading the web-of-trust membership primitive as a ticket is exactly the "conflating belonging with allocation" attack the one-pager flags. Three separate axes: belonging (`attestation`), curation power (`membership` role), seat (`acceptance`). Never collapsed.
- **Capacity needs a real field.** The community lexicon's `rsvpExpected` is a *display hint*, not an enforcement cap. We add an authoritative `capacity` to `event_inventory` (AppView) and a `maxAttendees` to our event sidecar.
- **The signing-authority problem is the residual hard edge.** Minting `acceptance` to the *host's* PDS requires acting as the host. v0 ships **AppView-DID acceptances** (always-available, ships RegenHub) with a stated migration path to host-delegated signing as atproto delegated auth matures. We state plainly: until then, live seat-state for in-flight events depends on the AppView — the rebuild-from-host-repos dividend is degraded, not yet delivered. The UX promise is **"request → confirmed,"** which is honestly what Luma's approval flow already is. We do *not* route open free events through approval to hide the race — open free RSVP stays instant-confirmed (capacity permitting); only capacity-limited and approval events become request→confirmed.

RSVP deletes (attendee removes their PDS record) free a seat and dangle the acceptance — handle as tombstone + waitlist promotion (host-controlled by default).

### 3. Notifications & email deliverability (HARD — the underrated moat)

**Luma-grade target:** ≥99% inbox delivery, SPF/DKIM/DMARC pass every send, bounce <5% / complaint <0.05% with auto-suspend on breach. Reminders fire 1d + 1h before, ±2 min, in each recipient's timezone, surviving restart, excluding pending/waitlisted guests.

**The design.** This is ordinary centralized SaaS plumbing — atproto neither helps nor hinders — and that's the point: it's pure AppView concern. One ESP (Postmark for transactional, separate stream for broadcast so a bad blast can't poison transactional reputation), one warmed domain (`notifications@scenius.social`), per-scene `Reply-To`. AppView-only tables: `contactChannels` (DID → email, verified-state, source), `notificationJobs` (`dedupeKey UNIQUE` for exactly-once, `scheduledFor`, durable so it survives restart), `suppressions`. A worker claims due jobs with `SELECT … FOR UPDATE SKIP LOCKED` (a lease, not just a dedupeKey — otherwise two workers double-send). Reminders are driven off the **optimistic local copy of `events.startsAt`**, never gated on firehose; on an event-edit firehose event, re-derive `scheduledFor` and re-render copy at send-time.

**Three hard truths the strategy must not gloss:**
- **A DID is not an email, and OAuth does not grant you the user's Bluesky email.** The only real channel is self-entered, double-opt-in email. So scenius has the *same* "enter your email" friction as Luma at the notification layer — the identity advantage does not extend here. We say so. The mitigation is that email is collected once and reused across every scene the user touches.
- **Shared-domain reputation is shared fate.** One bad RegenHub blast degrades deliverability for every scene before per-scene auto-suspend trips, and at low volume 0.05% thresholds are noisy. Mitigation: conservative warming plan, per-scene rate caps on broadcast, and the auto-suspend thresholds as a floor. This is a genuine operational discipline, not a one-liner.
- **Warming is a multi-week schedule, not a sprint task, and the Tier-2 gate must reflect that.** The previous draft's "80-recipient cold blast lands in inbox (measured)" was self-contradictory — a cold blast is the *opposite* of warming and would itself harm reputation. Corrected: warming starts on day one of Tier 0 (low-volume real transactional sends — login, confirmations — to seed reputation), runs in the background for the weeks Tiers 1–2 take, and the Tier-2 gate is warming-*consistent*: "transactional sends (confirmations, single reminders) achieve ≥99% SPF/DKIM/DMARC pass and >95% measured inbox placement at the warmed daily volume, with bounce <5% / complaint <0.05%; broadcast to a scene is throttled to the warmed ramp ceiling, not blasted." We measure placement with a seed-list (Postmark/GlockApps-style), not by firing at real guests.

The marquee interop demo ("RSVP from Smoke Signal shows up in RegenHub's list") has a notification hole: that dancer gave us no email, so we can't remind them. Honest framing — interop delivers the *guest-list entry*, not the *reminder channel*, for cross-app RSVPs.

### 4. Calendar sync & time correctness (HARD)

**Luma-grade target:** correct wall-clock across DST and viewer timezones; subscribable per-scene `.ics`; edits propagate without dupes; cancellations disappear.

**The design.** There's a live data-loss bug: `events.startsAt` is `timestamp({withTimezone:true})`, which stores a UTC instant and *destroys the IANA zone*, and `events/new/actions.ts` parses `new Date(\`${date}T${startTime}\`)` in *server* tz. Offset ≠ zone (`-06:00` can't tell you the next occurrence's offset after DST). Fix: keep the UTC instant for sorting, add `tzid` (IANA) for rendering, capture it from a `social.scenius` sidecar (not the community record — preserves interop), construct zone-aware, render with `Intl.DateTimeFormat(viewerTz)`.

`.ics` feeds are an *operational delivery* concern (AppView-owned): `/s/[handle].ics` and `/e/[id].ics` with `VTIMEZONE` blocks, stable `UID = <at:// URI>@scenius.social` (portable because identity is — a real dividend), and `METHOD:CANCEL` driven by `cancelledAt`. **Honest correction to an easy over-claim:** Google polls subscribed feeds on *its own* 8–24h cadence; `ETag`/`Cache-Control` do not make edits propagate faster. To actually beat Luma's disappearing-events problem you must additionally send `METHOD:REQUEST` iMIP invites — which couples to the email layer and is **not built in v0**. And `SEQUENCE` must derive from the record's `rev`/`cid` lineage, not a mutable local counter, or firehose replay emits a duplicate/lower SEQUENCE that clients silently drop.

Recurrence beats Luma's "clone-30": store one record with RRULE + `tzid` + EXDATE on a sidecar; the AppView expands to an `event_instances` projection (with a declared horizon for unbounded rules — two AppViews must agree on the horizon or they disagree on which instances exist). True exception model; graceful single-event degradation for non-scenius consumers. The interop limit is real: the community lexicon has no recurrence vocabulary, so a Smoke Signal user sees the master as one event. Resolution: propose `recurrence`/`tzid` to the Lexicon Community TSC (the path that added `rsvpExpected`); until merged, recurrence is a scenius-enhanced layer. **Scorecard honesty: this is MATCH in v0, not BEAT — the BEAT (recurrence engine, iMIP-driven cancellation propagation) is the post-v0 upgrade, gated on shipping iMIP and the recurrence projection.**

### 5. Payments & payout reliability (TRACTABLE on fee, with real host burden)

**Luma-grade target:** no double-charge, charge ⟺ ticket, capacity honored under money, refunds first-class, payouts land next-day with no reserve.

**The design.** Money is the one thing that *cannot be optimistic* — so we **invert the optimistic pattern: charge first (synchronously, in Postgres txn), then mint the on-PDS artifact.** Stripe Connect Standard, **host owns the account** (`transfer_data.destination = host`, `application_fee_amount = 0`): money never touches scenius, no custody, no reserve, no payout-hold — the entire Eventbrite failure class is structurally impossible. Flow: arbitrate seat (`FOR UPDATE`) → ticket `holding` with 15-min TTL → Stripe PaymentIntent (idempotency key = `attendeeDid:eventUri`) → `payment_intent.succeeded` webhook (idempotent on `pi_…`) flips to `paid` → mint `acceptance`. A persisted saga + reconciler diffs Stripe (money ground-truth) against `tickets`/`event_inventory` (seat ground-truth), releasing expired holds and *flagging* (never auto-issuing) irreconcilable refunds. Financial PII never becomes a PDS record. Price *intent* (`social.scenius.ticketTier` with sliding-scale fields) is public/portable; the *transaction* is private.

**The honest cost — and why this is BEAT-on-fee, BEHIND-on-host-burden, not "strictly better."** Connect Standard means the *host*, not scenius, carries: Stripe KYC onboarding (a real gate — the host must complete identity/bank verification *before they can sell a ticket*, friction Luma fully abstracts); refunds and dispute/chargeback handling; tax collection; and 1099-K issuance where applicable. Luma abstracts all of this behind its 5% (or its flat per-ticket fee). So the truthful claim is: scenius is **dramatically cheaper (0% platform fee, no reserve, no payout-hold, no custody risk)** and **higher-burden for the host** (they own the Stripe relationship). For RegenHub — a venue that already runs its own books — this is a clear win; for a first-time casual host it is more setup. We surface the tradeoff and smooth the KYC step with inline Connect onboarding, but we do not claim "strictly better."

### 6. Discovery, search & performance (TRACTABLE, with one hard core)

**Luma-grade target:** search-as-you-type p95 <150ms; "near me" p95 <200ms; read-your-write 0ms; cancelled events gone within one cycle.

**The design.** Schema is btree-only today and won't scale: add a generated `tsvector` + GIN for FTS, `pg_trgm` for typeahead, migrate `locationLat/Lon` from `text` to PostGIS `geography(Point)` + GiST for radius queries (Boulder gets a real map view, not Luma's city dropdown), and `tags text[]` + GIN on events (currently absent). Cache-vs-read-your-write tension resolved honestly: the `authorDid = me` path reads optimistic rows uncached (0ms for the writer); the *public* city feed is short-TTL cached and busted on the webhook write path — so a new event is instant in your own view and converges in the public feed, which is the honest version of "everywhere instantly."

**The genuinely hard core: trust-weighted ranking against Sybil spam — and it is genuinely unsolved, which the agent and openness claims must inherit honestly.** Open-by-construction discovery means anyone can write 10k future "Boulder ecstatic dance" events to their repo; naive recency+proximity+text ranks spam first. The web-of-trust primitives are the latent answer (rank by `eventContext` curation from a known scene, by author attestation density), but the crystallization rules are unspecified. v0 honest cut: **the city feed ranks curated events (scene-attached via eventContext) first; uncurated firehose events are searchable but not promoted.** This avoids both spam and the empty-feed collapse, and defers the trust-math to when there's a graph to compute over. The dependency to state loudly: *any* surface that exposes uncurated firehose content at scale — the open read API, the agent's "what's in Boulder this week" — inherits this unsolved ranking problem. Our v0 defense is **curation-as-allowlist**, not trust-math: promoted/answered content is scene-curated; everything else is reachable but not ranked. The hard ranking core is deferred, and we say so wherever it bites.

### 7. Privacy & member-only data (HARDEST — second genuine substrate fight)

**Luma-grade target:** guest lists private by default, member-only events don't leak, contact info single-purpose, removal is decisive.

**The design.** atproto is public-by-default and the firehose broadcasts everything; `visibility:"members"` on a public scene record is **decorative** — the bytes are already public. The honest rule: **private data never becomes a PDS record.** Public events → fully on-PDS (portable). Member-only event content, guest lists, and ALL contact info → AppView Postgres only, gated by membership at query time — a deliberate, scoped, *non-portable* centralization. Private RSVPs are Postgres rows, not `community.lexicon.calendar.rsvp` (losing cross-app interop for private attendance — acceptable; nobody wants therapy-group attendance federated).

We commit to a **forced, explicit choice at RSVP time** for sensitive-but-public events: "RSVP publicly (portable, federates)" vs. "RSVP privately (AppView-only)." Absence of a `social.scenius` record *is* the privacy. This is the one place the substrate genuinely beats us; the only honest move is to surface the tradeoff, never silently leak. Acknowledge the cost to the interop thesis: a private RegenHub board dinner cannot federate — for a venue whose value is the curated whole, the most valuable slice is the least portable. We say so rather than pretend otherwise.

**GDPR / CCPA right-to-erasure vs. immutable public records — a real legal tension, addressed not hand-waved.** "Decisive removal" is easy for AppView-only data (delete the row, it's gone). It is *hard* for public PDS records, because the firehose has already broadcast them and other AppViews may have indexed them. The honest decomposition:

- **Data scenius controls (Postgres: contact info, private RSVPs, email, payment metadata):** standard erasure — on a verified deletion request we hard-delete and tombstone, within statutory windows. This covers all genuinely personal/sensitive data, because by design that data *never left our database*.
- **Data the user owns (their PDS records):** the user is the data controller of their own repo. Erasure is *their* action — they delete the record from their PDS; the deletion propagates over the firehose; our reconciliation tombstones it and we stop displaying it. scenius's obligation is to **honor deletions promptly and stop indexing/serving** — which the tombstone model already does — not to guarantee every other AppView in the world also forgets (that is the same limitation email, RSS, and the open web have always had, and atproto's own deletion semantics govern it).
- **The residual:** content already replicated to third-party AppViews/relays is outside any single operator's control. We are honest in our privacy policy that public records are public and may be cached elsewhere, and we minimize what is ever public by routing all sensitive data to the non-portable AppView path. This is defensible because the *personal* data is centralized-and-erasable; only user-authored *public* content has the open-web caching caveat.

Moderation: self-hosted **Ozone labeler** over `social.scenius.*` + calendar lexicons; labels compose with the network's; AppView refuses to index/display labeled records. For v0's administered+invite governance, invite-gating *is* the moderation floor.

### 8. Reliability & ops (TRACTABLE, with discipline)

**Luma-grade target:** read availability ≥99.9%; reminders fire across restart; recovery from total index loss in <4h.

**The design.** The AppView is a genuine read SPOF — data survives if it dies, the product doesn't. Mitigations: Postgres primary + read replica; serve all *reads* (event/scene pages) from replica behind CDN with `stale-while-revalidate` (a primary blip degrades to slightly-stale pages, not downtime). Persist the Tap cursor + a `firehose_cursor` watermark (`lastEventAt`, `lagSeconds`) with an alert when lag >120s — and capture the firehose *event* timestamp, not `defaultNow()`, or the convergence SLO is unmeasurable. The **decentralization dividend**: the entire index is rebuildable from the firehose — publish "your scene survives the platform's death" as a guarantee Luma structurally cannot make. Honest concession: during a primary failover, *writes* (new RSVPs, logins on `authState`/`authSession`) fail closed — scenius is briefly *less* solid than Luma for writes, more solid for reads and recovery.

**The recovery-time claim now has a basis instead of an assertion.** "Total index loss" does not require re-streaming the entire global firehose — it requires re-indexing the records scenius *cares about*: the bounded `tracked_dids` set (scene owners, builders, every DID with a confirmed record) plus the calendar/scenius records in their repos. Recovery = iterate `tracked_dids`, `listRecords` per repo for our collections, replay through the same idempotent indexer (which is why Tier 0's idempotency is the precondition for fast recovery). The math: for v0 RegenHub-scale (low thousands of tracked DIDs, tens of records each), this is a low-hundreds-of-thousands `getRecord`/`listRecords` calls — bounded by PDS rate limits and our request concurrency, completable in **well under an hour** at a few hundred req/s. The honest scaling caveat: recovery time grows *linearly with the tracked-DID count*, not with total network volume; at city-scale (tens of thousands of scenes) we would shard the replay and/or keep a warm standby index, and the "<4h" budget is a *target with a stated linear-scaling basis and a re-derivation trigger*, not a fixed guarantee at arbitrary scale. We will publish the measured replay rate from the RegenHub instance and re-base the number from data.

---

## Part II — The substantial differentiators

### A. Agent-native as substrate, not upsell

**10x:** the most natural way to use scenius is to ask an agent — "what regen events are in Boulder this week?" returns a *cross-platform* answer (scenius + Smoke Signal + OpenMeet + Dandelion, because they share the lexicon), and "RSVP me to everything RegenHub does this month" actually executes, writing to *your own PDS* under *your DID*.

**Real AND solid:** MCP wraps the HTTP API (never atproto directly), so discovery/payments/rate-limits/abuse-floors live in service logic; ~19 high-altitude tools, not 50 CRUD endpoints. Two-tier auth: reads anonymous + per-IP limited (the free city concierge); writes require an atproto-signed JWT with per-tool scopes. Every write tool idempotent on a natural key; every tool returns real states (`pending|confirmed|waitlisted|failed`), never phantom success.

**Trap honestly named, not assumed-solved.** The agent surface is an abuse vector, and the defense is partly designed and partly dependent on the unsolved ranking core. What is *designed* (and enforced in the API layer so MCP can't bypass it): no mass-attestation tool (one signed attestation at a time — the per-actor Sybil floor); no bulk contact export; no email-enumeration; aggressive per-actor and per-scene write rate limits; write scopes per tool. What is *not* solved and must be stated: a compromised or adversarial OAuth session can still write spam *to its own PDS* — we cannot prevent that write (refuse-to-honor, not pretend-to-prevent). The defense against *that* is refuse-to-index-at-scale, which is the **same unsolved trust-weighted ranking problem** from Part I.6. So the agent BEAT is honestly two-layered: the *write-under-your-DID, cross-app-read, free-and-anonymous* capabilities are structural and real and shippable in v0; the *spam-resistant ranking of agent answers* leans on the deferred ranking core, and until that lands, agent answers are curation-first (promoted = scene-curated) exactly like the city feed.

**Why Luma can't follow:** business-model lock (their API is a $69/mo Plus feature; a free read API cannibalizes the upsell funnel), auth-model lock (delegated action is only coherent when "you" is a DID you control), data-shape lock (cross-app answers require a shared schema nobody owns — their moat *is* the absence of one).

### B. Data ownership & portability, invisible-but-real

**10x:** credible exit you can click — point a second AppView at your PDS and your events appear, zero export, zero coordination. Identity continuity through provider death (the atproto-executed, DID-keyed kind from Part I.0 — possible and preserved, not auto-performed by us). The litmus is adversarial interop: *can a competitor build on you without permission?* Yes = real ownership.

**Real AND solid:** hide the substrate at onboarding (OAuth to bsky.social, no server picker, no pod host, no wallet — the user never learns the word "PDS"). Write-to-repo + optimistic-index makes solidity and ownership stop being a tradeoff. Ship a working `.ics` and "this event lives at `at://…`" as *demonstrated* exit, not buried promise.

**Trap avoided:** the UX tax that killed Solid ("who hosts your pod?") and Mastodon ("which server?"). The user's investment in ownership must be exactly zero; the platform's commitment must be architectural.

**Honest limit to defend against over-claiming:** the *curated calendar* (eventContext) is `social.scenius.*`, so exit recovers bare events, not curation/membership/attestation graphs. We don't oversell "full portability" — we say public events are 100% portable and the curated overlay is scenius-enhanced.

**Multi-AppView write conflicts on the *same* user record.** Curation collision (two AppViews disagreeing on a scene calendar) was covered; the symmetric case is two apps editing *one event record* on one user's PDS. atproto's repo model resolves this at the record level: a record has one current state on the PDS, identified by `rev`/`cid`; a write replaces it and the firehose carries the new `rev`. There is no field-level merge — last-write-wins at the record, ordered by `rev`. Our indexer already honors this (higher `rev` wins, Part I.1), so scenius never *invents* a conflict; it faithfully reflects whatever the PDS settled on. The honest UX consequence: if a user edits the same event from scenius and from another app, the later write wins wholesale (no merge), and a stale editor may briefly see their version until the firehose `rev` arrives. We surface "this event was edited elsewhere" on `rev` mismatch rather than silently clobbering. This is an atproto-level property we conform to, not a problem we can or should solve unilaterally.

### C. Scenes & emergent web-of-trust

**10x:** RegenHub exists before, between, and after every event — belonging is the asset, the calendar is downstream. Attestation is a sentence ("Maya vouches for Theo — met him at the seed-swap"), not a score. Membership legible in three honest tiers (core/regular/visitor) computed from the graph. Governance ratchets administered→emergent with no migration — a policy flip, not a schema change.

**Real AND solid:** belonging is *computed by the AppView, never asserted by the user* (claim = intent, AppView = authority — same pattern as capacity). Attestation stays weightless, revocable, recency-stamped, scene-scoped. The administered→emergent ratchet means RegenHub launches *full and useful* (Aaron just adds people, Luma-style) before any vouching exists; attestation is an overlay that thickens, never a day-one gate.

**The Sybil floor must reckon with free, infinite handles — the scarcity the web-of-trust assumes does not exist.** Bluesky handles and `did:plc` identities are free and unlimited; an attacker can mint thousands. So a naive "count attestations" or "count members" metric is Sybil-trivial. The web-of-trust is *not* defended by identity scarcity — it is defended by **edge scarcity and edge provenance**: an attestation only counts if it comes from an *already-crystallized* member (a closed bootstrap set seeded by administered governance), attestations are one-at-a-time (no mass-attest tool, Part II.A), and we surface *named vouchers from known members*, never raw counts. A thousand fake DIDs vouching for each other form a disconnected clique that touches no crystallized member and therefore counts for nothing in any scene. This is the standard web-of-trust answer (trust flows from a seed set along human-verified edges; isolated subgraphs are inert), and we state it explicitly so the differentiator does not rest on a false scarcity assumption. The residual honest caveat: a *socially-engineered* edge (a real member vouching for a bad actor) is not preventable by math — reputation-can-go-down and revocability are the mitigations, and human moderation (Ozone) is the backstop.

**Trap avoided (three deaths):** Sybil/popularity (handled above — edge provenance, not identity scarcity); cold-start (the ratchet — but we treat "vouching will happen" as a *hypothesis to test on RegenHub*, not a delivered property, because Luma migrants bring zero vouching behavior); over-engineering (ship the records + simplest legible computation; keep the trust math in the AppView so it evolves without a lexicon change).

**Why Luma can't follow:** their primitive is the owned page; membership is a subscribe-row; there's no peer-to-peer vouching because there's no graph that isn't platform-mediated. "Luma for Communities" is enterprise *consolidation* — the structural opposite of emergent belonging.

### D. Anti-extraction / regenerative economics

**10x:** a regenerative loop you can watch dollars move through — zero rake (structurally absent, no account to skim into), value routes back to the scene that produced the event (optional scene-contribution split via Connect to the scene's Open Collective / Stripe / Safe), transparent treasury on the scene page, and a credible path to quadratic-funding rounds over a scene's calendar (GG23 Regen Coordination, scoped to one scene — RegenHub is the seed).

**Real AND solid:** `social.scenius.treasury` (or a `treasuryTarget` on the scene) typed union + default contribution policy, set by stewards. v0 = Connect passthrough + optional split + transparent readout — a week of Stripe work, strictly better than Luma's 5% *on fee*, with the host-burden caveat from Part I.5.

**Trap avoided:** conflating membership-attestation with funding-weight (the Sybil-farm-plus-plutocracy attack) — three axes never collapsed; treasury lives on the *scene*, not membership, so holding a membership can never be parlayed into a claim on funds. And no token, no custody, no QF in v0.

**Who pays — the runway/cost model the anti-extraction claim requires.** "0% rake, no revenue" is not a business until someone funds the AppView. The honest cost stack for a single Boulder instance at RegenHub scale is modest and explicitly enumerated:
- **ESP (Postmark):** ~$15–50/mo at low transactional volume.
- **Postgres primary + read replica (managed):** ~$50–150/mo at v0 scale.
- **Tap / firehose ingestion host:** a small always-on worker, ~$20–50/mo (we consume the firehose; we do **not** run a relay — that distinction is what keeps this cheap).
- **Ozone labeler:** small instance, ~$20–40/mo, run only as moderation need materializes.
- **App hosting + CDN:** ~$20–80/mo.

So a single city instance is **low-hundreds of dollars/month** — fundable as (a) **grant-funded** (this is literally a Gitcoin/GG-aligned regen-coordination project — QF and ecosystem grants are the native funding rail), (b) **scene-contribution opt-in** (scenes that route value back can route a sliver to instance upkeep — *transparent, optional, never a rake*), and (c) **self-host** (`docker-compose up` — a city that wants total control runs its own and pays its own infra). The anti-extraction position is therefore: scenius takes **0% of transactions** (structural), and the *infrastructure* is funded by grants + opt-in contribution + self-hosting — never by extracting from events. This is a coherent who-pays answer, not "magic free." We do not claim profitability; we claim *fundability without extraction*, which is the actual differentiator.

**Why Luma can't follow:** centralization *is* the extraction surface; they can't drop to 0% without dropping the revenue that justifies the stack, and they have no community primitive to route value back *to*.

### E. Open, composable, interoperable

**10x:** the event that's already everywhere (post once, appears on every atmosphere calendar, RSVPs flow back); the one-URL portable calendar; the credible exit demonstrated; any city runs its own instance over the same records.

**Real AND solid:** lead with one excellent Boulder instance; openness is *latent capability* surfaced in four felt-benefit places (free `.ics`+API+embed; invisible interop via the shared lexicon; a real "leave" button with a "point another AppView here" doc; `docker-compose up` brings up a city, gated in CI so self-hostability can't silently regress).

**Trap avoided:** over-engineering federation into a product *before a second instance exists* — federation is "receiving firehose writes," not operating a relay; never build Mastodon's server-picker. The open write door is gated by **curation** (eventContext from a builder), not configuration — open posting, curated calendars, so openness and solidity coexist.

**Residual hard problem to name:** cross-AppView curation collision — once two AppViews read the same PDSes, there's no single authority-of-record for "what's on RegenHub's calendar." Adversarial interop is both insurance and an attack surface on curation integrity. v0 stance: the scenius instance is authoritative for the scenius-hosted view; we don't yet claim a canonical cross-AppView scene.

---

## Part II.5 — Getting RegenHub off Luma: the actual migration path

This is the concrete near-term goal, and it deserves a first-class plan rather than an assumption. Migrating a live venue off Luma is a *product surface*, not a side effect, and it collides with our own deliverability discipline in a way we must design around.

**1. Event + historical backfill.** Luma has no clean public export/API for an organizer's full data. Realistic ingestion, in preference order: (a) Luma's organizer CSV guest-list/event export where available; (b) the public event page / Luma's read endpoints for event metadata (title, time, location, description); (c) the subscribable `.ics` from RegenHub's Luma calendar as a structured fallback for upcoming events. We build a **one-shot import tool** that maps these into `community.lexicon.calendar.event` records minted to the *scene host's* PDS (or, for v0 where host-signing isn't ready, an AppView-curated import indexed into RegenHub's scene with clear "imported" provenance and a path to re-home onto the host's repo). Past events import as historical context (un-promoted); upcoming events import as live, then become the canonical scenius copy. We do not claim a magic Luma API exists — we claim a pragmatic CSV+ICS+page-scrape importer scoped to one venue.

**2. Email re-consent — the hard collision, named.** *We cannot import Luma's email consent.* Luma's guest emails were collected under Luma's terms; re-mailing them from scenius is both legally wrong and reputation-suicidal (it is exactly the cold-blast that destroys a warming domain, Part I.3). So the migration is **re-permission-by-design**: RegenHub announces the move *from within Luma* (their existing, consented channel) — "we're moving to scenius, RSVP to the next event here" — and guests re-opt-in on first scenius RSVP (double-opt-in, Part I.3). The guest list *as historical record* can be imported for the organizer's reference; the *right to email each guest* is re-earned per guest, not imported. This turns the deliverability constraint from a contradiction into the migration's central mechanic: the warming ramp and the re-consent ramp are the *same* ramp — guests arrive gradually as they re-RSVP, which is exactly the volume profile a warming domain wants.

**3. The switchover sequence.** (a) Stand up RegenHub as a scene on scenius, full and useful via administered governance (Part II.C). (b) Import upcoming events. (c) RegenHub posts the next 1–2 events on *both* Luma and scenius, driving RSVPs to scenius via their consented Luma channel. (d) As guests re-RSVP on scenius they re-opt-in to email and the warming ramp climbs in lockstep. (e) Once a full event cycle runs clean on scenius (capacity correct, reminders landing, payments clean), RegenHub stops posting to Luma. The win condition is *one full event lifecycle executed on scenius with organizer confidence* — not a big-bang cutover.

**4. What we lead with in the pitch (unchanged, now grounded):** anti-extraction (0% fee, value routes back to the venue — the concrete dollar argument, with the host-burden caveat surfaced honestly), demoed with agent-native ("ask your agent what's on at RegenHub this week, across every calendar"). Scenes/web-of-trust is the *retention hypothesis to validate on RegenHub's real members*, not a launch claim.

---

## Part III — Where we centralize vs. where data stays owned

| Concern | Home | Why this keeps BOTH solidity and ownership |
|---|---|---|
| Event record | **PDS** (`community.lexicon.calendar.event`) | Portable, interoperable, survives us; free Smoke Signal/OpenMeet interop |
| RSVP *intent* | **PDS** (`community.lexicon.calendar.rsvp`) | Portable proof you wanted in; readable by any AppView |
| Scene, membership *claim*, attestation, eventContext | **PDS** (`social.scenius.*`) | The web-of-trust graph is portable and re-aggregatable; differentiator survives platform |
| **Seat / acceptance** | **PDS-minted, AppView-arbitrated** (`social.scenius.acceptance`) | Capacity decided transactionally in Postgres; the *ticket* is a portable countersignature (v0: AppView-DID, migrating to host-signed) |
| **Capacity ledger** (inventory, waitlist `seq`) | **AppView Postgres** | Atomicity across N repos is impossible on-PDS; arbitration runs on the indexer so cross-app RSVPs hit the same lock; rebuildable from acceptances |
| **OAuth session / refresh tokens** | **AppView (encrypted), keyed on DID** | Required for optimistic writes; failure surfaces re-auth, never phantom success; identity itself stays on the user's DID |
| **Search / geo / FTS index** | **AppView** (tsvector, PostGIS, trgm) | Derived, rebuildable from firehose; query engine, owns nothing canonical |
| **Email + contact info + suppression** | **AppView only, never a record** | Contact info is a delivery concern + privacy line + the GDPR-erasable surface; atproto having no email primitive is lucky |
| **Reminder / job scheduler** | **AppView** (`notificationJobs`, leased) | A reminder is a deadline; must not gate on eventual firehose |
| **Payments** (charge, tickets, payout state) | **AppView Postgres + Stripe; host owns the account** | Money can't be optimistic; financial PII can't be public; no custody = no Eventbrite class; host carries KYC/refunds/tax |
| **Private / member-only content & guest lists** | **AppView only, non-portable** | Public-by-default substrate can't keep secrets; scoped, named, honest centralization; also the erasable surface |
| **Moderation labels** | **AppView Ozone labeler** | Composes with network labels; refuse-to-index is the enforcement; human backstop for socially-engineered trust edges |
| **Cache, cursor, reconciliation state, denormalized counts** | **AppView** | Operational truth; all rebuildable from the firehose |

The pattern is exact: **anything a user owns survives our death; anything we run is rebuildable from what they own or is a delivery/secret concern that never belonged in a public repo.**

---

## Part IV — The scorecard

| Dimension | vs. Luma | Notes |
|---|---|---|
| Event CRUD / scene pages | **MATCH** | Optimistic index gives Luma-speed UX |
| Read-your-writes | **MATCH** | For the writer, via optimistic insert + CID receipt |
| Identity / onboarding | **MATCH on UX, BEHIND on IdP resilience** | Invisible OAuth onboarding matches Luma's ease; bsky.social is a named auth SPOF mitigated by session longevity + read-path independence; continuity is atproto-executed, not scenius-delivered |
| Capacity / waitlist integrity | **BEHIND → MATCH (must close)** | Keystone unbuilt: no `acceptance` lexicon, no inventory, no `seq`. Highest-priority build. Arbitration must be indexer-side to cover cross-app RSVPs. |
| Email deliverability | **BEHIND (must close)** | No ESP, no warmed domain, no suppression. The real switching-cost moat; pure SaaS work but non-trivial (multi-week warming, shared-reputation isolation, re-consent on migration) |
| Reminders / timezone correctness | **BEHIND → MATCH** | `withTimezone` destroys IANA zone (live bug); no job scheduler yet |
| Calendar sync (.ics) | **MATCH (v0)** | Stable at:// UID is a dividend; Google poll cadence caps subscriptions at parity; BEAT (recurrence + iMIP) is post-v0, gated on building iMIP |
| Payments / payouts | **BEAT on fee, BEHIND on host burden** | Connect passthrough: 0% + no reserve + no payout-hold (structural); but host owns Stripe KYC, refunds, disputes, tax, 1099 — cheaper, not strictly better |
| Search / discovery | **MATCH, then BEAT (geo)** | Need tsvector/PostGIS/tags; trust-weighted ranking-vs-Sybil is the unsolved hard core, deferred to curation-first |
| Private / member data | **BEHIND (honestly capped)** | Public-by-default substrate; private slice is non-portable by design; personal data is centralized-and-erasable (GDPR-clean), public records carry the open-web caching caveat |
| Reliability / recovery | **MATCH reads, BEAT recovery** | Rebuildable-from-firehose is a guarantee Luma can't make; recovery time has a linear-in-tracked-DIDs basis (<1h at v0 scale); writes fail-closed on failover |
| Data ownership / portability | **BEAT** | Credible exit; DID-keyed identity continuity; ownership invisible; same-record edits are atproto last-write-wins by `rev` |
| Agent-native | **BEAT (structural) on capability; ranking leans on unsolved core** | Free, anonymous, cross-app read API + write-under-your-DID is structural; spam-resistant ranking of answers inherits the deferred ranking problem (curation-first until solved) |
| Community as primitive | **BEAT (structural)** | Scenes + web-of-trust defended by edge provenance (not identity scarcity, which doesn't exist); Luma has no graph that isn't platform-mediated |
| Anti-extraction | **BEAT (structural)** | No rent to protect; value routes back to scenes; infra funded by grants + opt-in + self-host (who-pays answered) |

**The honest read:** we BEAT Luma on the five differentiators *structurally* (they can't copy without dismantling their model), with two honesty asterisks — the Payments BEAT is *fee-only* (host carries operational burden) and the Agent BEAT is *capability-structural but ranking-deferred*. We MATCH on most table-stakes once built, and are BEHIND on exactly the things that make organizers *feel* solidity day-one: **capacity integrity, email deliverability, and timezone-correct reminders**, plus a named **IdP-resilience** gap at the identity layer. Those are the credibility gates.

---

## Part V — What this means for the build

**The priority order — close the BEHIND-on-solidity gaps before polishing the BEATs.** Organizers switch for a calendar that doesn't embarrass them, then stay for the differentiators.

**Tier 0 — correctness spine + session + warming seed (everything rests on this).** Add provenance columns (`cid`, `rev`, `source`, `confirmedAt`, `deletedAt`) to every indexed table; make all upserts rev-ordered/idempotent/tombstone-aware; persist the Tap cursor + lag watermark; build the optimistic-orphan sweep with a generous TTL. Harden the OAuth session: persist encrypted refresh tokens keyed on DID, background-refresh, surface re-auth on session death (never phantom-confirm). Start the domain-warming ramp *now* with real low-volume transactional sends (login/confirmation). Without this, every other guarantee is built on sand. **Solid gate:** replay the entire firehose twice → identical index; kill the process mid-write → sweep reconciles to PDS truth, never a phantom; revoke a session mid-flow → user sees re-auth, no phantom row.

**Tier 1 — the capacity keystone.** Mint `social.scenius.acceptance` (distinct from attestation). Add `event_inventory` + `maxAttendees`. Implement **indexer-side** transactional arbitration (`FOR UPDATE` keyed on event, `seq` from a DB sequence), waitlist, approval mode, no-auto-promote default. **Solid gate:** a *mixed* load — N optimistic-client RSVPs interleaved with M firehose-delivered external (Smoke Signal) RSVPs to a 40-seat event → exactly 40 confirmed, deterministic waitlist order identical across viewers, zero oversell; double-tap + firehose echo + external replay → one seat, stable `seq`.

**Tier 2 — notifications & time.** Fix the `withTimezone` data-loss bug + zone-aware construction + `tzid` capture. Build the leased durable job scheduler driven off the optimistic index. Integrate Postmark with the (already-ramping) warming plan, suppression list, per-scene reputation + auto-suspend. **Solid gate:** event created "7pm Mountain across the Nov DST boundary" renders correct wall-clock for Denver and NY viewers; reminders fire ±2 min in recipient tz, exactly once across a worker restart, excluding waitlisted guests; **warming-consistent deliverability gate** — transactional sends at the warmed daily volume achieve >95% seed-list inbox placement, ≥99% SPF/DKIM/DMARC pass, bounce <5% / complaint <0.05%; broadcast throttled to the warmed ceiling (no cold blast).

**Tier 3 — payments, search & migration.** Connect passthrough (charge-first saga, reconciler, inline KYC onboarding). FTS/PostGIS/tags + curated-first city feed. Build the RegenHub Luma importer (CSV+ICS+page) and the re-consent switchover flow (Part II.5). **Solid gate:** 50 buyers / 1 paid spot → 1 charge, 49 clean declines, 0 refunds; Stripe webhook replayed 3× → one charge, one ticket; search p95 <150ms at 50k events; RegenHub's upcoming events imported with correct times/zones and clean provenance; first re-consented guest receives a landing reminder.

**Tier 4 — the differentiators, surfaced.** `.ics`/embed/read-API on by default; MCP server (~19 tools, two-tier auth, API-layer abuse floor, curation-first answers); demonstrated "leave" button + "point another AppView here" doc; transparent treasury + optional Connect split; published "what if bsky.social/scenius disappears" continuity doc.

**Which differentiator to lead with for RegenHub: anti-extraction, backed by agent-native.** The 0%-fee + value-routes-back-to-the-venue loop is the *concrete dollar argument* a venue feels immediately and Luma cannot match — surfaced with the honest host-burden caveat (RegenHub already runs its own books, so it lands). Agent-native is the *wow* that makes the switch feel like an upgrade ("ask your agent what's on at RegenHub this week, across every calendar"). Lead with the economics, demo with the agent. Scenes/web-of-trust is the *retention* story — a hypothesis to validate on RegenHub's actual members, not a launch claim.

**The discipline to hold against scope creep:** adopt `community.lexicon.calendar.*` verbatim; mint `social.scenius.*` only for genuinely novel primitives (scene, membership, attestation, eventContext, acceptance, ticketTier, treasury); federation = consuming the firehose, never running a relay; hide every decentralization decision from the user; "request → confirmed" honesty over fake instant-confirm on capacity-limited events; refuse-to-honor over pretend-to-prevent; route every byte of personal/sensitive data to the erasable AppView path, never a public record.

**The one-line strategy:** Luma is solid because it owns the bottlenecks; scenius is better because it removes them — and solidity is preserved by letting the AppView be the atomic, reputation-bearing, rebuildable authority for *behavior* while every byte of portable *data* stays owned on the user's PDS. Ship the correctness spine, the session hardening, and the capacity keystone; make email and time boringly reliable on a warmed domain; migrate RegenHub by making the warming ramp and the re-consent ramp the same ramp — and the gap to "as solid as Luma" closes, while the five structural differentiators it can never copy (each claimed at its honest altitude) carry RegenHub, and the next hundred scenes, the rest of the way.