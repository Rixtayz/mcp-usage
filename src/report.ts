import type { Recommendation, Report, ServerStats } from "./types.js";

const HEADERS = ["SERVER", "STATUS", "TOOLS", "SESSIONS", "CALLS", "ERR%", "~TOKENS", "LAST USED"];
const RIGHT_ALIGNED = new Set([2, 3, 4, 5, 6]);
/** Longer lists are truncated in text output; `--json` always has everything. */
const MAX_LISTED = 8;

const num = (n: number) => n.toLocaleString("en-US");

function row(s: ServerStats): string[] {
  return [
    s.label,
    s.status,
    num(s.toolsAvailable),
    num(s.sessionsAvailable),
    num(s.calls),
    s.calls === 0 ? "-" : `${Math.round(s.errorRate * 100)}%`,
    s.calls === 0 ? "-" : `~${num(s.estResultTokens)}`,
    s.lastUsed?.slice(0, 10) ?? "-",
  ];
}

function table(rows: string[][]): string {
  const widths = HEADERS.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? "").length)));
  return rows
    .map((r) =>
      r
        .map((cell, col) => (RIGHT_ALIGNED.has(col) ? cell.padStart(widths[col] ?? 0) : cell.padEnd(widths[col] ?? 0)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/** One line for servers that never exposed a tool, so they don't drown the table. */
function nameList(title: string, servers: ServerStats[]): string[] {
  if (servers.length === 0) return [];
  const shown = servers.slice(0, MAX_LISTED).map((s) => s.label);
  if (servers.length > MAX_LISTED) shown.push(`+${servers.length - MAX_LISTED} more`);
  return [`${title} (${servers.length}): ${shown.join(", ")}`];
}

function recommendationLines(recommendations: Recommendation[]): string[] {
  const groups = new Map<string, Recommendation[]>();
  for (const r of recommendations) groups.set(r.action, [...(groups.get(r.action) ?? []), r]);
  const lines: string[] = [];
  for (const [action, recs] of groups) {
    lines.push("", `${action} (${recs.length})`);
    for (const r of recs.slice(0, MAX_LISTED)) lines.push(`  ${r.label}: ${r.reason}`);
    if (recs.length > MAX_LISTED) {
      lines.push(`  +${recs.length - MAX_LISTED} more (run with --json for the full list)`);
    }
  }
  return lines;
}

export function renderReport(report: Report): string {
  const { summary: s, servers, recommendations } = report;
  const lines = [
    `mcp-usage | last ${s.sinceDays} days | ${num(s.sessions)} sessions`,
    `${s.servers} servers: ${s.used} used, ${s.unused} unused, ${s.failed} failed, ${s.needsAuth} needs-auth | ${num(s.calls)} MCP calls`,
    "",
  ];
  const loaded = servers.filter((x) => x.calls > 0 || x.toolsAvailable > 0);
  const never = servers.filter((x) => x.calls === 0 && x.toolsAvailable === 0);
  if (servers.length === 0) lines.push("No MCP servers seen in this window.");
  if (loaded.length > 0) lines.push(table([HEADERS, ...loaded.map(row)]));
  const lists = [
    ...nameList("Failed to connect", never.filter((x) => x.status === "failed")),
    ...nameList("Waiting for authorization", never.filter((x) => x.status === "needs-auth")),
  ];
  if (lists.length > 0) lines.push("", ...lists);
  if (recommendations.length > 0) lines.push("", "Recommendations", ...recommendationLines(recommendations));
  lines.push(
    "",
    `Scanned ${num(s.filesScanned)} files (${s.filesFailed} unreadable), skipped ${num(s.linesSkipped)} malformed lines.`,
    "SESSIONS = sessions where the server's tools were available. Token figures are estimates (result bytes / 4, images excluded).",
  );
  return lines.join("\n") + "\n";
}
