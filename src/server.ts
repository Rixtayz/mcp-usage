import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyze, DEFAULT_SINCE_DAYS } from "./analyze.js";
import { DEFAULT_MIN_SESSIONS } from "./recommend.js";
import type { ServerStats } from "./types.js";
import { VERSION } from "./version.js";

const PRIVACY =
  "Reads local Claude Code transcripts only. Returns server names, tool names, counts and timestamps - never conversation content.";

const sinceDays = z
  .number()
  .int()
  .min(1)
  .max(3650)
  .optional()
  .describe(`Look back this many days (default ${DEFAULT_SINCE_DAYS}).`);

const minSessions = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe(
    `Sessions a server must have been available in before it is flagged as unused (default ${DEFAULT_MIN_SESSIONS} for recommendations, 1 for unused_servers).`,
  );

const annotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

const ok = (data: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});

const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

type ToolResult = ReturnType<typeof ok> | ReturnType<typeof fail>;

/** Turns thrown errors (missing transcripts directory, …) into MCP tool errors. */
const guarded =
  <A>(handler: (args: A) => Promise<ToolResult>) =>
  async (args: A): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };

const compact = ({ tools: _tools, ...row }: ServerStats) => row;

export function createServer(defaults: { dir?: string } = {}): McpServer {
  const server = new McpServer({ name: "mcp-usage", version: VERSION });
  const { dir } = defaults;

  server.registerTool(
    "usage_summary",
    {
      title: "MCP usage summary",
      description: `Per-server usage of every MCP server seen in recent Claude Code sessions: status (used / unused / failed / needs-auth), tools available, sessions, calls, error rate, estimated result tokens, last use. ${PRIVACY}`,
      inputSchema: { since_days: sinceDays },
      annotations,
    },
    guarded(async ({ since_days }: { since_days?: number }) => {
      const report = await analyze({ dir, sinceDays: since_days });
      return ok({ summary: report.summary, servers: report.servers.map(compact) });
    }),
  );

  server.registerTool(
    "unused_servers",
    {
      title: "Unused MCP servers",
      description: `MCP servers that were connected but never called, failed to connect, or are waiting for authorization. ${PRIVACY}`,
      inputSchema: { since_days: sinceDays, min_sessions: minSessions },
      annotations,
    },
    guarded(async ({ since_days, min_sessions }: { since_days?: number; min_sessions?: number }) => {
      const report = await analyze({ dir, sinceDays: since_days });
      const threshold = min_sessions ?? 1;
      const servers = report.servers
        .filter((s) => s.status !== "used")
        .filter((s) => s.status !== "unused" || s.sessionsAvailable >= threshold)
        .map(compact);
      return ok({ summary: report.summary, servers });
    }),
  );

  server.registerTool(
    "server_details",
    {
      title: "MCP server details",
      description: `Full stats for one MCP server, including per-tool calls, errors and result size. ${PRIVACY}`,
      inputSchema: {
        server: z.string().min(1).describe("Server id or label as shown by usage_summary (case-insensitive)."),
        since_days: sinceDays,
      },
      annotations,
    },
    guarded(async ({ server: wanted, since_days }: { server: string; since_days?: number }) => {
      const report = await analyze({ dir, sinceDays: since_days });
      const needle = wanted.toLowerCase();
      const match = report.servers.find((s) => s.server.toLowerCase() === needle || s.label.toLowerCase() === needle);
      if (match) return ok({ ...match });
      const close = report.servers
        .filter((s) => s.server.toLowerCase().includes(needle) || s.label.toLowerCase().includes(needle))
        .map((s) => s.label);
      const hint = close.length > 0 ? ` Did you mean: ${close.join(", ")}?` : " Call usage_summary to list servers.";
      return fail(`No MCP server named "${wanted}" in this window.${hint}`);
    }),
  );

  server.registerTool(
    "recommendations",
    {
      title: "MCP cleanup recommendations",
      description: `Prioritized actions: disconnect unused servers, fix or remove failing ones, authorize or remove pending ones, investigate high error rates, watch heavy results. ${PRIVACY}`,
      inputSchema: { since_days: sinceDays, min_sessions: minSessions },
      annotations,
    },
    guarded(async ({ since_days, min_sessions }: { since_days?: number; min_sessions?: number }) => {
      const report = await analyze({ dir, sinceDays: since_days, minSessions: min_sessions });
      return ok({ summary: report.summary, recommendations: report.recommendations });
    }),
  );

  return server;
}
