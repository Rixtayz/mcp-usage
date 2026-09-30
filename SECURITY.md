# Security policy

`mcp-usage` reads Claude Code transcripts, which contain everything you ever typed into Claude Code. Its core promise is that none of that content can leave the tool: it has no network code, and its output holds only server names, tool names, counts, byte totals and timestamps.

A break in that promise is treated as a security issue.

## What to report

- Any output (CLI text, `--json`, or an MCP tool result) that contains prompt or response text, tool inputs or outputs, file paths from transcripts, or error message bodies.
- Any network access, file write, or code execution triggered by transcript content.
- A dependency vulnerability that is actually reachable from this tool.

## How to report

Please **do not open a public issue**. Use GitHub's private reporting instead: [**Report a vulnerability**](https://github.com/Rixtayz/mcp-usage/security/advisories/new).

Include the version (`mcp-usage --version`), your Claude Code version (`claude --version`), and the smallest *synthetic* transcript lines that reproduce the problem. Never send real transcripts: replace any private text with placeholders first.

You can expect a first answer within a week. Fixes ship as a patch release, and the advisory is published once a fixed version is on npm.

## Supported versions

Only the latest release on npm receives fixes.
