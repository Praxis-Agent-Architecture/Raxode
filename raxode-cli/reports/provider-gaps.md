# Raxode Provider And API Gaps

This file records capability gaps that must not be reported as live-proven.

## Current Gaps

- `omniBase` live generation depends on model/API provider configuration that is not part of this backend split yet. `omni.viewImage` currently returns `PROVIDER_UNAVAILABLE` through a real Raxode live call, which is the correct honest failure mode.
- `computeruseBase` desktop input and screenshot behavior still depends on local Linux desktop providers and window/session binding. `computeruse.fullscreenScreenshot` is live-proven on the current machine, but keyboard/mouse session binding still needs focused provider coverage.
- MCP HTTP/SSE runtime provider is planned. The current local MCP smoke path proves `mcp.listTools` can execute against the runtime MCP provider surface, but full HTTP/SSE lifecycle coverage is still pending.
- Application REST JSON endpoints are implemented for view and commands.
- Application WebSocket JSON transport is implemented for ready, command, command result, and event messages.
- Full BaseTool matrix coverage is complete through `npm run test:agentCore:all-tools-matrix`; see `raxode-cli/reports/all-tools-matrix.md`. This is readiness and no-model family matrix proof, not proof that every tool performed a real external side effect through a live model turn.
- Live shell/git/code/search/skill/computeruse/mcp paths have repeatable smoke coverage through `npm run test:raxode:live-tools`.
- Legacy panels for model, permissions, approval, file paste, image paste, workspace search, mouse interaction, and session switching are being migrated incrementally from `legacy-src`.

## Reporting Rule

Raxode may show catalog readiness and application-layer mount state, but live provider success must only be reported after a real execution transcript exists under the relevant report directory.
