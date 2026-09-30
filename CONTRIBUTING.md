# Contributing

Thanks for taking the time. `mcp-usage` is deliberately small, so the most useful contributions are bug reports after Claude Code updates, fixes, and adapters for other MCP clients.

## Setup

Node.js 22 or newer.

```bash
git clone https://github.com/Rixtayz/mcp-usage.git
cd mcp-usage
npm install
npm test
npm run typecheck
npm run build
node dist/bin/cli.js          # the report
node dist/bin/cli.js serve    # the MCP server over stdio
```

`npm run inspect` opens the MCP Inspector against the built server.

## Ground rules

1. **No real transcript data, ever.** Not in fixtures, not in issues, not in pull requests. Build test transcripts with the helpers in [`tests/helpers.ts`](tests/helpers.ts). They plant `SECRET_*` markers wherever a real transcript holds private content, so the privacy assertions keep working.
2. **Output stays content-free.** Anything the CLI or the MCP tools return may contain server names, tool names, counts, byte totals and timestamps. Nothing else. If a change needs more, open an issue first.
3. **No network, no writes.** The tool only reads transcript files.
4. **Tolerant parsing.** The transcript format is not a public API. Treat every field as optional, ignore unknown record types, and count malformed lines instead of throwing.
5. **Tests first.** Every behavior change comes with a test that fails without it. CI runs on Linux, macOS and Windows with Node 22 and 24.

## When Claude Code changes its transcript format

This is the most likely way the tool breaks. A good fix:

- adds a synthetic line with the new shape to the tests, next to the old shape, so both keep working;
- mentions the Claude Code version that introduced the change in the pull request.

## Adding a client

Client-specific code lives behind the `ClientAdapter` interface in [`src/types.ts`](src/types.ts). An adapter finds that client's logs and turns them into the same five `Event` kinds (`call`, `result`, `availability`, `health`, `roster`). Aggregation, recommendations, the CLI and the MCP server work unchanged. [`src/adapters/claude-code.ts`](src/adapters/claude-code.ts) is the reference implementation.

## Pull requests

- Keep them focused: one change per pull request.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).
- Add a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

Security problems, especially anything that could leak transcript content, go through [SECURITY.md](SECURITY.md) rather than a public issue.

## Releasing (maintainer)

1. Bump the version in `package.json` and in both `version` fields of `server.json`, then run `npm install --package-lock-only`.
2. Move the `Unreleased` entries in `CHANGELOG.md` under the new version.
3. Commit, then `npm publish` (tests, typecheck and build run first).
4. Tag and push: `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin main vX.Y.Z`.
5. Run **Publish to MCP Registry** from the Actions tab. It checks that `server.json` matches the version now on npm, then publishes through GitHub OIDC.
6. Create the GitHub release from the tag, with the changelog entry as notes.
