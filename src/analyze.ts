import { claudeCodeAdapter } from "./adapters/claude-code.js";
import { Aggregator } from "./aggregate.js";
import { recommend } from "./recommend.js";
import type { ClientAdapter, Report, ServerStatus } from "./types.js";

export const DEFAULT_SINCE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface AnalyzeOptions {
  /** Claude config directory (contains `projects/`). Defaults to `CLAUDE_CONFIG_DIR` or `~/.claude`. */
  dir?: string;
  sinceDays?: number;
  project?: string;
  minSessions?: number;
  now?: Date;
}

export async function analyze(
  opts: AnalyzeOptions = {},
  adapter: ClientAdapter = claudeCodeAdapter,
): Promise<Report> {
  const sinceDays = opts.sinceDays ?? DEFAULT_SINCE_DAYS;
  const since = new Date((opts.now ?? new Date()).getTime() - sinceDays * MS_PER_DAY);
  const aggregator = new Aggregator({ since });
  const scan = await adapter.collect({ dir: opts.dir, since, project: opts.project }, (e) => aggregator.add(e));
  const servers = aggregator.serverStats();
  const count = (status: ServerStatus) => servers.filter((s) => s.status === status).length;
  return {
    summary: {
      sinceDays,
      sessions: aggregator.sessionCount(),
      servers: servers.length,
      used: count("used"),
      unused: count("unused"),
      failed: count("failed"),
      needsAuth: count("needs-auth"),
      calls: servers.reduce((n, s) => n + s.calls, 0),
      ...scan,
    },
    servers,
    recommendations: recommend(servers, { minSessions: opts.minSessions }),
  };
}
