import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import {
  assistantCall,
  instructionsDelta,
  makeConfigDir,
  toolsDelta,
  userResult,
  writeTranscript,
} from "./helpers.js";

let client: Client;

async function connect(dir: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer({ dir }).connect(serverTransport);
  const c = new Client({ name: "test", version: "0.0.0" });
  await c.connect(clientTransport);
  return c;
}

async function call(name: string, args: Record<string, unknown> = {}, c: Client = client) {
  const res = await c.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
  return { res, text, data: res.structuredContent as Record<string, any> | undefined };
}

beforeAll(async () => {
  const dir = await makeConfigDir();
  await writeTranscript(dir, {
    lines: [
      instructionsDelta({ names: ["claude.ai Context7"] }),
      toolsDelta({
        added: ["mcp__claude_ai_Context7__query-docs", "mcp__idle__x"],
        needsAuth: ["plugin:productivity:linear"],
      }),
      assistantCall({ id: "toolu_1", name: "mcp__claude_ai_Context7__query-docs" }),
      userResult({ id: "toolu_1" }),
    ],
  });
  client = await connect(dir);
});

describe("MCP server", () => {
  it("lists four read-only tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "recommendations",
      "server_details",
      "unused_servers",
      "usage_summary",
    ]);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("usage_summary returns compact rows without per-tool detail", async () => {
    const { data, text } = await call("usage_summary");
    expect(data?.summary).toMatchObject({ servers: 3, used: 1, unused: 1, needsAuth: 1, calls: 1 });
    expect(data?.servers[0]).toMatchObject({ label: "claude.ai Context7", status: "used", calls: 1 });
    expect(data?.servers[0]).not.toHaveProperty("tools");
    expect(JSON.parse(text)).toEqual(data);
  });

  it("unused_servers returns everything that is not used", async () => {
    const { data } = await call("unused_servers");
    expect(data?.servers.map((s: any) => [s.server, s.status])).toEqual([
      ["idle", "unused"],
      ["plugin_productivity_linear", "needs-auth"],
    ]);
  });

  it("unused_servers honors min_sessions", async () => {
    const { data } = await call("unused_servers", { min_sessions: 2 });
    expect(data?.servers.map((s: any) => s.server)).toEqual(["plugin_productivity_linear"]);
  });

  it("server_details accepts an id or a label, case-insensitively", async () => {
    for (const server of ["claude_ai_Context7", "CLAUDE.AI context7"]) {
      const { data } = await call("server_details", { server });
      expect(data?.tools).toEqual([{ tool: "query-docs", calls: 1, errors: 0, resultBytes: 13 }]);
    }
  });

  it("server_details reports unknown servers with close matches", async () => {
    const { res, text } = await call("server_details", { server: "context" });
    expect(res.isError).toBe(true);
    expect(text).toContain("claude.ai Context7");
  });

  it("recommendations honors min_sessions", async () => {
    expect((await call("recommendations")).data?.recommendations).toEqual([]);
    const { data } = await call("recommendations", { min_sessions: 1 });
    expect(data?.recommendations.map((r: any) => [r.server, r.action])).toEqual([["idle", "disconnect"]]);
  });

  it("never leaks transcript content", async () => {
    for (const name of ["usage_summary", "unused_servers", "recommendations"]) {
      expect((await call(name, { min_sessions: 1 })).text).not.toContain("SECRET");
    }
  });

  it("returns a tool error when the transcripts directory is missing", async () => {
    const c = await connect("/definitely/not/here");
    const { res, text } = await call("usage_summary", {}, c);
    expect(res.isError).toBe(true);
    expect(text).toContain("does not exist");
  });
});
