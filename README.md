# mcp-usage

**You have 40 MCP servers connected. You use three. Find out which.**

`mcp-usage` reads your local Claude Code transcripts and tells you, per MCP server, whether it is actually used, sits idle in every session, fails to connect, or has been waiting for authorization for weeks — and what to disconnect.

It ships as a CLI and as an MCP server, so you can simply ask Claude *"which MCP servers should I turn off?"*.

Local, read-only, no network, no API key. It never returns conversation content.

```
$ npx mcp-usage

mcp-usage | last 30 days | 39 sessions
31 servers: 3 used, 14 unused, 1 failed, 13 needs-auth | 82 MCP calls

SERVER                         STATUS  TOOLS  SESSIONS  CALLS  ERR%  ~TOKENS  LAST USED
plugin:playwright:playwright   used       26        37     57   35%   ~3,442  2026-09-16
claude.ai Firecrawl            used       26        35     16    0%  ~16,948  2026-09-14
claude.ai Context7             used        2        38      9    0%  ~10,197  2026-08-24
claude.ai Design Tool          unused     42        38      0     -        -  -
claude.ai Mail                 unused     29        38      0     -        -  -
claude.ai Video Studio         unused    170        37      0     -        -  -
claude.ai Ads Manager          unused    106        37      0     -        -  -
claude.ai Database             unused     29        37      0     -        -  -
...

Failed to connect (1): plugin:data:warehouse
Waiting for authorization (13): claude.ai Calendar, plugin:productivity:tracker, plugin:marketing:seo, +10 more

Recommendations

disconnect (14)
  claude.ai Design Tool: Available in 38 sessions, never called (42 tools loaded each time).
  claude.ai Video Studio: Available in 37 sessions, never called (170 tools loaded each time).
  ...

investigate-errors (1)
  plugin:playwright:playwright: 20 of 57 calls failed (35%).
```

*(Numbers from a real machine; server names changed.)*

## Why

Every connected MCP server adds tool definitions to your sessions, adds startup time, and adds one more thing that can fail or ask for auth. Connecting servers is easy; nobody ever goes back to check which ones earn their place.

Cost analyzers (ccusage, agent-cost-mcp, …) tell you how many tokens and dollars you spent. `mcp-usage` answers a different question — **server hygiene**:

- Which servers are loaded in every session and **never called**?
- Which ones **fail to connect** or have been **waiting for authorization** for weeks?
- Which ones **error out** a third of the time, or return **huge results**?

Claude Code already records the answer: each session logs which MCP tools were available and which servers failed or needed auth. `mcp-usage` just reads it, so "available but never used" is exact, not a guess.

## Quick start

CLI — nothing to install:

```bash
npx mcp-usage
```

As an MCP server in Claude Code:

```bash
claude mcp add mcp-usage -- npx -y -p mcp-usage mcp-usage-server
```

Any other MCP client:

```json
{
  "mcpServers": {
    "mcp-usage": {
      "command": "npx",
      "args": ["-y", "-p", "mcp-usage", "mcp-usage-server"]
    }
  }
}
```

Then ask: *"Which of my MCP servers should I disconnect?"*

Requires Node.js 22 or later.

## What it reports

Each server gets one status:

| Status | Meaning |
|---|---|
| `used` | Called at least once in the window. |
| `unused` | Its tools were available, but nothing ever called them. |
| `failed` | Never exposed a tool; Claude Code reported a connection failure. |
| `needs-auth` | Never exposed a tool; waiting for authorization. |

Columns: `TOOLS` distinct tools the server exposed · `SESSIONS` sessions where they were available · `CALLS` · `ERR%` share of calls that returned an error · `~TOKENS` estimated size of all results · `LAST USED`.

Recommendations, in priority order:

| Action | Rule |
|---|---|
| `disconnect` | Unused, and available in ≥ 5 sessions (`--min-sessions`). |
| `fix-or-remove` | Failed to connect in ≥ 3 sessions. |
| `authorize-or-remove` | Waiting for authorization in ≥ 3 sessions. |
| `investigate-errors` | ≥ 5 calls and ≥ 30 % of them failed. |
| `heavy-results` | Results average ≥ 10,000 estimated tokens per call. |

Servers bundled with the Claude desktop app (`ccd_*`) are reported but never flagged for disconnection — you can't remove them.

## CLI

```
mcp-usage [options]

  --since <days>         Look back this many days (default 30)
  --project <path>       Only scan projects whose path contains this text
  --min-sessions <n>     Sessions before an unused server is flagged (default 5)
  --dir <path>           Claude config directory (default: $CLAUDE_CONFIG_DIR or ~/.claude)
  --json                 Print the full report as JSON
  --version, --help
```

Text output truncates long lists; `--json` always contains everything, including per-tool stats.

## MCP tools

All four are read-only and return JSON (`structuredContent` plus a text copy).

| Tool | Input | Returns |
|---|---|---|
| `usage_summary` | `since_days?` | Summary counts and one row per server. |
| `unused_servers` | `since_days?`, `min_sessions?` | Servers that are unused, failed, or waiting for auth. |
| `server_details` | `server`, `since_days?` | One server in full, with per-tool calls, errors and result size. Accepts the id or the label, case-insensitive. |
| `recommendations` | `since_days?`, `min_sessions?` | The prioritized action list. |

## Privacy

Transcripts contain everything you ever typed into Claude Code. This tool is built so that none of it can leave:

- **No network code.** The only runtime dependencies are the MCP SDK and zod.
- **Reads** only `tool_use` names and ids, `tool_result` sizes and error flags, and the tool-availability records.
- **Returns** server names, tool names, counts, byte totals and timestamps. Never prompts, responses, tool inputs, tool outputs, file paths or error messages.
- **Tested.** The fixtures plant `SECRET_*` markers everywhere private content lives in a real transcript, and the tests assert none of them reach the library, CLI or MCP output ([`tests/`](tests/)).

## Limitations

- **The transcript format is not a public API.** It is parsed defensively (every field optional, unknown records ignored, malformed lines counted and skipped), but a future Claude Code release can still break it. Tested against Claude Code 2.1.233–2.1.274.
- **Token figures are estimates**: result bytes ÷ 4, text only. Transcripts don't record per-result token counts, and image results are not counted.
- **Claude Code only**, for now. Client-specific code sits behind a small adapter interface ([`src/types.ts`](src/types.ts)); adapters for other clients are welcome.
- The same connector can appear under two names (for example a readable name in the CLI and a UUID in the desktop app); they are not merged.
- Claude Code deletes old transcripts, so long windows only see what is still on disk.

## Development

```bash
npm install
npm test
npm run build
node dist/bin/cli.js
```

Design notes: [`docs/superpowers/specs/`](docs/superpowers/specs/).

## License

MIT
