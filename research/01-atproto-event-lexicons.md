# AT Protocol Event / Calendar / Community Lexicons — Prior Art (May 2026)

**Research target:** Identify every relevant atproto lexicon and project in the events / calendar / location / community space so scenius.social can build on existing primitives rather than invent its own.

**Bottom line up front:** A real, multi-app interoperable stack already exists under `community.lexicon.*`. Calendar events + RSVPs are shipped and adopted by **three independent platforms** (Smoke Signal, OpenMeet, Dandelion). Locations are partially shipped (address/geo/fsq/hthree) with a richer `place` lexicon in active PR review. Groups / scenes / membership are an open gap. Verification exists as `app.bsky.graph.verification` but is Bluesky-controlled.

---

## 1. Smoke Signal — `events.smokesignal.*` + adopts `community.lexicon.calendar.*`

- **URL:** https://smokesignal.events — blog https://blog.smokesignal.events — discourse https://discourse.smokesignal.events
- **Source code:** Re-homed from GitHub to **tangled.org** (atproto-native git hosting): `tangled.org/smokesignal.events/smokesignal`. The github.com/SmokeSignal-Events org is now an empty placeholder (last push Aug 2024). Most recent commit on tangled: ~Jan 2026 (4 months ago at time of research) — *active*.
- **Maintainer:** **Nick Gerakines** (@ngerakines.me). He is also a Lexicon Community TSC member. (Eric Bailey hypothesis from the brief is incorrect.)
- **Language / stack:** Rust (edition 2024), Axum, Postgres, Redis. PDS-backed records + custom AppView + Jetstream-style indexing.
- **Lexicons it owns (`events.smokesignal.*`):** Smoke-Signal-specific records that live alongside the community ones:
  - `events.smokesignal.profile` — app-specific user profile cache
  - `events.smokesignal.calendar.acceptance` — moderator/host acceptance of an RSVP (a verification layer on top of the user's `community.lexicon.calendar.rsvp`)
  - `events.smokesignal.event.configure` — recent (Jan 2026) XRPC procedure for event configuration
- **Lexicons it uses (community-shared):** `community.lexicon.calendar.event`, `community.lexicon.calendar.rsvp`, `community.lexicon.location.*`
- **Status:** Active, ~1.5 years old, presented at ATmosphereConf 2025/2026. Stewards the community lexicon work.
- **Takeaway for scenius:** Smoke Signal is the reference implementation. Adopt the `community.lexicon.calendar.*` records verbatim; copy the *pattern* of layering app-specific records (like `acceptance`) on top of community records when scenius needs scene-specific semantics (e.g., scene-membership-gated RSVPs).

## 2. `lexicon-community` / `community.lexicon.*` — the shared namespace

- **GitHub org:** https://github.com/lexicon-community (7 repos)
- **Lexicon repo:** https://github.com/lexicon-community/lexicon — 103 stars, last commit **2026-05-18** (active)
- **Site:** https://lexicon.community — Discourse: https://discourse.lexicon.community
- **TSC (seven volunteers, decisions in public via consent-seeking / sociocracy):**
  Boris Mann (bmann.ca), Ms Boba (essentialrandom.bsky.social), Nick Gerakines (ngerakines.me), Rudy Fraser (rude1.blacksky.team), Ryan Barrett (snarfed.org), Tom Sherman (tom.sherman.is), Bluesky PBC (bsky.app).
- **Governance model:** TSC charters working groups; working groups produce drafts; merges into the namespace happen via PR with TSC consent (no objection = pass; objections must be substantive harms, can be overridden only by majority vote). Documented in `lexicon-community/governance/GOVERNANCE.md`, MIT-licensed.
- **Currently shipped lexicons (in repo, on `main`):**

  | NSID | Type | Notes |
  |---|---|---|
  | `community.lexicon.calendar.event` | record (tid) | event w/ `name`, `description`, `createdAt`, `startsAt`, `endsAt`, `mode` (inperson/virtual/hybrid), `status` (planned/scheduled/cancelled/rescheduled/postponed), `locations` (union of address/fsq/geo/hthree/uri), `uris`, `rsvpExpected` (added May 2026) |
  | `community.lexicon.calendar.rsvp` | record (tid) | strongRef `subject` to event + `status` (interested/going/notgoing) |
  | `community.lexicon.location.address` | object | ISO country, postal, region, locality, street, name |
  | `community.lexicon.location.geo` | object | lat, lon, alt (all strings, WGS84), name |
  | `community.lexicon.location.fsq` | object | Foursquare OS Places `fsq_place_id` + lat/lon/name |
  | `community.lexicon.location.hthree` | object | H3 grid-cell encoding (note: was `h3`, renamed Feb 2025 because NSIDs can't contain digits — see "Incident 1") |
  | `community.lexicon.bookmarks.bookmark` (+ getActorBookmarks, auth*) | record + XRPC | portable bookmarks |
  | `community.lexicon.interaction.like` | record | generic-subject like |
  | `community.lexicon.preference.ai` | record (added Apr 2026) | user AI-training opt-in/out |
  | `community.lexicon.payments.webMonetization` | record | Web Monetization wallet pointer |

- **Open PRs (active proposals as of May 2026):**
  - **#64 `community.lexicon.location.place`** (Schuyler Erle, updated 2026-05-17) — a chunky proposal for full place gazetteers: globally-unique IDs, naming, vendor attributes, revision tracking, concordance. *This is the place primitive scenius wants for "scenes-as-places."* In active TSC review.
  - **#63** GeoJSON / WKT complex geometries
  - **#59** Nominatim (OSM) location lexicon
  - **#76 `community.lexicon.app.*`** (Pixeline, 2026-05-18) — `community.lexicon.app.entry` (third-party app listings) and `community.lexicon.app.profile` (self-published canonical app profile at rkey `self`). Useful for any "list of agents/apps in this scene" feature.
  - **#28** Recipe + Recipe Collection
- **Discovery / curation:** https://github.com/lexicon-community/awesome-lexicons catalogs third-party lexicons across the atmosphere.
- **Recent incident worth knowing:** "Incident 1 — h3 location lexicon" (Discussion #44). The `h3` segment violated the NSID spec (no digits in name segments). Fixed by renaming to `hthree`. They now run `lex-cli` in CI. Lesson: validate every NSID segment against the spec on day one.

## 3. ATGeo — Community Fund place project

- **Site:** https://atgeo.org — places-for-AT-Protocol working group
- **Funding:** AT Protocol Community Fund's second project; Peter Wang's Skyseed Fund seeded $15k (March 2025). Leads: Nick Gerakines + Boris Mann.
- **Deliverables (per atprotocol.dev announcement):** venue lexicon linked to Foursquare OSP, lat/lon lexicon, Foursquare dataset replicated onto atproto with lazy-load, hosted venue-lookup XRPC endpoint, firehose/feed/search/map infra.
- **Status:** The geo + fsq + hthree + address lexicons are shipped (above). The richer `place` record (PR #64) is in TSC review. ATGeo runs an XRPC venue-search API at atgeo.org/api/.
- **Takeaway:** When scenius needs "this scene lives at the Bushwick Generator," reference an ATGeo place URI; don't invent a venue type. Subscribe to PR #64 — it will likely be the canonical place record.

## 4. Other adopters of the calendar lexicons

- **OpenMeet** (https://openmeet.net, https://github.com/openmeet-team) — TypeScript / NestJS / Vue. Opensource Meetup.com replacement. Provisions an atproto DID + PDS account for every user on signup. **Publishes events via `community.lexicon.calendar.event`** — events created in OpenMeet appear in Smoke Signal and vice versa, *zero coordination*. Repos: `openmeet-platform`, `openmeet-api`, `survey` (Go), `atproto-devnet`.
- **Dandelion** (https://dandelion.events) — Not-for-profit worker co-op for paid/ticketed events; fair-source license. Cross-posts events to atproto using the community calendar lexicon. Third independent client of the same schema.
- **Sonaruo** (github.com/ATProtoApps/sonaruo) — third-party Bluesky client; has an open issue (#5) to render Smoke Signal events inline.
- **Anchor / dropanchor.app** (https://github.com/dropanchorapp/Anchor, /anchorPDS, /location-feed-generator) — Swift iOS location check-in app. Uses `community.lexicon.location.address` and `community.lexicon.location.geo` and defines its own `app.dropanchor.checkin` (strongRef to address record + geo embed). A useful pattern for scenius "show up at the scene" check-in primitives.
- **BeaconBits** — saved-locations app, interops with DropAnchor via the same community location records (per Smoke Signal discourse).

## 5. Groups / membership / scene primitives — **gap**

Nothing in `community.lexicon.*` covers groups, memberships, or "scenes." Closest adjacent work:

- **Roomy** (https://github.com/muni-town/roomy, blog.muni.town) — Discord-style group chat. Uses atproto for identity + social discovery but stores chat state in a bespoke event-sourced sync system called **Leaf** (Loro CRDT). Components are *Lexicon-like* but not in `community.lexicon`. Not a drop-in for membership.
- **`app.bsky.graph.list` / `app.bsky.graph.listitem`** — Bluesky's own list primitive (curation/moderation lists). Bluesky-controlled namespace. Can be hijacked but isn't semantically a "group/scene."
- **`app.bsky.graph.verification`** — Bluesky's "scalloped checkmark" lexicon. `subject` (DID) + `handle` + `displayName` + `createdAt`. Trusted Verifier status is a Bluesky-side flag (`trustedVerifierStatus: valid`). Useful pattern for scene-issued attestations but the NSID is Bluesky's.
- **ATmosphereConf 2026 talk** "Who owns the group chat? Building collaborative spaces on ATProto" — signals the community knows groups/audiences are an open problem. Tied to the Private Data Working Group on the atproto.wiki, which is exploring private-repo / audience semantics.
- **Lexicon Community Discourse:** "attestations, traits, profiles" are listed as topics under discussion, no shipped lexicons yet.

**Implication:** scenius will likely need to define its own `social.scenius.scene` / `social.scenius.membership` / `social.scenius.attestation` lexicons. Propose them upstream to community.lexicon once stable — Nick has explicitly said he wants to "transition Smoke Signal to use lexicon.community" for any shared primitives.

---

## Recommendations for scenius.social

**Adopt verbatim (do not redefine):**
1. `community.lexicon.calendar.event` for events
2. `community.lexicon.calendar.rsvp` for RSVPs
3. `community.lexicon.location.{address,geo,fsq,hthree}` for locations today
4. Track PR #64 `community.lexicon.location.place` and adopt the day it merges; use ATGeo's venue-lookup XRPC for venue resolution
5. `com.atproto.repo.strongRef` everywhere we reference other records (Smoke Signal pattern — RSVPs pin event AT-URI + CID so they survive edits/deletes)

**Extend with our own NSID (`social.scenius.*` recommended):**
- `social.scenius.scene` — the core "scene" record (name, description, place ref, member policy)
- `social.scenius.membership` — actor ↔ scene relation, with strongRef to scene
- `social.scenius.attestation` — peer-issued attestation within a scene (mirrors `app.bsky.graph.verification` shape but issued by scene members, not Bluesky)
- `social.scenius.event` *(optional)* — a thin sidecar to a `community.lexicon.calendar.event` that adds scene-context (`sceneRef`, gating policy). Same pattern Smoke Signal uses with `events.smokesignal.calendar.acceptance`. Keep the calendar event itself in the shared namespace so OpenMeet/Smoke Signal can index our events for free.

**Coexist / monitor:**
- Roomy's Leaf component model — interesting prior art for component-attached metadata, but not a foundation we'd build on now.
- Bluesky's `app.bsky.graph.verification` — pattern reference for attestations, but don't depend on it (Bluesky-owned).
- Private Data WG — relevant if scenius ever wants private/invite-only scenes.

**Process:**
- Get on the Lexicon Community Discourse and propose `social.scenius.*` early, even as drafts, to signal interest in upstreaming.
- Register `scenius.social` and use it as the NSID-reverse base (`social.scenius.*`) — atproto NSID authority is rooted in DNS-resolvable domain control.
- Run `@atproto/lex-cli` and `goat lex parse` in CI from day one to avoid the h3-style NSID embarrassment.

## Sources

- [Smoke Signal Events on tangled](https://tangled.org/smokesignal.events/smokesignal)
- [Smoke Signal blog: Lexicon Records](https://blog.smokesignal.events/posts/3lthfwkxvs22c-lexicon-records)
- [lexicon-community/lexicon (GitHub)](https://github.com/lexicon-community/lexicon)
- [lexicon-community/governance — GOVERNANCE.md](https://github.com/lexicon-community/governance)
- [lexicon.community site](https://lexicon.community/)
- [awesome-lexicons](https://github.com/lexicon-community/awesome-lexicons)
- [ATGeo](https://atgeo.org/) and [Community Fund announcement](https://atprotocol.dev/location-data-on-at-protocol-the-second-community-fund-project/)
- [Incident 1: h3 location lexicon discussion](https://github.com/orgs/lexicon-community/discussions/44)
- [PR #64 — community.lexicon.location.place](https://github.com/lexicon-community/lexicon/pull/64)
- [PR #76 — community.lexicon.app](https://github.com/lexicon-community/lexicon/pull/76)
- [OpenMeet — Cross-App Authentication on AT Protocol](https://openmeet.net/cross-app-authentication-atproto)
- [Dandelion](https://dandelion.events/)
- [Anchor (DropAnchor) GitHub](https://github.com/dropanchorapp/Anchor)
- [Roomy (muni-town)](https://github.com/muni-town/roomy)
- [Verification on atproto.wiki](https://atproto.wiki/en/wiki/reference/verification)
- [ATmosphereConf 2026 — group chat talk](https://atmosphereconf.org/event/obaP26x)
- [Tijs Teulings: How Location Data is Coming to AT Protocol](https://medium.com/@_tijs/the-missing-piece-how-location-data-is-coming-to-the-at-protocol-9858160c2634)
