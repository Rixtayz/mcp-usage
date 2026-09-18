import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { assistantCall, makeConfigDir, toolsDelta, userResult, writeTranscript } from "./helpers.js";

async function exec(argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, { out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

async function sampleDir(): Promise<string> {
  const dir = await makeConfigDir();
  await writeTranscript(dir, {
    lines: [
      toolsDelta({ added: ["mcp__busy__search", "mcp__idle__x"], failed: ["plugin:data:definite"] }),
      assistantCall({ id: "toolu_1", name: "mcp__busy__search", timestamp: "2026-09-10T08:00:00.000Z" }),
      userResult({ id: "toolu_1", content: "x".repeat(4000) }),
    ],
  });
  return dir;
}

describe("cli", () => {
  it("prints a table, recommendations and an honest footer", async () => {
    const { code, out } = await exec(["--dir", await sampleDir(), "--since", "3650", "--min-sessions", "1"]);
    expect(code).toBe(0);
    expect(out).toContain("3 servers: 1 used, 1 unused, 1 failed, 0 needs-auth");
    expect(out).toMatch(/busy\s+used\s+1\s+1\s+1\s+0%\s+~1,000\s+2026-09-10/);
    expect(out).toMatch(/plugin:data:definite\s+failed/);
    expect(out).toContain("disconnect");
    expect(out).toContain("estimates");
    expect(out).not.toContain("SECRET");
  });

  it("prints the full report as JSON with --json", async () => {
    const { code, out } = await exec(["--dir", await sampleDir(), "--since", "3650", "--json"]);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report.summary).toMatchObject({ servers: 3, calls: 1, sinceDays: 3650 });
    expect(report.servers[0].tools).toEqual([{ tool: "search", calls: 1, errors: 0, resultBytes: 4000 }]);
  });

  it("says so when nothing was found", async () => {
    const { code, out } = await exec(["--dir", await makeConfigDir()]);
    expect(code).toBe(0);
    expect(out).toContain("No MCP servers seen");
  });

  it("fails cleanly when the directory is missing", async () => {
    const { code, err } = await exec(["--dir", "/definitely/not/here"]);
    expect(code).toBe(1);
    expect(err).toContain("does not exist");
  });

  it("rejects bad arguments", async () => {
    expect((await exec(["--since", "soon"])).code).toBe(2);
    expect((await exec(["--nope"])).code).toBe(2);
  });

  it("prints help and version", async () => {
    expect((await exec(["--help"])).out).toContain("Usage: mcp-usage");
    expect((await exec(["--version"])).out).toMatch(/^\d+\.\d+\.\d+\n$/);
  });
});
