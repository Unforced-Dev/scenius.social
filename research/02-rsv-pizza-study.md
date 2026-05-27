# RSV.Pizza — Prior Art Study

Repo: https://github.com/PizzaDAO/rsv-pizza (live at https://rsv.pizza)
Owner: PizzaDAO. 14 stars, 8 forks, 28 open issues, no license file. Default branch `master`. Created 2026-01-10, last push 2026-05-26 — actively developed. Effectively a single-contributor project (`snackman`, ~2,100 commits). TypeScript dominant.

It is **not** an atproto project. It is a Supabase + Express + Vercel SaaS clone of Luma, narrowly themed around pizza-party hosting for the PizzaDAO "Global Pizza Party" network. Treat it as a feature checklist for a Luma-style host workflow, not as architectural inspiration.

## Stack

- **Frontend:** Vite + React 18 + TypeScript, TailwindCSS, react-router v6, TanStack Query, i18next, react-helmet-async. Maps via Google Places (`use-places-autocomplete`, `@googlemaps/markerclusterer`). Payments via `@stripe/react-stripe-js`. Wallet via `wagmi` + `connectkit` + `viem`. QR via `html5-qrcode`. Charts via `recharts`. Tests with Vitest + Playwright + RTL.
- **Backend:** Express on Node, Prisma 6 against Postgres, deployed to Vercel as a separate `backend-pizza-dao.vercel.app` service. Auth via `@privy-io/server-auth` for embedded wallets and a custom magic-link/JWT flow. Uses `viem` server-side for on-chain calls, OpenAI SDK, `sharp` for images, swagger-jsdoc for API docs.
- **Backing services:** Supabase (Postgres, Storage, Realtime, a few Edge Functions). Resend for transactional email. Stripe for card payments. Square for some pizzeria orders. Bland AI for outbound voice calls to pizzerias. Google Places. POAP. Telegram bot. An NFT mint flow against a Base-deployed `RSVPizzaNFT.sol` (OpenZeppelin ERC721, one-per-wallet-per-event).
- **Workspaces:** npm workspaces with `frontend/` and `backend/`. Also `contracts/`, `supabase/functions/`, `migrations/`, `scripts/`, `plans/`, and ~12 root markdown design docs (CONTEXT, PLAN, INTEGRATION_PLAN, WAVE_*, SECURITY_REFACTOR_PLAN, FUTURE_FEATURES, etc.). Built with `.bolt` and `.claude` directories present — Claude Code is part of the dev loop.

Two notable architectural smells, called out in their own `FUTURE_FEATURES.md`: (1) Supabase-direct writes coexist with the Express API, a hybrid the team wants to standardize; (2) "Preview deploys share production backend + DB" — a single Supabase instance for prod and previews.

## Features

The Prisma `Party` model has ~80 columns — far beyond Luma's core. Highlights:

- **Event creation:** `/new` host wizard, custom URL slugs (`rsv.pizza/<slug>`), slug aliases for renames, soft-cancel (`cancelledAt`/`reason`), timezone picker, address with Google Places + lat/lng, venue metadata (name, capacity, cost, contact, wifi/parking notes), event image + AI-generated flyer (`flyerConfig`, `posterImageUrl`, `rollupImageUrl`), description, password-gating, multiple co-hosts (JSON array).
- **RSVP flow:** Public 2-step form (`RSVPFormStep1` / `Step2`) — no login required. Captures dietary restrictions, liked/disliked toppings, beverage preferences. Optional approval gate (`requireApproval`), capacity + waitlist, `hideGuests`, share-to-unlock (forced tweet). Realtime guest count via a single opt-in Supabase channel (they had a site-wide outage from making this global — see `plans/calabrese-58204-pool-exhaustion-fix.md`).
- **Pizza ordering:** Their actual differentiator. Greedy compatibility-grouping algorithm (`frontend/src/utils/pizzaAlgorithm.ts`) produces topping combos that respect dietary restrictions and maximize satisfaction. Multi-wave delivery scheduling for long parties. Bland AI auto-calls the pizzeria with a generated script, persists transcript/recording/confirmed-total, retry logic, webhook reconciliation. Square integration for direct online orders.
- **Host tooling:** Tabbed `HostPage`, mobile-first `/run/:inviteCode` day-of dashboard, `/checkin/:inviteCode/:guestId` with QR scanner, `/dj/:inviteCode`, `/display/:partyId/:slug` slideshows, checklist, budget, staff/performer roster, sponsor CRM, social-post composer, KPI tracking (X/Farcaster/Luma/Eventbrite/POAP view counts), exported "one-sheet" + public report pages.
- **Discovery:** `/map` (with `/map/all` and admin `/map/swc` variants), `/photos` global feed, `/leaderboard`, `/partners`, `/gpp` landing for the Global Pizza Party umbrella event.
- **Auth:** Magic-link via Resend (6-digit code) → JWT. Privy generates embedded wallets for guests when needed. Wagmi/ConnectKit for external wallet connection. Telegram bot deeplink (`/start <token>`) to link hosts to a private chat.
- **Money & artifacts:** Stripe payments + donations (with crypto donation widget, ETH address, suggested-amount tiers, fundraising goals). USDC-on-Base payouts (`usdc-base.service.ts`). NFT mint after attendance, signed off-chain and minted by a relayer (gasless). FX service, ENS resolver.
- **Admin:** Underboss regional dashboards, shipping dashboard, payments admin, logo-cleanup tool, partner intake, OCR service, raffle.

`FUTURE_FEATURES.md` admits: guest email invites are stubbed (modal just `console.log`s), check-in QR is generated but the endpoint to mark attendance isn't wired, no E2E or algorithm unit tests, dietary half-and-half handling is naive.

## Atproto Integration

**None.** No `@atproto/*` packages in either `package.json`. No `did:`, `pds`, `lexicon`, `bsky`, or `atproto` references in the Prisma schema or visible source. Identity is email-magic-link → JWT, with Privy for embedded wallets and ETH/ENS as the only decentralized identifier surface. There is a `lumaUrl` column on `Party` strictly as an external-link KPI field — they treat Luma as a competitor whose pageviews they want to count.

Scenius is the atproto-native version. Nothing to copy here on identity, sync, or data ownership.

## Lessons

**Worth borrowing:**
- **Custom slug + alias table.** `customUrl` is unique; old slugs survive in `SlugAlias` and silently redirect. Cheap, kind to shared links.
- **Soft-cancel over hard-delete.** `cancelledAt`/`cancelledBy`/`cancellationReason` on the event with a banner on the public page. Pattern works directly on atproto records.
- **`Party.eventTags` + `eventType` string + tag array.** Simple, flexible, no taxonomy lock-in. Maps cleanly to atproto facets.
- **Day-of dashboard as a distinct route (`/run/:inviteCode`).** Mobile-first, host-only, completely different IA than the planning view. Luma doesn't have this and hosts ask for it.
- **Display routes (`/display/:partyId/:slug`).** Big-screen views designed to project on a wall during the event — slideshow, leaderboard, art. Great agent-native primitive: an agent could curate the slideshow live.
- **Public report pages (`/report/:slug`, `/venue-report/:slug`) with their own published/password fields.** Post-event canonical artifact — exactly the kind of thing a scenius wants to ATProto-publish.
- **Realtime opt-in per page, not global.** Their post-mortem (`calabrese-58204`) is a free lesson: never put a Supabase Realtime subscription in a global Context.
- **Magic-link → JWT.** Stripe-quality email template, 15-min code, normalized email column to defeat iOS auto-cap. Solid, no over-engineering.

**Don't repeat:**
- **80-column `Party` god-model.** Years of features bolted onto one wide table with `// pepperoni-58341` and `// porchetta-81402` task-IDs as comments. The atproto-native answer is multiple lexicons (event, venue, kit, report, sponsor, etc.) composed by reference.
- **Supabase + Express hybrid with shared prod DB across previews.** Picks every footgun of both architectures. Pick one substrate; in our case the PDS is the substrate.
- **Custom auth + Privy + wagmi all at once.** Three identity systems duct-taped together. Atproto OAuth + DIDs replaces all three for us.
- **No license.** Repo is "source-visible" only; cannot fork or learn-by-copy legally. Scenius should ship Apache-2.0 or MIT day one.
- **Single-contributor bus factor.** ~2,100 commits from one engineer. The codebase reflects it: heavy in-repo planning markdown, lots of one-off admin pages, weak test coverage. Plan for collaborators from the start.
- **Closed-stack discovery.** `/map`, `/leaderboard`, `/photos` are all internal to rsv.pizza. The scenius value prop is the opposite: discovery flows over a shared atproto graph.

**Net:** RSV.Pizza is a useful feature checklist for "what does a Luma host actually need" and a cautionary tale about feature-creep on a Web2 stack. Borrow the day-of dashboard, display routes, public reports, slug aliases, soft-cancel, and the magic-link UX. Throw away the data model and the auth stack.
