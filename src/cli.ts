import { parseArgs } from "node:util";
import { analyze, DEFAULT_SINCE_DAYS } from "./analyze.js";
import { DEFAULT_MIN_SESSIONS } from "./recommend.js";
import { renderReport } from "./report.js";
import { ProjectsDirNotFoundError } from "./scan.js";
import { VERSION } from "./version.js";

const HELP = `Usage: mcp-usage [options]

Find out which of your MCP servers you actually use, from local Claude Code transcripts.

Options:
  --since <days>         Look back this many days (default ${DEFAULT_SINCE_DAYS})
  --project <path>       Only scan projects whose path contains this text
  --min-sessions <n>     Sessions before an unused server is flagged (default ${DEFAULT_MIN_SESSIONS})
  --dir <path>           Claude config directory (default: $CLAUDE_CONFIG_DIR or ~/.claude)
  --json                 Print the full report as JSON
  --version, --help
`;

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

const defaultIo: Io = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
};

function positiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new TypeError(`${flag} expects a positive whole number, got "${value}"`);
  return n;
}

export async function run(argv: string[], io: Io = defaultIo): Promise<number> {
  let sinceDays: number | undefined;
  let minSessions: number | undefined;
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        since: { type: "string" },
        project: { type: "string" },
        "min-sessions": { type: "string" },
        dir: { type: "string" },
        json: { type: "boolean", default: false },
        version: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
    sinceDays = positiveInt(values.since, "--since");
    minSessions = positiveInt(values["min-sessions"], "--min-sessions");
  } catch (e) {
    io.err(`${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  if (values.help) {
    io.out(HELP);
    return 0;
  }
  if (values.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  try {
    const report = await analyze({ dir: values.dir, sinceDays, project: values.project, minSessions });
    io.out(values.json ? JSON.stringify(report, null, 2) + "\n" : renderReport(report));
    return 0;
  } catch (e) {
    if (e instanceof ProjectsDirNotFoundError) {
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
}
