import { describe, expect, it } from "vitest";
import { recommend } from "../src/recommend.js";
import type { ServerStats } from "../src/types.js";

const base: ServerStats = {
  server: "srv",
  label: "srv",
  toolsAvailable: 3,
  sessionsAvailable: 10,
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
};
const s = (over: Partial<ServerStats>): ServerStats => ({ ...base, ...over });

describe("recommend", () => {
  it("suggests disconnecting servers unused across enough sessions", () => {
    const recs = recommend([s({ server: "idle", label: "Idle", sessionsAvailable: 5 })]);
    expect(recs).toEqual([
      {
        server: "idle",
        label: "Idle",
        action: "disconnect",
        reason: "Available in 5 sessions, never called (3 tools loaded each time).",
      },
    ]);
  });

  it("stays quiet about unused servers below the session threshold", () => {
    expect(recommend([s({ sessionsAvailable: 4 })])).toEqual([]);
    expect(recommend([s({ sessionsAvailable: 4 })], { minSessions: 2 })).toHaveLength(1);
  });

  it("never suggests disconnecting servers bundled with the host app", () => {
    expect(recommend([s({ server: "ccd_session_mgmt", sessionsAvailable: 50 })])).toEqual([]);
  });

  it("flags persistent failures and pending auth", () => {
    const recs = recommend([
      s({ server: "f", status: "failed", sessionsFailed: 3, sessionsAvailable: 0 }),
      s({ server: "f2", status: "failed", sessionsFailed: 2, sessionsAvailable: 0 }),
      s({ server: "n", status: "needs-auth", sessionsNeedsAuth: 3, sessionsAvailable: 0 }),
    ]);
    expect(recs.map((r) => [r.server, r.action])).toEqual([
      ["f", "fix-or-remove"],
      ["n", "authorize-or-remove"],
    ]);
  });

  it("flags high error rates only with enough calls", () => {
    const recs = recommend([
      s({ server: "bad", status: "used", calls: 10, errors: 3, errorRate: 0.3 }),
      s({ server: "few", status: "used", calls: 4, errors: 4, errorRate: 1 }),
    ]);
    expect(recs).toEqual([
      {
        server: "bad",
        label: "srv",
        action: "investigate-errors",
        reason: "3 of 10 calls failed (30%).",
      },
    ]);
  });

  it("flags heavy average results", () => {
    const recs = recommend([
      s({ server: "heavy", status: "used", calls: 2, estResultTokens: 20_000 }),
      s({ server: "light", status: "used", calls: 2, estResultTokens: 19_998 }),
    ]);
    expect(recs).toEqual([
      {
        server: "heavy",
        label: "srv",
        action: "heavy-results",
        reason: "Results average ~10,000 tokens per call (estimate).",
      },
    ]);
  });

  it("orders recommendations by rule priority", () => {
    const recs = recommend([
      s({ server: "heavy", status: "used", calls: 1, estResultTokens: 50_000 }),
      s({ server: "auth", status: "needs-auth", sessionsNeedsAuth: 9, sessionsAvailable: 0 }),
      s({ server: "idle" }),
    ]);
    expect(recs.map((r) => r.action)).toEqual(["disconnect", "authorize-or-remove", "heavy-results"]);
  });
});
