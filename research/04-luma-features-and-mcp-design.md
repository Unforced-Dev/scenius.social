# Luma Feature Inventory + Agent-Native MCP Design for scenius.social

*Research note — 2026-05-26. Informs V1 product scope and the MCP/API surface.*

The goal: match Luma's calendar surface closely enough that an organizer can switch to scenius.social without losing capability, while making every action first-class for agents. This document inventories Luma's 2026 surface, picks a v0/v1/later cut, and proposes a concrete MCP tool design.

## Part 1 — Luma Feature Inventory

Sources: Luma Help Center, docs.luma.com (public OpenAPI index at `/llms.txt`), pricing pages, and third-party reviews. Cut as of May 2026.

| Area | Feature | One-liner | scenius cut |
|---|---|---|---|
| **Event creation** | Title, description (rich text), cover image | Standard event metadata, 40+ themes for cover styling | **v0** |
| | Date/time + timezone + multi-day | Standard, with TZ inference | **v0** |
| | Event type: In-Person / Online / Hybrid | Drives location vs meeting-link UX | **v0** |
| | Venue / address (in-person) | Geocoded venue with map | **v0** |
| | Meeting link (online) — Zoom auto-create or paste-in | Luma can spin up Zoom meetings/webinars on your behalf | **v1** (paste-in v0) |
| | Visibility: Public / Private / Member-Only | Three discrete modes | **v0** (mapped to scene scope) |
| | Registration mode: open vs approval-required | Per-event toggle | **v0** |
| | Capacity limit + waitlist | Cap with overflow into ordered waitlist | **v0** |
| | Recurring events via "Clone Event" (up to 30 at once) | No true recurrence rule; bulk duplication | **v1** (do better: real RRULE) |
| | Multi-session via ticket-type-per-time-slot | Hack for same-day sessions | **later** |
| | Multi-host: hosts list with per-host permissions | Add/update/remove hosts, per-event | **v0** |
| | Collaborating Calendars (beta) — multi-calendar co-management | Two calendars share a guest list, comms, edit rights | **v1** (cross-scene events) |
| | Tags on events | Free-form tags for filtering | **v0** |
| **Discovery** | Personal profile pages | Per-user public page | **v0** |
| | Calendar pages (the closest thing to "scenes") | Curated event website with map, filters, subscribe | **v0** (renamed: scene pages) |
| | Discover / Explore (city-scoped) | Editorial-ish global discovery feed | **v1** |
| | Map view + tag filter on calendar pages | Browseable map and tag chips | **v1** |
| | Cross-calendar curation (pin external events) | Add events from other calendars or URLs, read-only | **v1** |
| **Comms** | Email blasts / newsletters to calendar subscribers | Audience-filtered, can feature upcoming events | **v0** |
| | Day-of reminders, day-before reminders | Automatic, configurable | **v0** |
| | Post-event follow-ups | Automated thank-you / next-steps | **v1** |
| | SMS invites & reminders | Phone-number capture, SMS sends | **later** |
| | Per-tier newsletters (membership-gated comms) | Email subset by tier | **v1** |
| **Ticketing** | Free RSVP | Default | **v0** |
| | Paid tickets via Stripe (next-business-day payouts) | 2.9% + 30¢ Stripe; Luma adds 5% (0% on Plus) | **v0** |
| | Multiple ticket types per event | Tiered pricing, limits per type | **v0** |
| | Coupons / promo codes (calendar-level + event-level) | Event-level overrides calendar-level | **v1** |
| | Refunds (full/partial, optional ticket invalidation) | Per-calendar refund policy | **v1** |
| | Donations / pay-what-you-can | Sliding-scale entry | **v0** (community-flavored) |
| | Mutual-aid / member-priority allocation | Not in Luma | **v0** (our differentiator) |
| **Memberships** | Tiered memberships per calendar (free/paid/one-time) | Recurring monthly/yearly, or app-only | **v1** (becomes scene roles) |
| | Member-only events + member-only ticket types | Tier-gated visibility and purchase | **v1** |
| **Embeds / integrations** | Embeddable event page + checkout button | Drop into any site | **v0** |
| | iCal export / subscribe | Per-event and per-calendar `.ics` | **v0** |
| | Public REST API (200/min calendar key, 500/min org key) | OAuth + API keys; full event/guest/ticket CRUD | **v0** (ours is open + free) |
| | Webhooks (event/guest/ticket lifecycle) | Eight trigger types | **v0** |
| | Zapier (Plus only): 7 triggers, 1 action | Glue to Airtable, Sheets, Mailchimp | **v1** |
| | Zoom / Zoom Events / Google Meet | Auto-create meeting + attendance pull | **v1** |
| **Mobile** | iOS + Android native apps | Browsing, RSVP, check-in, QR scan | **v1** (PWA in v0) |
| **Host analytics** | Registration funnel, traffic sources, attendance | Where guests came from; show-up rates | **v1** |
| **Check-in** | QR code check-in (host scans guest's pass) | Native in mobile app + web | **v0** |

### V0 / V1 / Later — explicit cut

**v0 (ship to Boulder seed scenes):** event CRUD with all fundamental fields; public/private/scene-member visibility; open and approval RSVP; capacity + waitlist; multi-host; tags; free tickets, paid tickets via Stripe, donations/sliding-scale; calendar (scene) pages with subscribe; email blasts + automated reminders; QR check-in; iCal export; embeddable page; public read API + write API; webhooks. Mobile via responsive PWA.

**v1:** Real recurrence (RRULE, not clone-30); discover/explore feed; map + tag filter on scene pages; cross-scene curation and co-managed events; refunds + coupons; tiered scene memberships (free/paid/app-only) as evolution of basic membership; per-tier comms; Zoom & Zapier integrations; native mobile apps; host analytics; post-event follow-ups.

**Later:** SMS sends; multi-session-via-ticket-type (probably never — real sessions instead); brand-ambassador-style hierarchical org structures.

### Where we diverge from Luma deliberately

- **Scenes, not calendars.** A scene has membership semantics (mutual attestation) that Luma's "calendar" doesn't. Calendar memberships are paid subscriptions; scene membership is a trust graph.
- **No 5% platform fee.** Stripe passthrough only. Optional tipping/treasury contribution at checkout.
- **Membership-gated visibility is a first-class scene property**, not an add-on tier feature.
- **Agent-native** — every action exposed via MCP from day one, not a Plus-tier afterthought.

## Part 2 — Agent-Native MCP Tool Design

Anthropic-MCP-server-shape. Each tool: `name(args) -> return`. R = public read, W = atproto-signed write.

### Discovery & read

1. **`search_events(query, scene?, location?, near_lat_lng?, radius_km?, tags?, starts_after?, ends_before?, limit?, cursor?) -> EventPage`** — R. The big one: powers "what's happening in Boulder this week." Supports text, scene, geo, tag, and time filters. Returns paginated event summaries with stable cursors. **Cache-friendly**: cached by query hash for ~60s; geo+time filters keep hit rate decent.

2. **`get_event(event_id_or_handle) -> Event`** — R. Full event detail incl. host(s), scene(s), location, ticket types, RSVP counts. Cache: ~30s; bust on webhook.

3. **`list_scenes(query?, location?, near_lat_lng?, radius_km?, tags?, limit?, cursor?) -> ScenePage`** — R. Discover scenes by place or interest. Cache: 5 min.

4. **`get_scene(scene_handle) -> Scene`** — R. Scene metadata, upcoming events, public member count, tags, scope rules.

5. **`list_scene_events(scene_handle, starts_after?, ends_before?, visibility?, limit?, cursor?) -> EventPage`** — R for public; for member-only events the caller must be an authenticated member of the scene. Cache: 60s public tier; no cache for member-scoped.

6. **`get_user_profile(handle) -> UserProfile`** — R. Public profile, scenes the user has chosen to surface, upcoming hosting. No private RSVPs.

### Event lifecycle (write)

7. **`create_event(scene_handle, title, starts_at, ends_at, timezone, type, location_or_link, description, visibility, rsvp_mode, capacity?, waitlist_enabled?, ticket_types?, tags?, cohosts?) -> Event`** — W (atproto-signed; caller must be a member of `scene_handle` with post rights).

8. **`update_event(event_id, patch) -> Event`** — W (host or co-host only).

9. **`cancel_event(event_id, reason?, notify_guests?) -> Event`** — W (host only).

### RSVP & guest list

10. **`rsvp(event_id, ticket_type_id?, answers?) -> Rsvp`** — W. Self-RSVP; handles approval mode by returning `pending`; handles paid by returning a Stripe checkout URL. Idempotent on (event, actor).

11. **`cancel_rsvp(event_id) -> Rsvp`** — W. Self un-RSVP; opens waitlist slot.

12. **`list_event_guests(event_id, status?, limit?, cursor?) -> GuestPage`** — W-auth (host-only; never public). Returns guest handles + RSVP status. Never exposes contact info absent host scope.

13. **`approve_guest(event_id, guest_handle, decision) -> Guest`** — W (host only; `approve` | `decline` | `waitlist`).

### Scene membership (the differentiator)

14. **`attest_membership(scene_handle, member_handle, statement?) -> Attestation`** — W. The caller attests another person belongs to the scene; the mutual graph determines effective membership. This is where scenius.social's social layer lives.

15. **`revoke_attestation(scene_handle, member_handle, reason?) -> Attestation`** — W. Withdraw a prior attestation.

16. **`list_scene_members(scene_handle, role?, limit?, cursor?) -> MemberPage`** — Mixed: public attestations are R, private-roster scenes require member-auth. Roster never includes contact info — only public handles.

### Comms

17. **`send_scene_announcement(scene_handle, subject, body, audience_filter?) -> Broadcast`** — W (scene admin / facilitator role). Audience filters: `all_subscribers`, `tag=`, `attended_event=`. Rate-limited per scene per day to prevent abuse.

18. **`send_event_message(event_id, audience, subject, body) -> Broadcast`** — W (host only). Audience: `going`, `waitlist`, `pending`, `attended`, `no_show`, `all`.

### Utilities

19. **`get_ical_url(scene_handle_or_event_id) -> {url}`** — R. Returns a signed, stable `.ics` URL.

### Auth model

- **R tools** are anonymous-OK by default and rate-limited per IP/key (generous free tier — this is the "ask Claude what's happening in Boulder" experience). Member-only data falls back to authenticated read.
- **W tools** require an atproto-signed JWT identifying the actor's DID. Server checks: actor authorized for `scene_handle` (member, host, or admin) before mutating.
- **Per-tool scopes** (`events.write`, `rsvp`, `scene.attest`, `scene.comms`) so an agent can hold narrow capabilities — useful for least-privilege MCP installs.

### Cache strategy (for agent latency)

- All R tools return `etag` + `Cache-Control`. Server CDN caches public reads for 30-300s depending on volatility.
- Webhooks bust cache by entity_id.
- Cursors are stable so an agent that paginates doesn't double-pay.

### What we deliberately do *not* expose

- **No bulk member email/phone export.** Even hosts get handles + atproto DIDs, not raw contact. Comms route through the platform.
- **No "search users by email."** Privacy floor — agents can't enumerate humans.
- **No PII in webhook payloads.** IDs only; the receiver fetches with their own creds.
- **No automatic mass-attestation tool.** Sybil resistance: attestations must be one-at-a-time and signed.
- **No "send announcement to anyone not in your scene"** — comms are scoped to scenes you facilitate.
- **Aggressive write rate limits** at the actor+scene level, even for authorized agents.

## Part 3 — MCP over HTTP API, or MCP over atproto direct?

**Recommendation: MCP wraps a thin scenius.social HTTP API, which is itself the canonical interface to the atproto records.** Three layers:

1. **Storage layer** — atproto PDS records (scene lexicon, event lexicon, attestation lexicon, RSVP lexicon). Source of truth, portable.
2. **Service layer** — scenius.social HTTP API. Aggregates, indexes, enforces business rules (rate limits, abuse, payments), runs the discovery search, holds the cache, mediates webhooks, handles Stripe.
3. **MCP layer** — thin shim over the HTTP API. Translates tool calls into HTTP, handles auth-token plumbing, returns structured results.

Why not MCP-direct-to-atproto?

- Discovery (search, geo, tags, full-text) needs an aggregating index. atproto doesn't give us that natively; we'd have to build one anyway — that index is the HTTP API.
- Payments, abuse rate-limiting, and webhooks live in service logic, not in records.
- One canonical HTTP API means web app, mobile app, MCP server, and third-party integrations all share the same business rules. Single source of truth for behavior; atproto is the single source of truth for *data*.
- The HTTP API stays portable: anyone can run their own scenius.social aggregator over the same atproto record set. That's the "any city" promise from the one-pager.

The MCP server should be a small standalone process (Node or Python) that authenticates via atproto OAuth, holds short-lived service-API tokens, and exposes the 19 tools above. Keeping it thin means agent-tool changes are mostly tool-schema edits, not protocol work.

---

### Sources

- [Luma Calendar Overview — help.luma.com](https://help.luma.com/p/luma-calendar-overview)
- [Creating an Event — help.luma.com](https://help.luma.com/p/creating-an-event)
- [Multi-Session / Recurring Events — help.luma.com](https://help.luma.com/p/multi-session-recurring-events)
- [Calendar Memberships — help.luma.com](https://help.luma.com/p/calendar-memberships)
- [Collaborating Calendars — help.luma.com](https://help.luma.com/p/collaborating-calendars)
- [Creating a Paid Event — help.luma.com](https://help.luma.com/p/creating-a-paid-event)
- [Understanding Payouts and Event Proceeds — help.luma.com](https://help.luma.com/p/understanding-payouts-and-event-proceeds)
- [Refunding a Guest — help.luma.com](https://help.luma.com/p/refunding-a-guest)
- [Create Coupons for Paid Events — help.luma.com](https://help.luma.com/p/create-coupons-for-paid-events)
- [Luma API endpoint index (llms.txt) — docs.luma.com](https://docs.luma.com/llms.txt)
- [Luma API Getting Started — docs.luma.com](https://docs.luma.com/reference/getting-started-with-your-api)
- [Luma Pricing — luma.com](https://luma.com/pricing)
- [Luma Plus Overview — help.luma.com](https://help.luma.com/p/luma-plus-overview)
- [Luma Zapier Integration — zapier.com](https://zapier.com/apps/luma/integrations)
- [Set up a Zapier Integration — help.luma.com](https://help.luma.com/p/set-up-a-zapier-integration)
- [Luma Event Platform overview — party.pro](https://party.pro/luma/)
