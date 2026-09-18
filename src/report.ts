import type { Report, ServerStats } from "./types.js";

const HEADERS = ["SERVER", "STATUS", "TOOLS", "SESSIONS", "CALLS", "ERR%", "~TOKENS", "LAST USED"];
const RIGHT_ALIGNED = new Set([2, 3, 4, 5, 6]);

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

export function renderReport(report: Report): string {
  const { summary: s, servers, recommendations } = report;
  const lines = [
    `mcp-usage | last ${s.sinceDays} days | ${num(s.sessions)} sessions`,
    `${s.servers} servers: ${s.used} used, ${s.unused} unused, ${s.failed} failed, ${s.needsAuth} needs-auth | ${num(s.calls)} MCP calls`,
    "",
  ];
  if (servers.length === 0) {
    lines.push("No MCP servers seen in this window.");
  } else {
    lines.push(table([HEADERS, ...servers.map(row)]));
  }
  if (recommendations.length > 0) {
    lines.push("", "Recommendations:");
    for (const r of recommendations) lines.push(`  [${r.action}] ${r.label}: ${r.reason}`);
  }
  lines.push(
    "",
    `Scanned ${num(s.filesScanned)} files (${s.filesFailed} unreadable), skipped ${num(s.linesSkipped)} malformed lines.`,
    "SESSIONS = sessions where the server's tools were available. Token figures are estimates (result bytes / 4, images excluded).",
  );
  return lines.join("\n") + "\n";
}
