import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every builder embeds a SECRET_* string where real transcripts hold private
// content; privacy tests assert none of them ever reach the output.

let counter = 0;
const uid = () => `uuid-${++counter}`;

interface Base {
  sessionId?: string;
  timestamp?: string;
}

const envelope = (type: string, o: Base) => ({
  type,
  uuid: uid(),
  parentUuid: null,
  sessionId: o.sessionId ?? "s1",
  timestamp: o.timestamp ?? new Date().toISOString(),
  cwd: "C:\\SECRET_CWD",
  version: "2.1.274",
  isSidechain: false,
});

export function assistantCall(o: Base & { id: string; name: string }): string {
  return JSON.stringify({
    ...envelope("assistant", o),
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "SECRET_ASSISTANT_TEXT" },
        { type: "tool_use", id: o.id, name: o.name, input: { q: "SECRET_INPUT" }, caller: { type: "direct" } },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  });
}

export function userResult(o: Base & { id: string; content?: unknown; isError?: boolean }): string {
  const block: Record<string, unknown> = {
    type: "tool_result",
    tool_use_id: o.id,
    content: o.content ?? "SECRET_OUTPUT",
  };
  if (o.isError !== undefined) block.is_error = o.isError;
  return JSON.stringify({
    ...envelope("user", o),
    message: { role: "user", content: [block] },
    toolUseResult: "SECRET_TOOL_USE_RESULT",
  });
}

export function userPrompt(o: Base = {}): string {
  return JSON.stringify({
    ...envelope("user", o),
    message: { role: "user", content: "SECRET_PROMPT mentioning mcp__fake__tool" },
  });
}

export function toolsDelta(
  o: Base & { added?: string[]; failed?: string[]; needsAuth?: string[] },
): string {
  return JSON.stringify({
    ...envelope("attachment", o),
    attachment: {
      type: "deferred_tools_delta",
      addedNames: o.added ?? [],
      addedLines: (o.added ?? []).map((n) => `${n} SECRET_LINE`),
      removedNames: [],
      pendingMcpServers: [],
      needsAuthMcpServers: o.needsAuth ?? [],
      failedMcpServers: (o.failed ?? []).map((name) => ({
        name,
        errorCode: "CONNECT_TIMEOUT",
        error: "SECRET_ERROR",
      })),
    },
  });
}

export function instructionsDelta(o: Base & { names: string[] }): string {
  return JSON.stringify({
    ...envelope("attachment", o),
    attachment: {
      type: "mcp_instructions_delta",
      addedNames: o.names,
      addedBlocks: o.names.map(() => "SECRET_INSTRUCTIONS"),
      removedNames: [],
    },
  });
}

export function sidecar(): string {
  return JSON.stringify({ type: "ai-title", aiTitle: "SECRET_TITLE", sessionId: "s1" });
}

/** Creates an empty fake Claude config dir (containing `projects/`). */
export async function makeConfigDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-usage-test-"));
  await mkdir(join(dir, "projects"), { recursive: true });
  return dir;
}

/** Writes a transcript; pass `agentId` to write it as a subagent transcript. */
export async function writeTranscript(
  configDir: string,
  o: { slug?: string; sessionId?: string; agentId?: string; lines: string[] },
): Promise<string> {
  const slug = o.slug ?? "C--Users-me-project";
  const sessionId = o.sessionId ?? "s1";
  const folder = o.agentId
    ? join(configDir, "projects", slug, sessionId, "subagents")
    : join(configDir, "projects", slug);
  await mkdir(folder, { recursive: true });
  const file = join(folder, o.agentId ? `agent-${o.agentId}.jsonl` : `${sessionId}.jsonl`);
  await writeFile(file, o.lines.join("\n") + "\n", "utf8");
  return file;
}
