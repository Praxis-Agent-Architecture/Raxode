# Raxode Application Backend And TUI Split Checklist

## 0. Confirmed Direction

- [x] Keep `raxode-cli/backend` structurally aligned with `realtest/caonima`.
- [x] Treat `raxode-cli/backend` as the formal Raxode capability backend, not a proof-only realtest.
- [x] Use `raxode` as project id.
- [x] Use `application.raxode.coding` as application id.
- [x] Use `agent.raxode.coding` as primary agent id.
- [x] Remove or replace the current temporary `raxode-cli/backend/agentCoreBackend.ts`; do not keep it as the final backend.
- [x] Keep `raxode-cli/frontend/tui` as the source-of-truth UI reference during current organization; do not delete it.
- [x] Perform technical separation of the current Raxode TUI, not a visual rewrite.
- [x] Preserve the current TUI look and core behavior as the acceptance baseline.
- [x] Reuse the existing Raxode TUI as the active acceptance path; do not replace it with a newly invented shell while the Raxode UI is being connected.

## 1. Framework Application Layer

- [x] Create `src/applicationLayer/index.ts` as the framework public application entry.
- [x] Add `./application` to `package.json` exports.
- [x] Allow `src/applicationLayer` to import public `src/agentCore/index.ts`.
- [x] Forbid `src/applicationLayer` from importing `raxode-cli`.
- [x] Define `PraxisApplicationRuntime` as the core application runtime object.
- [x] Implement `createApplicationProjectRuntime(projectRoot)` to load `rax.project.json`.
- [x] Support local in-process runtime.
- [x] Support remote REST runtime shape.
- [x] Support real REST JSON endpoints for view and commands.
- [x] Support remote WebSocket runtime shape.
- [x] Support real WebSocket JSON command/event transport.
- [x] Normalize turn/session semantics over `runManifest`.
- [x] Expose application session lifecycle: start, submit turn, interrupt, resume, rewind, close.
- [x] Expose workspace/session switching.
- [x] Expose model state and model switching.
- [x] Expose permission profile switching.
- [x] Expose approval request and decision routing.
- [x] Expose tool state, tool calls, stdout/stderr, final output, errors, and runtime events as application events.
- [x] Expose assistant text streaming as application `stream` events.
- [x] Expose `ApplicationViewModel` as the only required TUI read model.
- [x] Add node tests for every new applicationLayer API.

## 2. Raxode Backend Project Shape

- [x] Create `raxode-cli/backend/rax.project.json`.
- [x] Create `raxode-cli/backend/application/raxodeApplication.ts`.
- [x] Create `raxode-cli/backend/application/runRaxodeBackend.ts`.
- [x] Create `raxode-cli/backend/agents/codingAgent/praxis.agent.ts`.
- [x] Create `raxode-cli/backend/agents/codingAgent/agent.ts` if needed for realtest-style authoring.
- [x] Create `raxode-cli/backend/agents/codingAgent/config/identity.ts`.
- [x] Create `raxode-cli/backend/agents/codingAgent/config/modelFleet.ts`.
- [x] Default model to `gpt-5.5` with reasoning `low`.
- [x] Preserve TUI model/reasoning switching support.
- [x] Preserve CLI model/reasoning switching support.
- [x] Create `raxode-cli/backend/agents/codingAgent/prompts/main.md`.
- [x] Create `raxode-cli/backend/agents/codingAgent/prompts/rules.md`.
- [x] Create `raxode-cli/backend/agents/codingAgent/prompts/tool-use.md`.
- [x] Create `raxode-cli/backend/agents/codingAgent/prompts/evidence.md`.
- [x] Create `raxode-cli/backend/agents/codingAgent/prompts/output-tail.md`.
- [x] Migrate useful `realtest/caonima` prompt experience while removing framework-proof wording.
- [x] Make prompt style coding-first and full-capability, close to Codex behavior but Praxis-native.
- [x] Create `raxode-cli/backend/agents/codingAgent/tools/toolSet.ts`.
- [x] Mount all framework-visible BaseTool capabilities through the catalog, not handwritten wrappers.
- [x] Create `raxode-cli/backend/agents/codingAgent/policies/toolPolicy.ts`.
- [x] Support `restricted`, `standard`, `permissive`, `yolo`, and `bapr`.
- [x] Default to `standard`.
- [x] Allow `/permissions` to switch policy profile.
- [x] Allow CLI `--permission` to switch policy profile before a run.
- [x] Create `raxode-cli/backend/agents/codingAgent/storage/storagePolicy.ts`.
- [x] Default session persistence to SQLite.
- [x] Store runtime/session data under project `.raxode`.
- [x] Create `raxode-cli/backend/authentication/providerProfiles.ts`.
- [x] Create placeholder `context/cmpBridge.ts`.
- [x] Create placeholder `memory/mpBridge.ts`.
- [x] Create placeholder `topology/multiagentTopology.ts`.
- [x] Keep multiagent structure but enable only the primary coding agent in the first pass.
- [x] Create `raxode-cli/backend/reports/`.
- [x] Create backend logs and transcripts conventions.
- [x] Create `raxode-cli/backend/tests/raxodeBackend.compile.test.ts`.
- [x] Create `raxode-cli/backend/tests/raxodeApplicationRuntime.test.ts`.
- [x] Expose Raxode REST backend server through backend helpers and CLI.
- [x] Expose Raxode WebSocket backend server through backend helpers and CLI.

## 3. Application Protocol Between TUI And Backend

- [x] Let applicationLayer own the canonical protocol shape.
- [x] Replace direct TUI `direct_user_input`, `direct_init_request`, and `direct_question_answer` with the new application protocol on the new bridge path.
- [x] Preserve Raxode TUI protocol at the current Raxode TUI boundary only, translating it through `raxode-cli/backend/raxodeTuiApplicationBackend.ts` into applicationLayer turns.
- [x] Use JSON envelopes for TUI input.
- [x] Use application events for backend output.
- [x] Include event kinds for lifecycle, conversation, tool, approval, model, permission, workspace, stdout, stderr, error, and final answer.
- [x] Ensure the TUI only needs `ApplicationViewModel` plus event stream.
- [x] Add backend support for interrupt.
- [x] Add backend support for resume.
- [x] Add backend support for rewind.
- [x] Add backend support for workspace switch.
- [x] Add backend support for approve/reject.
- [x] Add backend support for model change.
- [x] Add backend support for permission profile change.
- [x] Support backend crash restart and session recovery.
- [x] Support multiple workspace sessions.
- [x] Add protocol tests for input envelopes.
- [x] Add protocol tests for event normalization.

## 4. TUI Technical Separation

- [x] Keep `raxode-cli/frontend/tui` untouched as reference material during current organization.
- [x] Keep `raxode-cli/frontend/tui/agent_core/direct-tui.tsx` as a runnable Raxode UI and connect it to the application backend.
- [x] Start the Raxode TUI backend through `raxode-cli/backend/raxodeTuiApplicationBackend.ts` when available.
- [x] Fix Raxode TUI adapter startup ordering so stdin is attached immediately after `direct ready` and queued until application runtime initialization completes.
- [x] Bridge application `stream` events back into Raxode TUI `assistant_delta` live-report rows.
- [x] Preserve whitespace inside streamed model deltas so token chunks concatenate exactly.
- [x] Suppress backend-only Node experimental warnings from polluting the Raxode TUI transcript.
- [x] Create a new organized frontend structure outside `tui`.
- [x] Keep Ink + React.
- [x] Preserve black background, purple highlight, bottom workspace/context status bar, and slash menu table.
- [x] Preserve the visible slash commands: `/model`, `/status`, `/exit`, `/init`, `/resume`, `/permissions`, `/workspace`.
- [x] Keep hidden advanced commands available for later return: `/rush`, `/cmp`, `/mp`, `/capabilities`, `/agents`.
- [x] Preserve image paste attachment path.
- [x] Preserve long text paste attachment path.
- [x] Preserve clipboard file path/URI paste attachment path.
- [x] Preserve full desktop file paste behavior with provider-specific MIME metadata.
- [x] Preserve `@file` references.
- [x] Preserve workspace index/search core outside `tui`.
- [x] Preserve workspace indexed relative switch command path.
- [x] Preserve full interactive workspace picker behavior.
- [x] Preserve session switch command path.
- [x] Preserve session switch panel session listing from application view.
- [x] Preserve session create/rename command paths.
- [x] Preserve full session switch panel behavior with keyboard-selected create/rename actions.
- [x] Preserve permission panel behavior.
- [x] Preserve model switch behavior.
- [x] Preserve approval decision command path.
- [x] Preserve approval panel decision listing from application view.
- [x] Preserve approval pending request command/listing path.
- [x] Preserve full approval interaction panel behavior with keyboard-selected pending request actions.
- [x] Preserve mouse scroll parser for terminal SGR input.
- [x] Wire mouse scroll into slash panel line scrolling.
- [ ] Preserve full mouse support if dependency readiness allows it.
- [x] Preserve 120Hz input responsiveness target at text-input core level.
- [x] Replace the legacy deep-import render patch with the Raxode Ink 7 runtime renderer.
- [x] Separate UI components from backend/runtime state.
- [x] Separate input controller from application transport.
- [x] Separate slash command UI from slash command execution.
- [x] Separate panels from application event decoding.
- [x] Remove direct backend coupling from current frontend code.
- [x] Add `npm run raxode:tui`.
- [x] Keep `npm run raxode:raxode-tui`.

## 5. Migration Phases

- [x] Phase 1: Build framework `src/applicationLayer` contracts, runtime, sessions, events, view model, and tests.
- [x] Phase 2: Build `raxode-cli/backend` as a realtest-style complete application project.
- [x] Phase 3: Replace temporary backend adapter with applicationLayer-backed Raxode backend.
- [x] Phase 4: Add new application protocol and transport.
- [x] Phase 5: Extract reusable frontend modules from `tui` into organized frontend directories.
- [x] Phase 6: Replace direct backend calls in the TUI with the new application client.
- [x] Phase 6b: Restore the existing Raxode TUI as an application-backed runnable path through a compatibility adapter, preserving its current UI rather than forcing the new shell.
- [ ] Phase 7: Preserve and verify visual parity with the current Raxode TUI.
- [x] Add static render smoke for core visual anchors.
- [x] Phase 8: Run dry-run backend validation.
- [x] Phase 9: Run live `gpt-5.5-low` validation.
- [x] Phase 10: Run full tool coverage validation where APIs/providers are available; see `raxode-cli/reports/all-tools-matrix.md`.

## 6. Verification Gates

- [x] Run `npm run typecheck` after each major phase.
- [x] Run all new applicationLayer node tests.
- [x] Run all new Raxode backend tests.
- [x] Verify Raxode backend dry-run.
- [x] Verify Raxode backend live-run.
- [x] Verify TUI can talk to `gpt-5.5` through the new application backend.
- [x] Verify Raxode TUI can talk to the application backend through `npm run raxode:raxode-tui`.
- [x] Verify Raxode TUI streaming path emits `assistant_delta` rows at the 120fps frame target.
- [x] Verify shell tool flow.
- [x] Verify git tool flow.
- [x] Verify code/file tool flow.
- [x] Verify search/fetch tool flow.
- [x] Verify computeruse screenshot tool flow where local providers are ready.
- [ ] Verify computeruse keyboard/mouse focused-session flow where local providers are ready.
- [x] Verify all available BaseTool families through the all-tools readiness/no-model matrix; unavailable external APIs remain tracked separately.
- [x] Add repeatable live smoke for shell/git/code/search/skill/computeruse/mcp tool paths.
- [x] Verify backend crash restart and session recovery.
- [x] Verify workspace switching.
- [x] Verify permission profile switching.
- [x] Verify model switching.
- [x] Verify approval flow.
- [x] Verify REST view and command transport.
- [x] Verify WebSocket ready and command-result transport.
- [x] Verify `raxode-cli --serve-rest` startup.
- [x] Verify `raxode-cli --serve-ws` startup.
- [x] Verify TUI input/delete responsiveness remains near 120Hz target at text-input core level.
- [ ] Verify full rendered TUI input/delete responsiveness in an interactive terminal.
- [x] Verify rendered TUI accepts real TTY input, backspace correction, and `/status` panel opening through tmux smoke; see `raxode-cli/reports/tui-smoke.md`.
- [x] Verify Raxode TUI accepts real TTY input through tmux and renders application backend output; latest dry-run smoke showed `PraxisRuntimeKernel dry-run completed.` from the Raxode UI.
- [x] Verify Raxode TUI stream smoke through tmux with `RAXODE_RENDER_FPS=120 RAXODE_STREAM_FPS=120`; dry-run fallback emitted five `assistant_delta` rows about 8-10ms apart.
- [x] Verify Raxode TUI live stream smoke through tmux with `gpt-5.5-low`; prompt `只回答: OK` rendered `OK` and logged a real `assistant_delta` row before `turn_result`.
- [x] Verify core visual anchors render in current Shell.
- [ ] Verify full visual parity against current Raxode TUI.
- [x] Verify non-interactive Raxode TUI render smoke through the new application backend.

## 7. Documentation And Memory

- [x] Keep this checklist updated as implementation proceeds.
- [x] Write important architecture decisions to project memory.
- [x] Document `src/applicationLayer` as the official application integration surface.
- [x] Document `raxode-cli/backend` as the first full Praxis application backend.
- [x] Document the TUI technical split and current TUI preservation policy.
- [x] Document known provider/API gaps instead of hiding them.

## 8. Non-Negotiable Constraints

- [x] Do not delete `raxode-cli/frontend/tui`.
- [x] Do not lose current TUI visual identity.
- [x] Do not reintroduce direct TUI-to-agentCore coupling.
- [x] Do not handwrite 176 BaseTool wrappers.
- [x] Do not make Raxode product logic part of `agentCore`.
- [x] Do not make `applicationLayer` depend on Raxode.
- [x] Do not fake live tool/provider success.
