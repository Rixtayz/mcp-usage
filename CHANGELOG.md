# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Removed

- The separate `mcp-usage-server` command. Use `mcp-usage serve`, which the README already documents.

## [0.1.0] - 2026-09-30

First public release.

### Added

- `mcp-usage` CLI: a per-server report of every MCP server seen in local Claude Code transcripts, with status (`used`, `unused`, `failed`, `needs-auth`), tools exposed, sessions, calls, error rate, estimated result tokens and last use. Options `--since`, `--project`, `--min-sessions`, `--dir` and `--json`.
- Recommendations: disconnect unused servers, fix or remove failing ones, authorize or remove pending ones, investigate high error rates, watch heavy results.
- `mcp-usage serve`: an MCP server over stdio with four read-only tools, `usage_summary`, `unused_servers`, `server_details` and `recommendations`.
- Streaming parser for Claude Code 2.1.233 – 2.1.274 transcripts, including subagent transcripts.
- Privacy tests that assert no transcript content reaches the library, CLI or MCP output.

[Unreleased]: https://github.com/Rixtayz/mcp-usage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Rixtayz/mcp-usage/releases/tag/v0.1.0
