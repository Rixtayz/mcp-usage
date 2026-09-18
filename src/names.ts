const PREFIX = "mcp__";
const SEPARATOR = "__";

export interface ToolName {
  server: string;
  tool: string;
}

/**
 * Splits `mcp__<server>__<tool>` on the first separator after the prefix.
 * The server segment may contain single underscores, hyphens, dots or be a
 * UUID; the tool segment may itself contain `__`.
 */
export function parseToolName(name: string): ToolName | null {
  if (!name.startsWith(PREFIX)) return null;
  const rest = name.slice(PREFIX.length);
  const i = rest.indexOf(SEPARATOR);
  if (i <= 0 || i + SEPARATOR.length >= rest.length) return null;
  return { server: rest.slice(0, i), tool: rest.slice(i + SEPARATOR.length) };
}

/** Canonical server id (`claude.ai Context7`) → the form used in tool names. */
export function mangleServerId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}
