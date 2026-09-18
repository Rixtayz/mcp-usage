import { displayLabel, mangleServerId, parseToolName } from "./names.js";
import type { Event, ServerStats, ServerStatus, ToolStats } from "./types.js";

const BYTES_PER_TOKEN = 4;

interface ServerAcc {
  toolsAvailable: Set<string>;
  sessionsAvailable: Set<string>;
  sessionsUsed: Set<string>;
  sessionsFailed: Set<string>;
  sessionsNeedsAuth: Set<string>;
  tools: Map<string, ToolStats>;
  lastUsed?: string;
}

export class Aggregator {
  private readonly servers = new Map<string, ServerAcc>();
  private readonly labels = new Map<string, string>();
  private readonly callIndex = new Map<string, ToolStats>();
  private readonly sessions = new Set<string>();
  private readonly sinceMs: number;

  constructor(opts: { since?: Date } = {}) {
    this.sinceMs = opts.since?.getTime() ?? Number.NEGATIVE_INFINITY;
  }

  add(e: Event): void {
    if (e.kind === "roster") {
      for (const id of e.canonicalIds) this.labels.set(mangleServerId(id), id);
      return;
    }
    if (e.kind === "result") {
      const tool = this.callIndex.get(e.toolUseId);
      if (!tool) return;
      this.callIndex.delete(e.toolUseId);
      tool.resultBytes += e.bytes;
      if (e.isError) tool.errors++;
      return;
    }
    if (e.timestamp !== undefined && Date.parse(e.timestamp) < this.sinceMs) return;
    this.sessions.add(e.sessionId);

    if (e.kind === "call") {
      const acc = this.server(e.server);
      acc.sessionsUsed.add(e.sessionId);
      if (e.timestamp !== undefined && (acc.lastUsed === undefined || e.timestamp > acc.lastUsed)) {
        acc.lastUsed = e.timestamp;
      }
      let tool = acc.tools.get(e.tool);
      if (!tool) {
        tool = { tool: e.tool, calls: 0, errors: 0, resultBytes: 0 };
        acc.tools.set(e.tool, tool);
      }
      tool.calls++;
      this.callIndex.set(e.toolUseId, tool);
    } else if (e.kind === "availability") {
      for (const name of e.added) {
        const parsed = parseToolName(name);
        if (!parsed) continue;
        const acc = this.server(parsed.server);
        acc.toolsAvailable.add(parsed.tool);
        acc.sessionsAvailable.add(e.sessionId);
      }
    } else {
      for (const id of e.failed) this.canonical(id).sessionsFailed.add(e.sessionId);
      for (const id of e.needsAuth) this.canonical(id).sessionsNeedsAuth.add(e.sessionId);
    }
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  serverStats(): ServerStats[] {
    const out: ServerStats[] = [];
    for (const [server, acc] of this.servers) {
      const tools = [...acc.tools.values()].sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
      const calls = tools.reduce((n, t) => n + t.calls, 0);
      const errors = tools.reduce((n, t) => n + t.errors, 0);
      const resultBytes = tools.reduce((n, t) => n + t.resultBytes, 0);
      out.push({
        server,
        label: this.labels.get(server) ?? displayLabel(server),
        toolsAvailable: acc.toolsAvailable.size,
        sessionsAvailable: acc.sessionsAvailable.size,
        calls,
        sessionsUsed: acc.sessionsUsed.size,
        toolsUsed: tools.length,
        errors,
        errorRate: calls === 0 ? 0 : errors / calls,
        lastUsed: acc.lastUsed,
        resultBytes,
        estResultTokens: Math.round(resultBytes / BYTES_PER_TOKEN),
        sessionsFailed: acc.sessionsFailed.size,
        sessionsNeedsAuth: acc.sessionsNeedsAuth.size,
        status: statusOf(calls, acc),
        tools,
      });
    }
    // Busiest first; among idle servers, the ones loaded most often and most heavily first.
    return out.sort(
      (a, b) =>
        b.calls - a.calls ||
        b.sessionsAvailable - a.sessionsAvailable ||
        b.toolsAvailable - a.toolsAvailable ||
        a.label.localeCompare(b.label),
    );
  }

  private server(id: string): ServerAcc {
    let acc = this.servers.get(id);
    if (!acc) {
      acc = {
        toolsAvailable: new Set(),
        sessionsAvailable: new Set(),
        sessionsUsed: new Set(),
        sessionsFailed: new Set(),
        sessionsNeedsAuth: new Set(),
        tools: new Map(),
      };
      this.servers.set(id, acc);
    }
    return acc;
  }

  /** Health lists use canonical ids; key them like tool names so they merge. */
  private canonical(id: string): ServerAcc {
    const mangled = mangleServerId(id);
    if (!this.labels.has(mangled)) this.labels.set(mangled, id);
    return this.server(mangled);
  }
}

function statusOf(calls: number, acc: ServerAcc): ServerStatus {
  if (calls > 0) return "used";
  if (acc.toolsAvailable.size === 0) {
    if (acc.sessionsFailed.size > 0) return "failed";
    if (acc.sessionsNeedsAuth.size > 0) return "needs-auth";
  }
  return "unused";
}
