import { describe, expect, it } from "vitest";
import { Aggregator } from "../src/aggregate.js";
import type { Event } from "../src/types.js";

const T1 = "2026-09-01T10:00:00.000Z";
const T2 = "2026-09-05T10:00:00.000Z";

function run(events: Event[], since?: Date) {
  const agg = new Aggregator({ since });
  for (const e of events) agg.add(e);
  return agg;
}

const call = (toolUseId: string, server: string, tool: string, sessionId = "s1", timestamp = T1): Event => ({
  kind: "call",
  sessionId,
  timestamp,
  toolUseId,
  server,
  tool,
});

describe("Aggregator", () => {
  it("computes usage, errors, result weight and last use per server", () => {
    const agg = run([
      { kind: "availability", sessionId: "s1", timestamp: T1, added: ["mcp__srv__a", "mcp__srv__b", "mcp__idle__x"] },
      { kind: "availability", sessionId: "s2", timestamp: T2, added: ["mcp__srv__a", "mcp__idle__x"] },
      call("1", "srv", "a", "s1", T1),
      { kind: "result", sessionId: "s1", toolUseId: "1", isError: false, bytes: 400 },
      call("2", "srv", "a", "s2", T2),
      { kind: "result", sessionId: "s2", toolUseId: "2", isError: true, bytes: 40 },
      call("3", "srv", "b", "s2", T2),
    ]);
    const [srv, idle] = agg.serverStats();
    expect(srv).toEqual({
      server: "srv",
      label: "srv",
      toolsAvailable: 2,
      sessionsAvailable: 2,
      calls: 3,
      sessionsUsed: 2,
      toolsUsed: 2,
      errors: 1,
      errorRate: 1 / 3,
      lastUsed: T2,
      resultBytes: 440,
      estResultTokens: 110,
      sessionsFailed: 0,
      sessionsNeedsAuth: 0,
      status: "used",
      tools: [
        { tool: "a", calls: 2, errors: 1, resultBytes: 440 },
        { tool: "b", calls: 1, errors: 0, resultBytes: 0 },
      ],
    });
    expect(idle).toMatchObject({ server: "idle", status: "unused", calls: 0, sessionsAvailable: 2, errorRate: 0 });
    expect(idle?.lastUsed).toBeUndefined();
    expect(agg.sessionCount()).toBe(2);
  });

  it("sorts by calls descending, then label", () => {
    const agg = run([
      { kind: "availability", sessionId: "s1", added: ["mcp__zeta__t", "mcp__alpha__t", "mcp__busy__t"] },
      call("1", "busy", "t"),
    ]);
    expect(agg.serverStats().map((s) => s.server)).toEqual(["busy", "alpha", "zeta"]);
  });

  it("keys failed and needs-auth servers by their mangled id and labels them canonically", () => {
    const agg = run([
      { kind: "health", sessionId: "s1", failed: ["plugin:data:definite"], needsAuth: ["plugin:productivity:linear"] },
      { kind: "health", sessionId: "s2", failed: ["plugin:data:definite"], needsAuth: [] },
    ]);
    const stats = agg.serverStats();
    expect(stats.find((s) => s.server === "plugin_data_definite")).toMatchObject({
      label: "plugin:data:definite",
      status: "failed",
      sessionsFailed: 2,
    });
    expect(stats.find((s) => s.server === "plugin_productivity_linear")).toMatchObject({
      label: "plugin:productivity:linear",
      status: "needs-auth",
      sessionsNeedsAuth: 1,
    });
  });

  it("prefers used, then unused, over failed when tools were available", () => {
    const agg = run([
      { kind: "availability", sessionId: "s1", added: ["mcp__flaky__t", "mcp__flaky2__t"] },
      { kind: "health", sessionId: "s2", failed: ["flaky", "flaky2"], needsAuth: [] },
      call("1", "flaky", "t"),
    ]);
    const stats = agg.serverStats();
    expect(stats.find((s) => s.server === "flaky")?.status).toBe("used");
    expect(stats.find((s) => s.server === "flaky2")?.status).toBe("unused");
  });

  it("applies roster labels to servers seen through tool names", () => {
    const agg = run([
      { kind: "roster", sessionId: "s1", canonicalIds: ["claude.ai Context7"] },
      { kind: "availability", sessionId: "s1", added: ["mcp__claude_ai_Context7__query-docs"] },
    ]);
    expect(agg.serverStats()[0]).toMatchObject({ server: "claude_ai_Context7", label: "claude.ai Context7" });
  });

  it("guesses a readable label when no canonical id was recorded", () => {
    const agg = run([{ kind: "availability", sessionId: "s1", added: ["mcp__claude_ai_Google_Drive__list"] }]);
    expect(agg.serverStats()[0]).toMatchObject({ server: "claude_ai_Google_Drive", label: "claude.ai Google Drive" });
  });

  it("ranks idle servers by how often, then how heavily, they were loaded", () => {
    const agg = run([
      { kind: "availability", sessionId: "s1", added: ["mcp__rare__t", "mcp__often__t", "mcp__big__a", "mcp__big__b"] },
      { kind: "availability", sessionId: "s2", added: ["mcp__often__t", "mcp__big__a"] },
      { kind: "health", sessionId: "s1", failed: [], needsAuth: ["pending"] },
    ]);
    expect(agg.serverStats().map((s) => s.server)).toEqual(["big", "often", "rare", "pending"]);
  });

  it("does not create servers from roster events alone", () => {
    expect(run([{ kind: "roster", sessionId: "s1", canonicalIds: ["ghost"] }]).serverStats()).toEqual([]);
  });

  it("drops timestamped events older than `since` and their results", () => {
    const agg = run(
      [
        { kind: "availability", sessionId: "old", timestamp: T1, added: ["mcp__srv__a"] },
        call("1", "srv", "a", "old", T1),
        { kind: "result", sessionId: "old", toolUseId: "1", isError: true, bytes: 100 },
        { kind: "availability", sessionId: "new", timestamp: T2, added: ["mcp__srv__a"] },
        call("2", "srv", "a", "new", T2),
      ],
      new Date("2026-09-03T00:00:00.000Z"),
    );
    expect(agg.serverStats()[0]).toMatchObject({ calls: 1, errors: 0, resultBytes: 0, sessionsAvailable: 1 });
    expect(agg.sessionCount()).toBe(1);
  });

  it("ignores results with no matching call", () => {
    const agg = run([{ kind: "result", sessionId: "s1", toolUseId: "nope", isError: true, bytes: 9 }]);
    expect(agg.serverStats()).toEqual([]);
  });
});
