#!/usr/bin/env node
// `mcp-usage` prints the report; `mcp-usage serve` runs the MCP server over stdio.
if (process.argv[2] === "serve") {
  await import("./server.js");
} else {
  const { run } = await import("../cli.js");
  process.exitCode = await run(process.argv.slice(2));
}
