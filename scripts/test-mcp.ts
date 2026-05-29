/**
 * MCP gate: spawn the scenius MCP server over stdio, list its tools, and call
 * them — proving the agent-native surface works end-to-end (MCP → HTTP API →
 * AppView). Needs the dev server running on APP_URL.
 *   APP_URL=http://127.0.0.1:3000 npx tsx scripts/test-mcp.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API = process.env.APP_URL || "http://127.0.0.1:3000";
const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => { console.log(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
let failed = false;

function parse(res: { content?: Array<{ type: string; text?: string }> }) {
  const t = res.content?.find((c) => c.type === "text")?.text ?? "{}";
  return JSON.parse(t);
}

async function main() {
  console.log("\n— scenius: MCP agent surface gate —\n");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp/server.ts"],
    env: { ...process.env, SCENIUS_API_URL: API } as Record<string, string>,
  });
  const client = new Client({ name: "scenius-test", version: "1.0.0" });
  await client.connect(transport);
  ok("connected to MCP server over stdio");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  const expected = ["get_event", "get_scene", "list_scene_events", "list_scenes", "search_events"];
  JSON.stringify(names) === JSON.stringify(expected)
    ? ok(`exposes 5 tools: ${names.join(", ")}`)
    : bad(`tools wrong: ${names.join(", ")}`);

  // search_events — the headline tool
  const search = parse(await client.callTool({ name: "search_events", arguments: { city: "Boulder", limit: 5 } }) as never);
  Array.isArray(search.events) && search.events.length > 0
    ? ok(`search_events(city=Boulder) → ${search.events.length} events ("${search.events[0].name}")`)
    : bad(`search_events returned nothing: ${JSON.stringify(search).slice(0, 120)}`);
  search.events[0]?.when
    ? ok(`events include human "when" in event tz ("${search.events[0].when}")`)
    : bad("no human 'when' field");

  // list_scenes
  const scenes = parse(await client.callTool({ name: "list_scenes", arguments: {} }) as never);
  Array.isArray(scenes.scenes) && scenes.scenes.length >= 4
    ? ok(`list_scenes → ${scenes.scenes.length} scenes`)
    : bad(`list_scenes wrong: ${JSON.stringify(scenes).slice(0, 120)}`);

  // get_scene + list_scene_events
  const scene = parse(await client.callTool({ name: "get_scene", arguments: { handle: "techne" } }) as never);
  scene.name === "Techne" ? ok(`get_scene(techne) → ${scene.name}`) : bad(`get_scene wrong: ${JSON.stringify(scene).slice(0,120)}`);
  const sevents = parse(await client.callTool({ name: "list_scene_events", arguments: { handle: "techne" } }) as never);
  Array.isArray(sevents.events) ? ok(`list_scene_events(techne) → ${sevents.events.length} events`) : bad("list_scene_events wrong");

  // get_event (use the first search result's id)
  if (search.events[0]?.id) {
    const ev = parse(await client.callTool({ name: "get_event", arguments: { id: search.events[0].id } }) as never);
    ev.name ? ok(`get_event → "${ev.name}" (capacity: ${ev.capacity ? "tracked" : "open"})`) : bad("get_event wrong");
  }

  await client.close();
  console.log(failed ? "\n\x1b[31m▶ MCP GATE FAILED\x1b[0m\n" : "\n\x1b[32m▶ MCP GATE PASSED\x1b[0m\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
