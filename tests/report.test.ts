import { describe, expect, it } from "vitest";
import { renderReport } from "../src/report.js";
import type { Recommendation, Report, ServerStats } from "../src/types.js";

const server = (over: Partial<ServerStats>): ServerStats => ({
  server: "srv",
  label: "srv",
  toolsAvailable: 0,
  sessionsAvailable: 0,
  calls: 0,
  sessionsUsed: 0,
  toolsUsed: 0,
  errors: 0,
  errorRate: 0,
  resultBytes: 0,
  estResultTokens: 0,
  sessionsFailed: 0,
  sessionsNeedsAuth: 0,
  status: "unused",
  tools: [],
  ...over,
});

const report = (servers: ServerStats[], recommendations: Recommendation[] = []): Report => ({
  summary: {
    sinceDays: 30,
    sessions: 2,
    servers: servers.length,
    used: 0,
    unused: 0,
    failed: 0,
    needsAuth: 0,
    calls: 0,
    filesScanned: 1,
    filesFailed: 0,
    linesSkipped: 0,
  },
  servers,
  recommendations,
});

describe("renderReport", () => {
  it("keeps servers that never exposed a tool out of the table and lists them by status", () => {
    const out = renderReport(
      report([
        server({ label: "Loaded", toolsAvailable: 4, sessionsAvailable: 2 }),
        server({ label: "plugin:a:broken", status: "failed", sessionsFailed: 2 }),
        ...Array.from({ length: 12 }, (_, i) =>
          server({ label: `pending-${i + 1}`, status: "needs-auth", sessionsNeedsAuth: 1 }),
        ),
      ]),
    );
    expect(out).toMatch(/Loaded\s+unused\s+4\s+2\s+0/);
    expect(out).not.toMatch(/pending-1\s+needs-auth/);
    expect(out).toContain("Failed to connect (1): plugin:a:broken");
    expect(out).toContain(
      "Waiting for authorization (12): pending-1, pending-2, pending-3, pending-4, pending-5, pending-6, pending-7, pending-8, +4 more",
    );
  });

  it("groups recommendations by action and truncates long groups", () => {
    const recs: Recommendation[] = Array.from({ length: 10 }, (_, i) => ({
      server: `s${i}`,
      label: `Server ${i}`,
      action: "disconnect",
      reason: `reason ${i}`,
    }));
    recs.push({ server: "x", label: "X", action: "investigate-errors", reason: "3 of 10 calls failed (30%)." });
    const out = renderReport(report([server({ toolsAvailable: 1 })], recs));
    expect(out).toContain("disconnect (10)");
    expect(out).toContain("  Server 7: reason 7");
    expect(out).not.toContain("Server 8: reason 8");
    expect(out).toContain("  +2 more (run with --json for the full list)");
    expect(out).toContain("investigate-errors (1)");
    expect(out).toContain("  X: 3 of 10 calls failed (30%).");
  });
});
