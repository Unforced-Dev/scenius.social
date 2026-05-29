# scenius MCP server

The agent-native surface for scenius. Any MCP client (Claude Desktop, Claude
Code, etc.) can ask **"what's happening in Boulder this week?"** and read scenes
and events across the network.

## Tools (v0, read-only)

| Tool | What it does |
|---|---|
| `search_events` | Find upcoming events (by text, city, scene, tag) — the headline tool |
| `get_event` | Full detail for one event incl. capacity/attendance |
| `list_scenes` | Discover scenes by text/city/tag |
| `get_scene` | A scene's detail + builders |
| `list_scene_events` | A scene's curated calendar |

It wraps the public HTTP API (`/api/v1/*`), so discovery, caching, and the abuse
floor live in one place (the AppView). Write tools (RSVP, create) arrive once
agent OAuth is wired.

## Run

```bash
SCENIUS_API_URL=http://127.0.0.1:3000 npm run mcp
```

## Connect to Claude

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "scenius": {
      "command": "npx",
      "args": ["tsx", "/Users/parachute/Gitcoin/scenius.social/mcp/server.ts"],
      "env": { "SCENIUS_API_URL": "http://127.0.0.1:3000" }
    }
  }
}
```

Then: *"Use scenius to find regen events in Boulder this week."*

## Test

```bash
npm run test:mcp   # spawns the server, lists tools, calls each (needs the dev server up)
```
