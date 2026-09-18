import { describe, expect, it } from "vitest";
import { parseFile, parseLine, type ParseContext } from "../src/parser.js";
import type { Event } from "../src/types.js";
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

const ctx = (): ParseContext => ({ fallbackSessionId: "fallback", pendingCalls: new Set() });
const TS = "2026-09-01T10:00:00.000Z";

describe("parseLine", () => {
  it("emits a call event for an MCP tool_use block", () => {
    const events = parseLine(
      assistantCall({ id: "toolu_1", name: "mcp__claude_ai_Context7__query-docs", timestamp: TS }),
      ctx(),
    );
    expect(events).toEqual([
      {
        kind: "call",
        sessionId: "s1",
        timestamp: TS,
        toolUseId: "toolu_1",
        server: "claude_ai_Context7",
        tool: "query-docs",
      },
    ]);
  });

  it("ignores non-MCP tool_use blocks", () => {
    expect(parseLine(assistantCall({ id: "toolu_1", name: "Bash" }), ctx())).toEqual([]);
  });

  it("emits a result only for a pending MCP call", () => {
    const c = ctx();
    parseLine(assistantCall({ id: "toolu_1", name: "mcp__srv__tool" }), c);
    expect(parseLine(userResult({ id: "toolu_other" }), c)).toEqual([]);
    expect(parseLine(userResult({ id: "toolu_1", content: "héllo" }), c)).toEqual([
      { kind: "result", sessionId: "s1", toolUseId: "toolu_1", isError: false, bytes: 6 },
    ]);
  });

  it("treats a missing is_error as success and true as an error", () => {
    const c = ctx();
    parseLine(assistantCall({ id: "a", name: "mcp__srv__tool" }), c);
    parseLine(assistantCall({ id: "b", name: "mcp__srv__tool" }), c);
    const ok = parseLine(userResult({ id: "a" }), c);
    const bad = parseLine(userResult({ id: "b", isError: true }), c);
    expect(ok?.[0]).toMatchObject({ isError: false });
    expect(bad?.[0]).toMatchObject({ isError: true });
  });

  it("counts only text blocks when content is a block array", () => {
    const c = ctx();
    parseLine(assistantCall({ id: "a", name: "mcp__srv__tool" }), c);
    const events = parseLine(
      userResult({
        id: "a",
        content: [
          { type: "text", text: "12345" },
          { type: "image", source: { type: "base64", data: "AAAAAAAAAAAA" } },
          { type: "text", text: "678" },
        ],
      }),
      c,
    );
    expect(events?.[0]).toMatchObject({ bytes: 8 });
  });

  it("emits availability and health from deferred_tools_delta", () => {
    const events = parseLine(
      toolsDelta({
        added: ["mcp__srv__a", "mcp__srv__b"],
        failed: ["plugin:data:definite"],
        needsAuth: ["plugin:productivity:linear"],
        timestamp: TS,
      }),
      ctx(),
    );
    expect(events).toEqual([
      { kind: "availability", sessionId: "s1", timestamp: TS, added: ["mcp__srv__a", "mcp__srv__b"] },
      {
        kind: "health",
        sessionId: "s1",
        timestamp: TS,
        failed: ["plugin:data:definite"],
        needsAuth: ["plugin:productivity:linear"],
      },
    ]);
  });

  it("emits no health event when nothing failed or needs auth", () => {
    const events = parseLine(toolsDelta({ added: ["mcp__srv__a"] }), ctx());
    expect(events?.map((e) => e.kind)).toEqual(["availability"]);
  });

  it("emits a roster event from mcp_instructions_delta", () => {
    const events = parseLine(instructionsDelta({ names: ["claude.ai Context7"] }), ctx());
    expect(events).toEqual([{ kind: "roster", sessionId: "s1", canonicalIds: ["claude.ai Context7"] }]);
  });

  it("ignores prompts that merely mention mcp__ and sidecar records", () => {
    expect(parseLine(userPrompt(), ctx())).toEqual([]);
    expect(parseLine(sidecar(), ctx())).toEqual([]);
  });

  it("falls back to the file-derived session id", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "x", name: "mcp__srv__tool" }] },
    });
    expect(parseLine(line, ctx())?.[0]).toMatchObject({ sessionId: "fallback" });
  });

  it("returns null for malformed JSON that looks relevant", () => {
    expect(parseLine('{"type":"assistant","tool_use" oops', ctx())).toBeNull();
  });

  it("survives records with missing or wrongly typed fields", () => {
    const lines = [
      '{"type":"assistant"}',
      '{"type":"assistant","message":{"content":"tool_use"}}',
      '{"type":"assistant","message":{"content":[null,5,{"type":"tool_use"}]}}',
      '{"type":"attachment","attachment":{"type":"deferred_tools_delta","addedNames":"nope"}}',
      '"tool_use"',
    ];
    for (const line of lines) expect(parseLine(line, ctx())).toEqual([]);
  });
});

describe("parseFile", () => {
  it("streams a transcript, including a very long line, and counts malformed lines", async () => {
    const dir = await makeConfigDir();
    const big = "x".repeat(3_000_000);
    const file = await writeTranscript(dir, {
      lines: [
        sidecar(),
        toolsDelta({ added: ["mcp__srv__tool"] }),
        assistantCall({ id: "toolu_1", name: "mcp__srv__tool" }),
        userResult({ id: "toolu_1", content: big }),
        '{"type":"user","tool_result" broken',
      ],
    });
    const events: Event[] = [];
    const stats = await parseFile(file, (e) => events.push(e));
    expect(events.map((e) => e.kind)).toEqual(["availability", "call", "result"]);
    expect(events[2]).toMatchObject({ bytes: 3_000_000 });
    expect(stats.linesSkipped).toBe(1);
  });
});
