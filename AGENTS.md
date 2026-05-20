# Raxode Agent Guide

## Scope

- This repository is the Raxode application package, not the Praxis framework package.
- Raxode depends on `@praxis-ai/praxis` and should keep application, backend bridge, and TUI code here.
- Do not move framework/runtime ownership back into this repository unless the user explicitly asks for it.

## Working Defaults

- Default to TypeScript + Node.js 24.15.x.
- Treat `raxode-cli/backend` as the application backend and `raxode-cli/frontend/tui` as the current product TUI path.
- Keep packaged-install behavior in mind: CLI entrypoints and subprocesses must resolve package-local files from absolute paths, not from the user's working directory.
- Runtime state belongs in user/workspace state directories such as `~/.raxode` or `.raxode`, not in the repository.
- `dist/` is generated package output. Build it from source; do not hand-edit compiled files.

## Repository Hygiene

- `automations/` is for repository maintenance scripts such as build asset copying, cache inspection, and test orchestration.
- `raxode-cli/reports/` may hold development evidence, but it must not enter the npm package.
- Avoid adding broad historical planning folders, local session folders, or framework docs into this app repository.

## Verification

- After source or packaging changes, prefer this stack:
  - `npm run typecheck`
  - `npm run test:unit`
  - `npm run build`
  - `npm pack --dry-run --json`
- For Raxode TUI changes, also consider a packaged-install smoke test when the change touches bin scripts, loaders, subprocess paths, login, or rewind/checkpoint behavior.
