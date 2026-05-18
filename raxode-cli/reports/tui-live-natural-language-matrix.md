# Raxode TUI Live Natural Language Matrix

Status: in progress

This matrix tracks real natural-language runs against the Raxode application/TUI path. A pass requires a real response or artifact, not only a unit test.

## Scope

- Frontend shell behavior: input, multiline input, mouse selection/scrolling, slash surfaces, stream rendering, approval gate, exit/end screen.
- Application bridge: TUI events, streaming deltas, approvals, attachments, workspace/session/model/permission state.
- Framework capability path: shell, git, code, search, computer use, omni image view/generation, and failure rendering.

## Current Evidence

| Area | Natural-language prompt | Evidence | Status |
| --- | --- | --- | --- |
| Omni image generation | `必须调用 omni.generateImage 生成一张小猴子的 PNG 图片...` | Live generated `/home/proview/Desktop/Praxis_series/Praxis_org/.rax_workspace/artifacts/session.application.raxode.coding.default/generated-image-call_uO5Y8ph8JxQRDrsckdHlhKD5.png`; verified as PNG 1024x1536, 2732050 bytes. | pass |
| Omni image permissions | BAPR and standard approval generate-image tests | `raxodeApplicationRuntime.test.ts` covers BAPR auto-grant and standard approval grant injection. | pass |
| TUI text input | Shift+Enter/Ctrl+J newline tests | `text-input.test.ts` covers Ctrl+J and common Shift+Enter terminal sequences. | pass |
| TUI mouse selection/scroll | Mouse reporting opt-in tests | `mouse.test.ts` covers opt-in mouse reporting so native drag selection is preserved by default. | pass |

## Next Runs

| Area | Prompt | Required evidence | Status |
| --- | --- | --- | --- |
| Web search | Ask for current quote/news with sources. | Provider-native search tool event, readable sources, no raw JSON/protocol leak. | pending |
| Shell | Ask to inspect current workspace count without editing. | Shell tool event, command summary, answer matches command evidence. | pending |
| Code/files | Ask to create/edit a temp fixture file and summarize diff. | Code tool event and actual file content in temp/sandbox path. | pending |
| Git | Ask to inspect status/history without mutation. | Git tool event and status summary. | pending |
| Image view | Paste/provide image reference and ask what is visible. | `omni.viewImage` event with real image analysis. | pending |
| Approval gate | Run standard profile task requiring shell/computeruse approval. | Human approval UI/event and approved/denied behavior. | pending |
| Computer use | Ask to screenshot or interact with a bound target. | Correct target requirement, no focus-dependent fake success. | pending |
| Slash model/permission/workspace | Use UI slash flow manually/automated where possible. | Visual state matches backend state. | pending |
| End screen/exit | Exit after runs. | TUI can leave final page cleanly. | pending |

## Run Notes

- 2026-05-11 live `web-search`: natural prompt asked for Apple AAPL current/recent quote. `search.nativeSearch` completed, returned provider finance quote `$293.32`, `2026-05-11T10:01:20Z`, source `oai-finance`; no raw protocol leak observed. Status: pass.
- 2026-05-11 live `shell-readonly`: natural prompt asked for ts/tsx file count. `shell.commandExecution` completed and final answer included command evidence. Count included all dependency/generated paths, so future prompt should specify exclusions when desired. Status: pass with note.
- 2026-05-11 live `git-status`: natural prompt asked for read-only git status. Agent used `shell.commandExecution` and `git.getRepositoryStatus`, then summarized modified tracked files. Status: pass.
- 2026-05-11 live `code-fixture`: natural prompt asked to create and read a JSON fixture under `.rax_workspace/live-smoke`. First attempted `shell.commandExecution` failed with `INVALID_COMMAND`; agent recovered using `code.overwrite` and `code.read`, final readback matched. Status: pass with tool-choice issue.
- 2026-05-11 live `image-view`: natural prompt referenced the generated PNG path. `omni.viewImage` completed through `chatgpt-codex-responses-vision` and correctly identified a cartoon monkey on transparent/checkered background. Status: pass.
- 2026-05-11 live `computeruse-screenshot`: natural prompt asked to capture current screen. `computeruse.fullscreenScreenshot` completed and returned `.rax_workspace/artifacts/session.application.raxode.coding.default/screenshot-54ebaffd-6fe3-46fa-98c5-263e87862364.png`. Status: pass.
- 2026-05-11 live `standard-approval-shell`: natural prompt under `--permission standard` asked for read-only shell evidence. `shell.scriptExecution` failed with `APPROVAL_REQUIRED`; process mode did not surface an approval decision and returned failed status. Status: fail / needs approval flow investigation.
- 2026-05-11 live `omni-generateImage-regression`: natural prompt asked to generate a monkey image and let runtime choose the path. Initial run failed after the former 180s timeout. After extending the Codex live provider timeout and preserving public-safe provider errors, the same natural prompt completed with `omni.generateImage completed`, producing `/home/proview/Desktop/Praxis_series/Praxis_org/.rax_workspace/artifacts/session.application.raxode.coding.default/generated-image-call_uO5Y8ph8JxQRDrsckdHlhKD5.png`; `file` verified `PNG image data, 1024 x 1536`, 2732050 bytes. Status: pass.
- 2026-05-11 live `omni-viewImage-regression`: natural prompt asked to inspect the generated image path. `omni.viewImage` completed and described a cute monkey on a tree branch with green jungle background. Status: pass.
- 2026-05-11 live `tui-process-bridge-omni-generateImage`: used the same process application client path as the interactive TUI, started `ready live standard`, changed permission to `bapr`, then submitted the natural-language monkey image prompt in live mode. Result `ok true completed bapr live`; generated `/home/proview/Desktop/Praxis_series/Praxis_org/.rax_workspace/artifacts/session.application.raxode.coding.default/generated-image-call_ryw8NzLkPH46HZBljzS5Sk4X.png`, 1880073 bytes. Status: pass.
- 2026-05-11 `standard-approval-flow-regression`: added automated coverage that application-level approval decisions resolve pending runtime approvals for `omni.generateImage`. `raxodeApplicationRuntime.test.ts` now verifies pending approval exposure, approval decision dispatch, continuation, and image artifact creation. Status: pass.
