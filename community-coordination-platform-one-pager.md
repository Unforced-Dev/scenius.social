# Community Coordination Platform
*A one-pager — working draft*

## What this is

A community coordination platform that treats *scenes* — neighborhoods, shared-interest communities, cities — as the primary unit, rather than individuals or events. The first surface is a calendar. The longer arc is helping communities cohere, attest membership, and eventually allocate resources to sustain themselves.

## The problem

Existing tools (Luma, Eventbrite, Meetup, Facebook Events) treat events as host-owned objects, weakly grouped. They extract value upward — subscription fees, transaction fees, attention — while offering little structure to the communities that actually generate the gatherings. There's no first-class concept of a scene: no shared membership, no membership-gated visibility, no path for value to flow back into the community that produced it. The infrastructure works against the thing it's nominally for.

## Approach

**Scenes are the primitive.** A scene can be a neighborhood, a club, a city, or an emergent interest community. Scenes have members (established via mutual attestation, not central administration), events (visible according to scene rules), and over time, resources. A person belongs to many overlapping scenes; the platform makes those overlaps legible.

Some scenes are place-defined — neighborhoods, cities — and carry civic gravity (local infrastructure partnerships, voting, schools). Others are interest-defined — Boulder Tech, Boulder Regenerative — and emerge from the people who show up. The data model treats them uniformly, with place as one attribute among others.

## Initial scope

- **Calendar as first surface.** Clean, organizer-friendly, on par with Luma feature-wise.
- **Scenes as containers.** Events post to scenes rather than individual profiles; cross-scene visibility for shared events; membership-gated visibility where scenes want it.
- **Web-of-trust membership.** Mutual attestation among members; scenes crystallize at social density rather than central declaration.
- **Agent-native by default.** Open MCP and API with a generous free tier, so anyone can ask Claude (or any agent) "what's happening in Boulder this week." Monetize where real costs live — sends, ticketing, premium hosting — not by gating data.
- **Ticketing built in.** With community-flavored options: sliding scale, mutual aid, member-priority allocation, donations to the scene treasury.

## The longer arc

As scenes mature, the platform supports more. Ticketing revenue routes to scene treasuries. Treasuries support operational needs first — venues, honorariums, equipment, food for potlucks. Eventually, scenes that want it can experiment with more interesting allocation primitives: trust-weighted decisions, quadratic funding, conviction voting. The endpoint is communities that can sustain themselves economically through the coordination they're already doing — a regenerative loop rather than an extractive one.

A core design constraint along this arc: keep the membership-attestation signal distinct from any allocation-weighting signal. Trust answers "do you belong here?" reasonably well; conflating it with "should we fund you?" is how attestation networks get gamed for resource access.

## Why now, why here

Three things have shifted. The agent-native era makes a queryable community-data substrate genuinely valuable for the first time. Communities of practice around regenerative coordination, web-of-trust systems, and local civic infrastructure have matured enough to actually use this. And the extractive incumbent model is increasingly visible as a problem people want out of.

Boulder is the credible starting point. The seed communities — our cooperative, Techne, the Neighborhood Village Project, Woven Web — are already doing the coordination work this platform exists to support. Cultivating scenius is a stated public-benefit mission of the co-op; this is the infrastructure version of that work.

**Built in Boulder. Designed to work in any city.**
