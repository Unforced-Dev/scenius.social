/**
 * scenius MCP server — the agent-native surface. Lets any MCP client (Claude,
 * etc.) answer "what's happening in Boulder this week?" across the network and
 * read scenes/events. v0 is read-only and wraps the public HTTP API (so the
 * search index, caching, and abuse floor stay in one place — the AppView).
 * Write tools (RSVP, create) come once agent OAuth is wired.
 *
 * Run:  SCENIUS_API_URL=http://127.0.0.1:3000 npx tsx mcp/server.ts
 * Then point an MCP client at it over stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = process.env.SCENIUS_API_URL || "http://127.0.0.1:3000";

async function api(path: string): Promise<unknown> {
  const res = await fetch(`${API}/api/v1${path}`);
  if (!res.ok) throw new Error(`scenius API ${res.status} for ${path}`);
  return res.json();
}

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

const server = new McpServer({ name: "scenius", version: "0.1.0" });

server.tool(
  "search_events",
  "Find upcoming events across scenes. The 'what's happening in Boulder this week' tool. Returns events curated onto public scene calendars, soonest first.",
  {
    query: z.string().optional().describe("free-text search over event name/description"),
    city: z.string().optional().describe("filter by city/locality, e.g. 'Boulder'"),
    scene: z.string().optional().describe("filter to one scene by its handle"),
    tag: z.string().optional().describe("filter by a scene tag, e.g. 'regen'"),
    limit: z.number().optional().describe("max results (default 25)"),
  },
  async ({ query, city, scene, tag, limit }) => {
    const data = await api(`/events?${qs({ q: query, city, scene, tag, limit })}`);
    return text(data);
  },
);

server.tool(
  "get_event",
  "Get full detail for one event by its id (an at:// URI), including capacity/attendance.",
  { id: z.string().describe("the event id (at:// URI)") },
  async ({ id }) => text(await api(`/events/${encodeURIComponent(id)}`)),
);

server.tool(
  "list_scenes",
  "Discover scenes (communities, neighborhoods, interest fields). Filter by text, city, or tag.",
  {
    query: z.string().optional(),
    city: z.string().optional(),
    tag: z.string().optional(),
    limit: z.number().optional(),
  },
  async ({ query, city, tag, limit }) => text(await api(`/scenes?${qs({ q: query, city, tag, limit })}`)),
);

server.tool(
  "get_scene",
  "Get a scene's detail (description, membership policy, builders) by its handle.",
  { handle: z.string().describe("the scene handle, e.g. 'techne'") },
  async ({ handle }) => text(await api(`/scenes/${encodeURIComponent(handle)}`)),
);

server.tool(
  "list_scene_events",
  "List the upcoming events on a specific scene's curated calendar.",
  { handle: z.string().describe("the scene handle") },
  async ({ handle }) => text(await api(`/scenes/${encodeURIComponent(handle)}/events`)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`scenius MCP server connected (API: ${API})`);
}

main().catch((err) => {
  console.error("scenius MCP server failed:", err);
  process.exit(1);
});
