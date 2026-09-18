import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { parseToolName } from "./names.js";
import type { Event } from "./types.js";

/** Lines containing none of these cannot produce an event; skip JSON.parse for them. */
const MARKERS = ['"tool_use"', '"tool_result"', '"deferred_tools_delta"', '"mcp_instructions_delta"'];

export interface ParseContext {
  /** Used when a record carries no `sessionId`. */
  fallbackSessionId: string;
  /** Ids of MCP calls seen so far in this file that have no result yet. */
  pendingCalls: Set<string>;
}

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === "string" && x !== "" ? x : undefined);
const strArray = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];

function contentBytes(content: unknown): number {
  if (typeof content === "string") return Buffer.byteLength(content);
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const block of content) {
    if (isObj(block) && block.type === "text" && typeof block.text === "string") {
      total += Buffer.byteLength(block.text);
    }
  }
  return total;
}

function parseMessage(rec: Obj, sessionId: string, timestamp: string | undefined, ctx: ParseContext): Event[] {
  const content = isObj(rec.message) ? rec.message.content : undefined;
  if (!Array.isArray(content)) return [];
  const events: Event[] = [];
  for (const block of content) {
    if (!isObj(block)) continue;
    if (rec.type === "assistant" && block.type === "tool_use") {
      const id = str(block.id);
      const name = str(block.name);
      const parsed = name ? parseToolName(name) : null;
      if (!id || !parsed) continue;
      ctx.pendingCalls.add(id);
      events.push({ kind: "call", sessionId, timestamp, toolUseId: id, ...parsed });
    } else if (rec.type === "user" && block.type === "tool_result") {
      const id = str(block.tool_use_id);
      if (!id || !ctx.pendingCalls.delete(id)) continue;
      events.push({
        kind: "result",
        sessionId,
        toolUseId: id,
        isError: block.is_error === true,
        bytes: contentBytes(block.content),
      });
    }
  }
  return events;
}

function parseAttachment(att: Obj, sessionId: string, timestamp: string | undefined): Event[] {
  if (att.type === "mcp_instructions_delta") {
    const canonicalIds = strArray(att.addedNames);
    return canonicalIds.length > 0 ? [{ kind: "roster", sessionId, canonicalIds }] : [];
  }
  if (att.type !== "deferred_tools_delta") return [];
  const events: Event[] = [];
  const added = strArray(att.addedNames).filter((n) => parseToolName(n) !== null);
  if (added.length > 0) events.push({ kind: "availability", sessionId, timestamp, added });
  const failed = Array.isArray(att.failedMcpServers)
    ? att.failedMcpServers.flatMap((f) => {
        const name = isObj(f) ? str(f.name) : undefined;
        return name ? [name] : [];
      })
    : [];
  const needsAuth = strArray(att.needsAuthMcpServers);
  if (failed.length > 0 || needsAuth.length > 0) {
    events.push({ kind: "health", sessionId, timestamp, failed, needsAuth });
  }
  return events;
}

/** Returns the events in one transcript line, or `null` if the line is malformed JSON. */
export function parseLine(line: string, ctx: ParseContext): Event[] | null {
  if (!MARKERS.some((m) => line.includes(m))) return [];
  let rec: unknown;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(rec)) return [];
  const sessionId = str(rec.sessionId) ?? ctx.fallbackSessionId;
  const timestamp = str(rec.timestamp);
  if (rec.type === "assistant" || rec.type === "user") return parseMessage(rec, sessionId, timestamp, ctx);
  if (rec.type === "attachment" && isObj(rec.attachment)) {
    return parseAttachment(rec.attachment, sessionId, timestamp);
  }
  return [];
}

/** Streams one transcript file line by line. */
export async function parseFile(path: string, sink: (e: Event) => void): Promise<{ linesSkipped: number }> {
  const ctx: ParseContext = { fallbackSessionId: basename(path, ".jsonl"), pendingCalls: new Set() };
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let linesSkipped = 0;
  for await (const line of lines) {
    if (line === "") continue;
    const events = parseLine(line, ctx);
    if (events === null) linesSkipped++;
    else for (const e of events) sink(e);
  }
  return { linesSkipped };
}
