# AT Protocol Architecture Primer for scenius.social

*Decision-oriented brief — May 2026*

This is a snapshot of what's actually load-bearing for shipping a new atproto app *today*, not a protocol explainer. Several pieces that were rough in 2024–25 have shipped or stabilized in the Spring 2026 cycle — most importantly OAuth, lexicon resolution, and `Tap` (the new firehose-to-webhook synchronizer). Those changes meaningfully shrink the v0 build.

---

## Minimal-Viable Architecture for v0

The cheapest credible shape for scenius.social v0 is **one AppView, no PDS, no relay**:

```
[ User's existing PDS (bsky.social or any) ]
              │  (writes via OAuth-authenticated XRPC)
              ▼
        [ Bluesky Relay ]
              │  (firehose)
              ▼
        [ Tap (managed or self-hosted) ]
              │  (filtered webhooks for community.lexicon.calendar.* + our scenius.social.* records)
              ▼
   ┌──────────────────────────────────┐
   │  scenius.social AppView          │
   │  - Next.js (or Hono) backend     │
   │  - Postgres index                │
   │  - @atproto/oauth-client-node    │
   │  - @atproto/api for writes       │
   │  - serves XRPC + a web UI        │
   └──────────────────────────────────┘
```

Users sign in with their existing Bluesky handle via OAuth. Their event records, RSVPs, attestations, and scene memberships are written **to their own PDS** (bsky.social for the 95% case). We never own user identity or content storage. Our AppView indexes the records we care about into Postgres and serves the calendar UI plus an XRPC + MCP query layer.

This is essentially the **Statusphere pattern** scaled up, and matches how **Smoke Signal** (the most directly comparable existing app — also a calendar/RSVP on atproto) operates today.

---

## Key Decisions & Trade-offs

| Question | Recommendation for v0 | Why |
|---|---|---|
| **Run our own PDS?** | **No.** Let users keep their bsky.social PDS; offer Blacksky/Blacksky-style providers as a recommendation for the privacy-curious. | A PDS is cheap (~$4/mo VPS, Raspberry Pi works) but adds ops surface (backups, abuse, account recovery, allowlisting with the Relay). Not on the v0 critical path. We can add an optional `pds.scenius.social` later for users who want it. |
| **Lexicon namespace?** | **Adopt `community.lexicon.calendar.*`** for events and RSVPs (already shipped, MIT-licensed, used by Smoke Signal). Mint `social.scenius.*` only for the things that don't exist: scenes, memberships, attestations, scene treasuries. | Interop with Smoke Signal day one is a strategic win. Every event we index is also a Smoke Signal event and vice versa. We differentiate on the *scene* primitive, not by reinventing calendar. |
| **AppView language?** | **TypeScript** with `@atproto/api` + `@atproto/oauth-client-node` + `@atproto/tap` client. | The TS SDK is the reference; lexicon code generation works; OAuth client is mature; matches the Statusphere tutorial 1:1. Python (MarshalX) is solid for scripts; Go (indigo) is best for infra (run Tap from source if we self-host). |
| **Firehose ingest?** | **Use Tap** (Bluesky's new managed sync service, beta as of Spring 2026). Filter on the NSIDs we care about. | Tap handles MST verification, backfill, signature checking, desync recovery — all the cryptographic foot-shooting. Webhooks land in our AppView like any other event source. If Tap pricing or beta status concerns us, self-host the Go binary (`indigo/cmd/tap`) — same ~35–45k events/sec. |
| **Database?** | **Single Postgres** (Supabase or Neon fine). | Statusphere uses SQLite; for our query patterns (calendars, scenes, memberships, web-of-trust traversal), Postgres with `ltree`/`hstore` is the better default and lets us push membership queries efficiently. |
| **Federate from day one?** | **No.** Single-AppView launch. Federation is *receiving* writes from arbitrary PDSes (which we get for free via the firehose) — we don't need to operate a relay or accept federated AppViews. | Federation cost is functionally zero for us as long as we're consuming the global firehose and our records live on users' PDSes. We're already federated by virtue of using atproto. |
| **OAuth scope?** | **Use `@atproto/oauth-client-node` server-side**, session cookies to the SPA. | Spring 2026 roadmap shipped "permissions and permission sets," so we can request narrow scopes (e.g., write only to `community.lexicon.calendar.*` and `social.scenius.*` collections). Avoid `oauth-client-browser` unless we commit to a no-backend architecture. |
| **DID method?** | **did:plc** by default (what bsky.social issues), support **did:web** for self-hosters. | No action required — both resolve transparently through `@atproto/identity`. |

---

## Publishing Our Lexicons

For our novel records (`social.scenius.scene`, `social.scenius.membership`, `social.scenius.attestation`, etc.):

1. **Own the domain authority.** `scenius.social` is already ours, so NSIDs like `social.scenius.scene` are well-formed.
2. **Add DNS TXT records** for resolution:
   ```
   _lexicon.scenius.social     TXT  "did=did:web:scenius.social"
   ```
3. **Publish schemas to a PDS** under the `com.atproto.lexicon.schema` collection (rkey = NSID). Easiest path: run a tiny did:web identity for the project and host the schemas there.
4. **For calendar records**, do *not* mint our own — use `community.lexicon.calendar.event` and `community.lexicon.calendar.rsvp` as-is. If we need extensions (e.g., scene-scoped visibility), propose them upstream at lexicon.community first, then add scene-specific fields as a sidecar record in our namespace.

NSID resolution via DNS TXT + the new `@atproto/lex` tool and `goat` CLI (both refreshed in Spring 2026) means other AppViews can discover and validate our schemas without coordination.

---

## What bsky.social's PDS Will and Won't Do for Us

- **Write limits:** 5,000 points/hour, 35,000/day per account → ~1,666 records/hour, 11,666/day. Plenty for human-scale event posting; tight if we're doing bulk imports. `applyWrites` batch limit is **10** (was 200). Plan imports accordingly.
- **Custom lexicons:** Historically the reference PDS rejected unknown schemas. As of the Spring 2026 roadmap this restriction is being relaxed, but **verify before launch** — write a `social.scenius.scene` record to a real bsky.social account and confirm it persists. This is the single highest-risk verification on the critical path.
- **No allowlist needed** for the *AppView* — anyone can subscribe to the firehose. Allowlisting only applies if we run our own PDS and want the Bluesky Relay to ingest from it.

---

## Starter Resources

- **Statusphere tutorial** (the canonical "build a new atproto app" guide): https://atproto.com/guides/statusphere-tutorial — repo: https://github.com/bluesky-social/statusphere-example-app. Clone this first.
- **Bluesky cookbook** (smaller examples, including `ts-bot`): https://github.com/bluesky-social/cookbook
- **Tap** (firehose synchronizer): https://docs.bsky.app/blog/introducing-tap, source at https://github.com/bluesky-social/indigo/tree/main/cmd/tap
- **OAuth reference** (browser + node): `@atproto/oauth-client-node`, `@atproto/oauth-client-browser`. Working examples: https://github.com/j4ckxyz/atproto-oauth-reference
- **Smoke Signal** (closest comparable app, study their lexicons & UX): https://blog.smokesignal.events/, discourse at https://discourse.smokesignal.events
- **community.lexicon** (where calendar lives): https://lexicon.community/ — repo: github.com/lexicon-community/lexicon
- **Frontpage** (a non-Bluesky AppView in production, good reference for non-feed UI): frontpage.fyi
- **Awesome lexicons** (survey of who's defined what): https://github.com/lexicon-community/awesome-lexicons
- **Serverless Statusphere on Cloudflare** (alt-stack reference if we want Workers): https://blog.cloudflare.com/serverless-atproto/

---

## Watch-outs / Known Footguns

1. **Third-party lexicon writes to bsky.social are the load-bearing assumption.** Verify with a real write before committing the architecture. If it's still gated, the fallback is to run a single PDS that we use for our app's records *only*, while letting Bluesky handle identity — but that adds significant ops.
2. **Tap is beta.** Production-class for many shops but not battle-tested. Be ready to fall back to a direct `com.atproto.sync.subscribeRepos` WebSocket subscriber (a few hundred lines of TS); the Statusphere tutorial used to do this before Tap.
3. **OAuth's `stateStore` and `sessionStore` are not provided** — you implement them (Postgres-backed is fine). This is the most common stumbling block per developer feedback in 2025–26.
4. **Rate limits cut both ways.** Per-account write caps mean we can't batch-import a 1,000-event scene calendar in one shot under a single user identity. Design imports to spread across users (the event's actual host) or use scene-level service accounts thoughtfully.
5. **Lexicon community governance is slow by design.** If we want changes to `community.lexicon.calendar.*`, expect weeks. For anything fast-moving, mint in `social.scenius.*` first, contribute upstream once stable.
6. **Membership/attestation is NOT a solved primitive in atproto.** This is where we earn our keep — there's no `community.lexicon.attestation` to adopt, so we define `social.scenius.attestation` from scratch. Keep it lightweight and resist conflating identity attestation with funding-weight attestation (the existing one-pager already calls this out).
7. **MCP/agent-native query API is bespoke.** atproto's XRPC will cover the data layer; an MCP server is a thin wrapper over our AppView's read API. Don't expect upstream help here.

---

## Bottom Line

The v0 ship is genuinely cheap and tractable: a Next.js + Postgres app that uses Bluesky for identity and storage, Tap for sync, and adopts `community.lexicon.calendar.*` for events. The scene/membership/attestation primitive is where we actually build something new. The Spring 2026 roadmap closed the gaps (OAuth, lexicon resolution, Tap) that would have made this painful a year ago. The single highest-risk verification before committing is confirming bsky.social will accept writes to our custom `social.scenius.*` collection.

---

*Sources: atproto.com/blog/2026-spring-roadmap, atproto.com/guides/statusphere-tutorial, atproto.com/guides/publishing-lexicons, atproto.com/guides/self-hosting, docs.bsky.app/blog/introducing-tap, docs.bsky.app/docs/advanced-guides/rate-limits, lexicon.community, blog.smokesignal.events, github.com/bluesky-social/statusphere-example-app, github.com/bluesky-social/cookbook, github.com/blacksky-algorithms/rsky, docs.blacksky.community.*
