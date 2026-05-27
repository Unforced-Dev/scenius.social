# scenius.social — Research Synthesis

*Synthesis of four parallel research streams. 2026-05-26.*

This pulls the load-bearing decisions out of the four research notes (lexicon survey, RSV.pizza study, architecture primer, Luma+MCP design) into one document. It is opinionated. Each underlying note has more detail.

---

## The thesis, in one paragraph

There is already a small, real atproto events ecosystem — three apps (Smoke Signal, OpenMeet, Dandelion) interop today via `community.lexicon.calendar.*` with zero coordination. We adopt that stack as-is for events and RSVPs, and earn our keep by being the first to ship **scenes as a primitive** — `social.scenius.scene`, `social.scenius.membership`, `social.scenius.attestation` — plus an **open agent-native surface** (MCP + free public API) that Luma can't credibly copy without rebuilding on an open substrate. The result: an organizer can switch from Luma without losing capability, and an agent can answer "what's happening in Boulder this week?" against a substrate that doesn't extract from the communities that produced the events.

---

## Five load-bearing decisions

### 1. Adopt `community.lexicon.calendar.*` for events and RSVPs. Mint `social.scenius.*` only for what doesn't exist yet.

Three independent apps already produce and consume `community.lexicon.calendar.event` and `community.lexicon.calendar.rsvp`. By adopting them verbatim, every event we host is also a Smoke Signal event and an OpenMeet event — interop is *free*. We compete on UX and scene-context, not on the data shape.

`community.lexicon.location.{address,geo,fsq,hthree}` covers locations today. Track PR #64 (`location.place`) and adopt the day it merges. Use ATGeo's venue-lookup XRPC for resolution rather than rolling our own.

**What we actually need to invent (`social.scenius.*`):**
- `social.scenius.scene` — name, description, place ref, member-policy, scope
- `social.scenius.membership` — actor ↔ scene relation (strongRef)
- `social.scenius.attestation` — peer-issued attestation within a scene
- `social.scenius.eventContext` *(optional sidecar)* — scene-context + gating policy attached to a `community.lexicon.calendar.event`, mirroring the pattern Smoke Signal uses for `events.smokesignal.calendar.acceptance`

This is the right pattern: novel records go in our namespace; shared records stay shared. Propose `social.scenius.*` to lexicon-community Discourse early as drafts to signal upstream intent. Run `@atproto/lex-cli` + `goat lex parse` in CI from day one (the `h3` → `hthree` rename was a free lesson).

### 2. One AppView, no PDS, no relay.

The cheapest credible v0 architecture is the Statusphere pattern, scaled up:

```
User's existing PDS (bsky.social) ──writes via OAuth──▶ Bluesky Relay ──firehose──▶
  Tap (filtered to community.lexicon.calendar.* + social.scenius.*) ──▶
  scenius AppView (Next.js + Postgres + @atproto/oauth-client-node) ──▶
  serves XRPC + web UI + HTTP API (which MCP wraps)
```

- **No PDS for us.** Users keep their bsky.social handle. PDS ops surface (backups, abuse, recovery, allowlist) is not on the v0 critical path. Add `pds.scenius.social` later for the privacy-curious if there's demand.
- **No relay.** We're federated by virtue of consuming the firehose — we don't need to *operate* one.
- **Tap for ingest.** Bluesky's new managed firehose-to-webhook synchronizer handles MST verification, backfill, signature checking, desync recovery. Beta, but production-suitable for most shops. Fallback if Tap proves flaky: a direct `com.atproto.sync.subscribeRepos` WebSocket subscriber (~few hundred lines of TS).
- **TypeScript.** `@atproto/api` + `@atproto/oauth-client-node` + `@atproto/lex` codegen. Matches Statusphere 1:1.
- **Postgres.** Not SQLite (membership/web-of-trust queries need it). Supabase or Neon are fine.

### 3. Match Luma's v0 organizer surface. Defer recurrence, mobile, advanced analytics.

The v0 cut (from stream 04) is everything an organizer needs to switch from Luma without regret:

> Event CRUD (full metadata) · public/private/scene-member visibility · open & approval RSVP · capacity + waitlist · multi-host · tags · free + paid (Stripe) + donations/sliding-scale · scene pages with subscribe · email blasts + automated reminders · QR check-in · iCal export · embeddable event page · public read API + write API · webhooks · responsive PWA (no native mobile)

Defer to v1: real RRULE recurrence (Luma cheats with "clone-30"), discover feed, map view, refunds/coupons, tiered scene memberships, Zoom & Zapier, native mobile, analytics, post-event follow-ups.

Three deliberate divergences from Luma:
- **Scenes ≠ calendars.** Scene membership is a trust graph (mutual attestation), not a paid subscription tier.
- **No 5% platform fee.** Stripe passthrough only + optional treasury contribution at checkout.
- **Open API + MCP from day one**, not a Plus-tier afterthought.

### 4. Three-layer service architecture: atproto → HTTP API → MCP.

- **Storage layer:** atproto PDS records. Source of truth for *data*. Portable. Anyone can run their own scenius-style aggregator over the same record set — that's the "any city" promise from the one-pager.
- **Service layer:** scenius HTTP API. Aggregates the firehose into Postgres; enforces business rules (rate limits, abuse, payments); runs discovery search; mediates Stripe; emits webhooks. Source of truth for *behavior*.
- **MCP layer:** thin shim over the HTTP API. ~19 tools (6 read, 13 write/mixed) — see stream 04 §Part 2. Standalone Node process, authenticates via atproto OAuth, holds short-lived service tokens.

Why not MCP direct to atproto? Discovery, payments, abuse rate-limiting, and webhooks all need service logic. Building that twice (once for the web UI, once for MCP) loses the "one canonical surface" property. Three layers keeps each one thin.

### 5. From RSV.pizza: borrow the host workflow patterns. Throw away the data model and auth.

RSV.Pizza is a closed Supabase+Express clone with a single contributor and an 80-column `Party` god-table. Don't copy the architecture.

**Worth stealing (concrete, six patterns):**
- Custom slug + `SlugAlias` redirect table (cheap, kind to shared links)
- Soft-cancel (`cancelledAt`/`reason`) over hard-delete; banner on the public page
- Day-of host dashboard at `/run/:code` (mobile-first, separate IA from the planning view — Luma doesn't have this and hosts ask for it)
- Big-screen routes (`/display/:event/:slug`) for projection during events — also a great agent-native primitive
- Public post-event reports at `/report/:slug` (canonical post-event artifact)
- Realtime opt-in per page, never global (their own post-mortem made this clear)

**Explicit anti-patterns to avoid:** the god-table, Supabase+Express hybrid with shared prod DB across previews, layering magic-link + Privy + wagmi for identity (atproto OAuth replaces all three), no-license repos, closed-stack discovery (`/map`, `/leaderboard`, `/photos` should be over the shared graph, not internal).

---

## Critical path — sequenced next steps

### Week 1 — De-risk the load-bearing assumption

The single highest-risk question is whether **bsky.social's PDS will accept writes to a custom `social.scenius.*` collection** with non-allowlisted lexicons. The Spring 2026 roadmap relaxed this, but it needs verification before we commit.

- [ ] Stand up a throwaway DID (`did:web:test.scenius.social` or use Aaron's bsky handle).
- [ ] Write a minimal `social.scenius.scene` record to bsky.social via XRPC.
- [ ] Read it back; confirm it persists and is firehose-emitted.
- [ ] If gated: fallback to running a small dedicated PDS for our records only (significantly more ops, but recoverable).

### Week 1-2 — Walk the Statusphere tutorial end-to-end

Clone `bluesky-social/statusphere-example-app`. Get OAuth working with a real Bluesky account. Replace its `status` record type with a stub `social.scenius.scene` record. Get a working read/write round-trip. This is the smallest credible proof-of-life.

Implement the OAuth `stateStore` and `sessionStore` against Postgres — they're not provided and this is the most common stumbling block in 2025-26.

### Week 2-3 — Draft the scenius lexicons

Three drafts, in priority order:
1. `social.scenius.scene`
2. `social.scenius.membership`
3. `social.scenius.attestation`

Keep them lightweight. Post drafts to lexicon-community Discourse for early feedback. Hold off on `social.scenius.eventContext` until we know whether scene-context can fit inside `community.lexicon.calendar.event` extensions instead.

**Design constraint from the one-pager:** keep membership-attestation distinct from any allocation-weighting signal. Don't pre-encode funding semantics into the attestation record.

### Week 3-4 — First end-to-end vertical slice

The smallest useful product: a Boulder scene with one event.

- Create a scene (`social.scenius.scene` written to Aaron's PDS)
- Attest 5-10 seed Boulder members (`social.scenius.attestation`)
- Create one event (`community.lexicon.calendar.event` with a `social.scenius.eventContext` sidecar referencing the scene)
- Public scene page renders the scene + member count + upcoming events
- An external agent calls our MCP `search_events(scene="boulder-techne")` and gets the event back

Once this works, the rest is feature breadth, not architectural risk.

### Month 2+ — Fill out the v0 organizer surface

Iterate against the v0 checklist (stream 04 §V0/V1/Later). Stripe integration is the longest individual item. QR check-in is fast (host scans a guest's signed pass). PWA shell is cheap with Next.js 15.

### Parallel: pre-launch discipline

- License the repo Apache-2.0 or MIT day one. RSV.pizza shipping without a license is a cautionary tale.
- CI from day one runs `@atproto/lex-cli` + `goat lex parse` on every lexicon change.
- Get on the lexicon-community Discourse and propose `social.scenius.*` drafts.
- Subscribe to PR #64 (`community.lexicon.location.place`) — adopt the day it merges.
- Talk to Nick Gerakines (Smoke Signal maintainer + lexicon-community TSC). Coordination beats duplication.

---

## Watch-outs

1. **Custom lexicon write rejection on bsky.social** — the #1 risk; verify week 1.
2. **Tap is beta** — production-suitable but be ready to fall back to direct firehose subscription.
3. **Rate limits cut both ways** — 1,666 records/hour, 11,666/day per account on bsky.social means we can't bulk-import a 1,000-event calendar under one identity. Spread imports across actual event hosts.
4. **Lexicon-community governance is slow by design** — mint `social.scenius.*` first for anything fast-moving, upstream once stable.
5. **Attestation is novel territory in atproto** — we're not adopting prior art here, we're defining it. Keep the schema minimal and avoid conflating identity-attestation with funding-weight-attestation.
6. **OAuth `stateStore`/`sessionStore` not provided** — most common stumbling block; implement on Postgres.
7. **Single contributor on RSV.pizza was visible in the code** — plan for collaborators from day one (parallel to Parachute's "one PR at a time per repo" discipline).

---

## What this brief deliberately doesn't decide

- **Hosting target** — Vercel vs Fly vs Render vs self-host. Pick after the vertical slice runs locally. (Whatever Aaron's currently using for Parachute is probably right.)
- **Frontend framework** — Next.js is the safest default but a Statusphere clone in Hono + Vite would also work. Defer to the vertical slice.
- **Boulder go-live structure** — co-op vs Techne vs Neighborhood Village Project vs Woven Web as the first scene. This is a community-relations call, not an engineering one.
- **Treasury mechanics** — explicitly out of v0. The one-pager flags that conflating membership attestation with allocation weighting is how networks get gamed; we ship the attestation primitive first and figure out allocation primitives later.

---

## Pointers to the underlying notes

- `01-atproto-event-lexicons.md` — full prior-art survey, NSID-by-NSID
- `02-rsv-pizza-study.md` — stack, features, lessons (good + bad)
- `03-atproto-architecture-primer.md` — minimal-viable architecture, decisions table, starter resources, footguns
- `04-luma-features-and-mcp-design.md` — full Luma feature inventory + 19-tool MCP design + auth model

Each one is standalone and short enough to re-read end-to-end.
