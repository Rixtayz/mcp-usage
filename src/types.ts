export type Event =
  | { kind: "call"; sessionId: string; timestamp?: string; toolUseId: string; server: string; tool: string }
  | { kind: "result"; sessionId: string; toolUseId: string; isError: boolean; bytes: number }
  | { kind: "availability"; sessionId: string; timestamp?: string; added: string[] }
  | { kind: "health"; sessionId: string; timestamp?: string; failed: string[]; needsAuth: string[] }
  | { kind: "roster"; sessionId: string; canonicalIds: string[] };

export type ServerStatus = "used" | "unused" | "failed" | "needs-auth";

export interface ToolStats {
  tool: string;
  calls: number;
  errors: number;
  resultBytes: number;
}

export interface ServerStats {
  /** Mangled id as it appears in tool names — the grouping key. */
  server: string;
  /** Canonical id when known, else the mangled id. */
  label: string;
  toolsAvailable: number;
  sessionsAvailable: number;
  calls: number;
  sessionsUsed: number;
  toolsUsed: number;
  errors: number;
  errorRate: number;
  lastUsed?: string;
  resultBytes: number;
  estResultTokens: number;
  sessionsFailed: number;
  sessionsNeedsAuth: number;
  status: ServerStatus;
  tools: ToolStats[];
}

export type RecommendationAction =
  | "disconnect"
  | "fix-or-remove"
  | "authorize-or-remove"
  | "investigate-errors"
  | "heavy-results";

export interface Recommendation {
  server: string;
  label: string;
  action: RecommendationAction;
  reason: string;
}

export interface ScanStats {
  filesScanned: number;
  filesFailed: number;
  linesSkipped: number;
}

export interface Summary extends ScanStats {
  sinceDays: number;
  sessions: number;
  servers: number;
  used: number;
  unused: number;
  failed: number;
  needsAuth: number;
  calls: number;
}

export interface Report {
  summary: Summary;
  servers: ServerStats[];
  recommendations: Recommendation[];
}

export interface CollectOptions {
  /** Client config directory (for Claude Code: the folder containing `projects/`). */
  dir?: string;
  since?: Date;
  /** Substring of a project path; only matching projects are scanned. */
  project?: string;
}

export interface ClientAdapter {
  name: string;
  collect(opts: CollectOptions, sink: (e: Event) => void): Promise<ScanStats>;
}
