import { isHostProvided } from "./names.js";
import type { Recommendation, RecommendationAction, ServerStats } from "./types.js";

export const DEFAULT_MIN_SESSIONS = 5;
const MIN_HEALTH_SESSIONS = 3;
const MIN_CALLS_FOR_ERROR_RATE = 5;
const ERROR_RATE_THRESHOLD = 0.3;
const HEAVY_TOKENS_PER_CALL = 10_000;

type Rule = (s: ServerStats, minSessions: number) => string | null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Rules in priority order; each returns a reason when it applies. */
const RULES: [RecommendationAction, Rule][] = [
  [
    "disconnect",
    (s, minSessions) =>
      s.status === "unused" && s.sessionsAvailable >= minSessions && !isHostProvided(s.server)
        ? `Available in ${plural(s.sessionsAvailable, "session")}, never called (${plural(s.toolsAvailable, "tool")} loaded each time).`
        : null,
  ],
  [
    "fix-or-remove",
    (s) =>
      s.status === "failed" && s.sessionsFailed >= MIN_HEALTH_SESSIONS
        ? `Failed to connect in ${plural(s.sessionsFailed, "session")}.`
        : null,
  ],
  [
    "authorize-or-remove",
    (s) =>
      s.status === "needs-auth" && s.sessionsNeedsAuth >= MIN_HEALTH_SESSIONS
        ? `Waiting for authorization in ${plural(s.sessionsNeedsAuth, "session")}.`
        : null,
  ],
  [
    "investigate-errors",
    (s) =>
      s.calls >= MIN_CALLS_FOR_ERROR_RATE && s.errorRate >= ERROR_RATE_THRESHOLD
        ? `${s.errors} of ${plural(s.calls, "call")} failed (${Math.round(s.errorRate * 100)}%).`
        : null,
  ],
  [
    "heavy-results",
    (s) => {
      if (s.calls === 0) return null;
      const perCall = Math.round(s.estResultTokens / s.calls);
      return perCall >= HEAVY_TOKENS_PER_CALL
        ? `Results average ~${perCall.toLocaleString("en-US")} tokens per call (estimate).`
        : null;
    },
  ],
];

export function recommend(stats: ServerStats[], opts: { minSessions?: number } = {}): Recommendation[] {
  const minSessions = opts.minSessions ?? DEFAULT_MIN_SESSIONS;
  const out: Recommendation[] = [];
  for (const [action, rule] of RULES) {
    for (const s of stats) {
      const reason = rule(s, minSessions);
      if (reason) out.push({ server: s.server, label: s.label, action, reason });
    }
  }
  return out;
}
