import { utimes } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import { ProjectsDirNotFoundError, slugify } from "../src/scan.js";
import {
  assistantCall,
  instructionsDelta,
  makeConfigDir,
  sidecar,
  toolsDelta,
  userPrompt,
  userResult,
  writeTranscript,
} from "./helpers.js";

async function sampleDir(): Promise<string> {
  const dir = await makeConfigDir();
  await writeTranscript(dir, {
    sessionId: "s1",
    lines: [
      sidecar(),
      userPrompt(),
      instructionsDelta({ names: ["claude.ai Context7"] }),
      toolsDelta({
        added: ["mcp__claude_ai_Context7__query-docs", "mcp__idle__x"],
        failed: ["plugin:data:definite"],
        needsAuth: ["plugin:productivity:linear"],
      }),
      assistantCall({ id: "toolu_1", name: "mcp__claude_ai_Context7__query-docs" }),
      userResult({ id: "toolu_1" }),
      '{ malformed "tool_use"',
    ],
  });
  await writeTranscript(dir, {
    sessionId: "s1",
    agentId: "abc",
    lines: [
      assistantCall({ id: "toolu_2", name: "mcp__claude_ai_Context7__query-docs" }),
      userResult({ id: "toolu_2", isError: true }),
    ],
  });
  return dir;
}

describe("analyze", () => {
  it("builds a report from session and subagent transcripts", async () => {
    const report = await analyze({ dir: await sampleDir() });
    expect(report.summary).toEqual({
      sinceDays: 30,
      sessions: 1,
      servers: 4,
      used: 1,
      unused: 1,
      failed: 1,
      needsAuth: 1,
      calls: 2,
      filesScanned: 2,
      filesFailed: 0,
      linesSkipped: 1,
    });
    expect(report.servers[0]).toMatchObject({
      server: "claude_ai_Context7",
      label: "claude.ai Context7",
      calls: 2,
      errors: 1,
      sessionsUsed: 1,
    });
    expect(report.recommendations).toEqual([]);
  });

  it("passes minSessions through to the recommendations", async () => {
    const report = await analyze({ dir: await sampleDir(), minSessions: 1 });
    expect(report.recommendations.map((r) => [r.server, r.action])).toEqual([["idle", "disconnect"]]);
  });

  it("never leaks transcript content", async () => {
    const report = await analyze({ dir: await sampleDir(), minSessions: 1 });
    expect(JSON.stringify(report)).not.toContain("SECRET");
  });

  it("skips files older than the window", async () => {
    const dir = await makeConfigDir();
    const file = await writeTranscript(dir, { lines: [toolsDelta({ added: ["mcp__srv__t"] })] });
    const old = new Date("2020-01-01T00:00:00Z");
    await utimes(file, old, old);
    const report = await analyze({ dir });
    expect(report.summary).toMatchObject({ filesScanned: 0, servers: 0 });
  });

  it("filters projects by path substring", async () => {
    const dir = await makeConfigDir();
    await writeTranscript(dir, { slug: "C--Users-me-alpha", lines: [toolsDelta({ added: ["mcp__a__t"] })] });
    await writeTranscript(dir, { slug: "c--Users-me-beta-app", lines: [toolsDelta({ added: ["mcp__b__t"] })] });
    const report = await analyze({ dir, project: "C:\\Users\\me\\Beta.app" });
    expect(report.servers.map((s) => s.server)).toEqual(["b"]);
  });

  it("throws a typed error when the projects directory is missing", async () => {
    await expect(analyze({ dir: "/definitely/not/here" })).rejects.toBeInstanceOf(ProjectsDirNotFoundError);
  });
});

describe("slugify", () => {
  it("mirrors Claude Code's project folder naming, case-insensitively", () => {
    expect(slugify("C:\\Users\\me\\my.app")).toBe("c--users-me-my-app");
    expect(slugify("/home/me/my.app")).toBe("-home-me-my-app");
  });
});
