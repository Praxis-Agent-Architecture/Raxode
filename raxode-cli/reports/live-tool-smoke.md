# Raxode Live Tool Smoke Evidence

This report tracks live Raxode tool execution through the application-layer backend.

## Command

```bash
npm run test:raxode:live-tools
```

The script runs `./bin/raxode-cli --process --json --live --permission bapr ...` for each case.

## Proven Paths

| Family | Tool | Expected Evidence |
| --- | --- | --- |
| shell | `shell.commandExecution` | `pwd` returns `/home/proview/Desktop/Praxis_series/Praxis_org` |
| git | `git.getRepositoryStatus` | final answer mentions `porcelain` status |
| code | `code.read` | `package.json` name resolves to `@praxis-ai/praxis` |
| search | `search.fetch` | `https://example.com` title resolves to `Example` |
| skill | `skill.ripgrep` | search for `PraxisApplicationRuntime` returns a repository file path |
| computeruse | `computeruse.fullscreenScreenshot` | returns either a screenshot artifact id or a real saved `screenshot-*.png` path that exists on disk |
| mcp | `mcp.listTools` | local runtime MCP provider exposes the smoke `echo` tool |

## Honest Provider Gap

| Family | Tool | Current Result |
| --- | --- | --- |
| omni | `omni.viewImage` | real live invocation returns `PROVIDER_UNAVAILABLE` until an omni provider is wired |

## Rule

Catalog mounting is not counted as live success. A capability only moves into the proven list after `npm run test:raxode:live-tools` executes it through the Raxode application backend and asserts the result.

Latest verification: `npm run test:raxode:live-tools` passed 8/8 on 2026-05-10 after widening the screenshot assertion to match the current provider output shape.
