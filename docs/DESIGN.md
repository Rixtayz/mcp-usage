# mcp-usage — design

Date: 2026-09-17
Status: implemented in v0.1

## Problem

Claude Code users accumulate MCP servers (claude.ai connectors, plugins, local
servers). Nobody knows which ones they actually use. Existing transcript
analyzers (agent-cost-mcp, claude-session-analyzer, ai-usage-mcp) report tokens
and dollars per tool or per session. None of them groups by **server**, and none
detects servers that are **connected but never called**, **failing to connect**,
or **stuck waiting for auth**.

`mcp-usage` answers one question: *which of my MCP servers should I keep?*

Reference data point (author's machine, 94 sessions, 358 MB): ~54 servers
available, 3 ever called, 83 MCP calls total.

## Scope

v1:

- Claude Code transcripts only (`~/.claude/projects`, honoring `CLAUDE_CONFIG_DIR`).
- A CLI (`npx mcp-usage`) and an MCP stdio server sharing one core.
- Read-only, fully local, no network, no API key.

Out of scope for v1: other clients (Cursor, Codex, Claude Desktop), dollar
costs, caching, web dashboard, editing the user's MCP configuration.

## Transcript format (as observed, Claude Code 2.1.233–2.1.274)

The format is not a public API. Every field is treated as optional.

Layout:

```
projects/<cwd-slug>/<sessionId>.jsonl
projects/<cwd-slug>/<sessionId>/subagents/agent-<agentId>.jsonl
```

Records used:

| Purpose | Where |
|---|---|
| Tool call | `type:"assistant"` → `message.content[]` items with `type:"tool_use"`, fields `id`, `name` |
| Tool result | `type:"user"` → `message.content[]` items with `type:"tool_result"`, fields `tool_use_id`, `content` (string or block array), `is_error` (often absent = success) |
| Availability | `type:"attachment"` → `attachment.type:"deferred_tools_delta"`, fields `addedNames[]`, `removedNames[]`, `failedMcpServers[{name,errorCode,error}]`, `needsAuthMcpServers[]`, `pendingMcpServers[]` |
| Canonical server ids | `type:"attachment"` → `attachment.type:"mcp_instructions_delta"`, field `addedNames[]` |

Rules:

- Count calls **only** from `tool_use` blocks. The string `mcp__` also appears in
  prompt snapshots, compact boundaries and ToolSearch results.
- Tool name parsing: strip the `mcp__` prefix, split on the **first** `__`.
  The server segment may contain `_`, `-`, `.`, or be a bare UUID. The tool
  segment may itself contain `__` or `--`.
- Canonical ids (`claude.ai Context7`, `plugin:small-business:shopify`) map to
  the mangled form used in tool names by replacing every character outside
  `[A-Za-z0-9_-]` with `_`.
- There is no per-tool-result token count. Result weight is estimated as
  `bytes / 4` and is always labeled an estimate.
- Files can reach ~90 MB with single lines above 10 MB: stream, never load whole
  files. Unparseable lines are skipped and counted, never fatal.
- Sidecar record types (`ai-title`, `mode`, `last-prompt`, …) lack `uuid` and
  `version`; dispatch on `type` first and ignore unknown types.

## Architecture

```
src/
  types.ts               Event, ServerStats, Recommendation, Report, ClientAdapter
  names.ts               parseToolName, mangleServerId
  scan.ts                discover transcript files; --since (mtime), --project filters
  parser.ts              streaming JSONL reader → typed events
  adapters/claude-code.ts  ClientAdapter implementation (scan + parser)
  aggregate.ts           events → per-server stats
  recommend.ts           stats → prioritized recommendations
  analyze.ts             options → Report (the one entry point both shells use)
  report.ts              text table rendering
  cli.ts                 argument parsing, output
  server.ts              MCP server factory
  bin/cli.ts, bin/server.ts  executable entry points
  index.ts               public exports
```

### Events (parser output)

```ts
type Event =
  | { kind: "call"; sessionId: string; timestamp?: string; toolUseId: string;
      server: string; tool: string }
  | { kind: "result"; sessionId: string; toolUseId: string; isError: boolean; bytes: number }
  | { kind: "availability"; sessionId: string; timestamp?: string;
      added: string[] }                              // full mcp__ tool names
  | { kind: "health"; sessionId: string; timestamp?: string;
      failed: string[]; needsAuth: string[] }        // canonical server ids
  | { kind: "roster"; sessionId: string; canonicalIds: string[] };
```

The parser tracks pending MCP call ids per file and emits a `result` event only
for a `tool_result` that answers one of them. Lines containing none of the
relevant markers are skipped before `JSON.parse`. `removedNames` is ignored: a
server removed mid-session was still available in that session. Error codes and
error bodies of failed servers are never read into events. Result bytes count
text only; image blocks are excluded.

Events carrying a timestamp older than the `--since` window are dropped by the
aggregator (files are also pre-filtered by mtime).

### Per-server stats (aggregate output)

```ts
interface ServerStats {
  server: string;            // mangled id, the grouping key
  label: string;             // canonical id when known, else the mangled id
  toolsAvailable: number;    // distinct tools ever advertised
  sessionsAvailable: number; // sessions where ≥1 tool was advertised
  calls: number;
  sessionsUsed: number;
  toolsUsed: number;         // distinct tools called
  errors: number;
  errorRate: number;         // errors / calls, 0 when calls = 0
  lastUsed?: string;         // ISO timestamp
  resultBytes: number;
  estResultTokens: number;   // resultBytes / 4, rounded
  sessionsFailed: number;
  sessionsNeedsAuth: number;
  status: "used" | "unused" | "failed" | "needs-auth";
  tools: { tool: string; calls: number; errors: number; resultBytes: number }[];
}
```

Status precedence: `used` if `calls > 0`; else `failed` if `sessionsFailed > 0`
and no tools were ever available; else `needs-auth` if `sessionsNeedsAuth > 0`
and no tools were ever available; else `unused`.

Servers that appear only in `failed` / `needsAuth` lists (canonical ids) are
keyed by their mangled form so they merge with any tool-name sightings.

### Recommendations

Rules, in priority order, each producing `{ server, action, reason }`:

1. `unused` with `sessionsAvailable ≥ minSessions` (default 5) → **disconnect**.
2. `failed` in ≥ 3 sessions → **fix-or-remove**.
3. `needs-auth` in ≥ 3 sessions → **authorize-or-remove**.
4. `used` with `calls ≥ 5` and `errorRate ≥ 0.3` → **investigate-errors**.
5. `used` with average `estResultTokens / calls ≥ 10 000` → **heavy-results**.

### CLI

```
mcp-usage [--since <days>] [--project <path-substring>] [--json] [--dir <claude config dir>]
```

Default output: a table sorted by calls desc then name, one row per server,
followed by the recommendations and a footer with files scanned / lines skipped.
`--json` prints `{ summary, servers, recommendations }`. Default `--since` is 30.

### MCP server

Four tools, all annotated `readOnlyHint: true`, all returning JSON text plus
`structuredContent`:

| Tool | Input | Output |
|---|---|---|
| `usage_summary` | `since_days?` | summary + one compact row per server (no per-tool detail) |
| `unused_servers` | `since_days?`, `min_sessions?` | servers with status `unused`, `failed`, `needs-auth` |
| `server_details` | `server`, `since_days?` | full `ServerStats` including per-tool rows; accepts mangled id or label, case-insensitive |
| `recommendations` | `since_days?` | recommendation list |

### Privacy

Output contains server names, tool names, counts, byte totals and timestamps.
It never contains message text, tool inputs, tool outputs, file paths from
transcripts, or error message bodies. A test enforces this on the fixtures.

## Error handling

- Missing projects directory → clear message, exit code 1 (CLI) / tool error (MCP).
- Unreadable file → skipped, counted in `filesFailed`.
- Malformed JSON line → skipped, counted in `linesSkipped`.
- Unknown `server` in `server_details` → tool error listing close matches.

## Testing

vitest, test-first. Fixtures are **synthetic** JSONL built by helpers in the
tests; no real transcript data enters the repository. Coverage targets: name
parsing edge cases; absent `is_error`; sidecar records; oversized line;
missing fields; subagent transcripts; canonical↔mangled reconciliation;
failed / needs-auth servers; privacy guarantee; CLI text and `--json` output;
MCP tools via in-memory client/server transport.

## Delivery

TypeScript, ESM, Node ≥ 22 (vitest 5 requires it; Node 20 is end-of-life). Dependencies: `@modelcontextprotocol/sdk`, `zod`.
Dev: `typescript`, `vitest`, `tsx`. MIT license. GitHub Actions: test matrix on
Windows, Linux, macOS. npm package `mcp-usage` with `bin` entries `mcp-usage`
(CLI) and `mcp-usage-server` (MCP). README in English with the table
screenshot, one-line install, Privacy and Limitations sections. Publishing to
npm and GitHub happens only on the author's explicit go-ahead.
