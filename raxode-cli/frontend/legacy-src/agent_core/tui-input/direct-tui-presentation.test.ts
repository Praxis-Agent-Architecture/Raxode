import assert from "node:assert/strict";
import test from "node:test";

import {
  startTextSelection,
  updateTextSelection,
} from "../../../tui-input/selection.js";
import { createSurfaceMessage } from "../surface/types.js";
import {
  applyDirectTuiTextSelectionToRenderSegments,
  createDirectTuiCmpActivityKey,
  deriveDirectTuiCmpStatusDescriptor,
  formatDirectTuiContextRemainingPercent,
  formatDirectTuiContextUsedPercent,
  hasDirectTuiFormalConversation,
  isDirectTuiLiveToolSummaryState,
  isDirectTuiCmpActivityStage,
  mapDirectTuiCoreTaskStatusToCompletedTaskStatus,
  mapDirectTuiCoreTaskStatusToRunPanelStatus,
  mapDirectTuiCoreTaskStatusToSurfaceTurnStatus,
  mergeDirectTuiStreamingAssistantLine,
  resolveDirectTuiAssistantDeltaAction,
  resolveDirectTuiAssistantTurnResultAction,
  resolveDirectTuiComposerSelectionTopRow,
  resolveDirectTuiConversationPhase,
  resolveDirectTuiContextUsedTokens,
  resolveDirectTuiInkColor,
  resolveDirectTuiProcedurePlannedToolPreviews,
  resolveDirectTuiToolSummaryResultLineLimit,
  resolveDirectTuiToolPreviewSummaryLines,
  resolveDirectTuiToolSummaryKey,
  settleDirectTuiLiveToolSummaryText,
  stabilizeDirectTuiProcedurePlannedToolPreviewLines,
  shouldApplyDirectTuiTurnResultContext,
  shouldAnimateDirectTuiRunStatus,
  shouldBreakDirectTuiAssistantSegmentOnStageStart,
  shouldRenderDirectTuiConversationHeader,
  shouldUseDirectTuiPinnedRunStatus,
} from "./direct-tui-presentation.js";

test("formal conversation starts only after a real user message appears", () => {
  const startupOnly = [
    createSurfaceMessage({
      messageId: "status:1",
      kind: "status",
      text: "warming up",
      createdAt: "2026-04-14T00:00:00.000Z",
    }),
    createSurfaceMessage({
      messageId: "assistant:welcome",
      kind: "assistant",
      text: "hello there",
      createdAt: "2026-04-14T00:00:01.000Z",
    }),
  ];
  assert.equal(hasDirectTuiFormalConversation(startupOnly), false);
  assert.equal(resolveDirectTuiConversationPhase({
    conversationActivated: false,
    messages: startupOnly,
  }), "intro");

  const withUser = [
    ...startupOnly,
    createSurfaceMessage({
      messageId: "user:1",
      kind: "user",
      text: "你好",
      createdAt: "2026-04-14T00:00:02.000Z",
    }),
  ];
  assert.equal(hasDirectTuiFormalConversation(withUser), true);
  assert.equal(resolveDirectTuiConversationPhase({
    conversationActivated: false,
    messages: withUser,
  }), "conversation");
});

test("conversation phase can activate immediately after submit before transcript catches up", () => {
  assert.equal(resolveDirectTuiConversationPhase({
    conversationActivated: true,
    messages: [],
  }), "conversation");
});

test("context footer prefers provider input tokens over the local prompt estimate", () => {
  const usedTokens = resolveDirectTuiContextUsedTokens({
    snapshot: {
      promptTokens: 912,
      lastRequestInputTokens: 262_115,
    },
    draftContextTokens: 0,
  });

  assert.equal(usedTokens, 262_115);
  assert.equal(formatDirectTuiContextRemainingPercent(usedTokens, 258_400), "0%");
});

test("context footer uses provider input tokens for real input-window occupancy", () => {
  const usedTokens = resolveDirectTuiContextUsedTokens({
    snapshot: {
      promptTokens: 912,
      lastRequestInputTokens: 147_374,
      lastRequestTotalTokens: 153_601,
    },
    draftContextTokens: 0,
  });

  assert.equal(usedTokens, 147_374);
  assert.equal(formatDirectTuiContextRemainingPercent(usedTokens, 258_400), "43%");
});

test("context footer falls back to prompt estimate when provider input tokens are missing", () => {
  assert.equal(resolveDirectTuiContextUsedTokens({
    snapshot: { promptTokens: 900 },
    draftContextTokens: 100,
  }), 1_000);
});

test("context footer reports remaining context against the provider input window", () => {
  assert.equal(formatDirectTuiContextRemainingPercent(27_199, 258_400), "89%");
  assert.equal(formatDirectTuiContextRemainingPercent(50_000, 258_400), "81%");
  assert.equal(formatDirectTuiContextRemainingPercent(0, 258_400), "100%");
});

test("context footer reports used context against the provider input window", () => {
  assert.equal(formatDirectTuiContextUsedPercent(27_199, 258_400), "11%");
  assert.equal(formatDirectTuiContextUsedPercent(50_000, 258_400), "19%");
  assert.equal(formatDirectTuiContextUsedPercent(0, 258_400), "0%");
});

test("conversation header lives in the scrollable transcript instead of a fixed masthead", () => {
  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: false,
    messages: [],
    pendingSessionSwitch: false,
  }), true);

  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: true,
    messages: [],
    pendingSessionSwitch: false,
  }), false);

  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: true,
    messages: [
      createSurfaceMessage({
        messageId: "user:1",
        kind: "user",
        text: "你好",
        createdAt: "2026-04-14T00:00:02.000Z",
      }),
    ],
    pendingSessionSwitch: false,
  }), true);

  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: false,
    messages: [
      createSurfaceMessage({
        messageId: "user:2",
        kind: "user",
        text: "继续",
        createdAt: "2026-04-14T00:00:03.000Z",
      }),
    ],
    pendingSessionSwitch: true,
  }), false);
});

test("run status stays in transcript flow unless pinned terminal painting is explicitly enabled", () => {
  const commonState = {
    hasTransientRunStatusLine: true,
    isTty: true,
    hasActiveToolSummary: false,
    exitSummaryActive: false,
    rewindInFlight: false,
    hasRewindOverlay: false,
    hasRushConfirmOverlay: false,
    hasRushOverlay: false,
    modelPickerOpen: false,
  };

  assert.equal(shouldUseDirectTuiPinnedRunStatus(commonState), false);
  assert.equal(shouldUseDirectTuiPinnedRunStatus({
    ...commonState,
    enablePinnedRunStatus: true,
  }), true);
});

test("run status animates independently while waiting before tool summaries arrive", () => {
  assert.equal(shouldAnimateDirectTuiRunStatus({
    hasRunIndicator: true,
    hasActiveToolSummary: false,
  }), true);
  assert.equal(shouldAnimateDirectTuiRunStatus({
    hasRunIndicator: true,
    hasActiveToolSummary: true,
  }), false);
  assert.equal(shouldAnimateDirectTuiRunStatus({
    hasRunIndicator: false,
    hasActiveToolSummary: false,
  }), false);
});

test("ink transcript rendering maps orange segments to the intended orange accent", () => {
  assert.equal(resolveDirectTuiInkColor("orange"), "#FF8A1F");
  assert.equal(resolveDirectTuiInkColor("cyan"), "cyan");
  assert.equal(resolveDirectTuiInkColor(undefined), undefined);
});

test("turn_result updates the active assistant message instead of appending a second segment", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "你好！我是 Praxis Core。",
    streamedText: "你好！我是 Praxis Core，",
    activeMessageId: "assistant:turn-1:1",
  }), {
    kind: "update",
    text: "你好！我是 Praxis Core。",
    messageId: "assistant:turn-1:1",
  });
});

test("turn_result appends only when there was no streamed assistant message", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "完整答案",
    streamedText: "",
  }), {
    kind: "append",
    text: "完整答案",
  });
});

test("turn_result appends a distinct final answer after committed progress messages", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "服务已经正常运行，可以打开 http://localhost:3000 查看效果。",
    streamedText: "让我验证 detached process 是否已经正常服务。",
  }), {
    kind: "append",
    text: "服务已经正常运行，可以打开 http://localhost:3000 查看效果。",
  });
});

test("turn_result appends only the missing suffix when committed text is a final-answer prefix", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "服务已经正常运行，可以打开 http://localhost:3000 查看效果。",
    streamedText: "服务已经正常运行",
  }), {
    kind: "append",
    text: "，可以打开 http://localhost:3000 查看效果。",
  });
});

test("turn_result is a noop when the final answer already matches streamed text", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "最终一致",
    streamedText: "最终一致",
    activeMessageId: "assistant:turn-2:1",
  }), {
    kind: "noop",
  });
});

test("assistant delta resumes after a tool break with only the unseen suffix", () => {
  assert.deepEqual(resolveDirectTuiAssistantDeltaAction({
    decodedText: "当然可以。简要说，我是一个偏执行型的 AI 助手。",
    previousDisplayedText: "当然可以。",
  }), {
    kind: "append",
    text: "简要说，我是一个偏执行型的 AI 助手。",
  });
});

test("assistant delta appends a normal incremental chunk to the active segment", () => {
  assert.deepEqual(resolveDirectTuiAssistantDeltaAction({
    decodedText: "当然可以。简要说，",
    previousDisplayedText: "当然可以。",
    activeMessageId: "assistant:turn-2:1",
  }), {
    kind: "delta",
    textDelta: "简要说，",
    messageId: "assistant:turn-2:1",
  });
});

test("assistant delta falls back to update when the accumulated text rewrites earlier content", () => {
  assert.deepEqual(resolveDirectTuiAssistantDeltaAction({
    decodedText: "新的完整答案",
    previousDisplayedText: "旧的前缀",
    activeMessageId: "assistant:turn-2:1",
  }), {
    kind: "update",
    text: "新的完整答案",
    messageId: "assistant:turn-2:1",
  });
});

test("streaming assistant line is rendered separately from committed transcript", () => {
  const transcriptLines = [">> 写一段话", "", "● 已完成上一轮", ""];

  assert.deepEqual(mergeDirectTuiStreamingAssistantLine({
    transcriptLines,
    streamingAssistant: {
      messageId: "assistant:turn-2:1",
      turnId: "turn-2",
      text: "正在流式输出",
    },
  }), [">> 写一段话", "", "● 已完成上一轮", "", "● 正在流式输出", ""]);

  assert.deepEqual(mergeDirectTuiStreamingAssistantLine({
    transcriptLines,
    streamingAssistant: null,
  }), transcriptLines);
});

test("background cmp stages do not break an in-flight assistant segment", () => {
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("cmp/icma"), false);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("cmp/dbagent"), false);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("core/run"), false);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("core/model.infer"), false);
});

test("foreground tool stages still break assistant segments by default", () => {
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("core/capability_bridge"), true);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("workspace/readback"), true);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart(undefined), true);
});

test("tool summary keys separate repeated calls in the same family", () => {
  assert.equal(resolveDirectTuiToolSummaryKey({
    turnId: "turn-2",
    familyKey: "shell",
    toolCallId: "call_shell_1",
  }), "turn-2:call_shell_1");

  assert.equal(resolveDirectTuiToolSummaryKey({
    turnId: "turn-2",
    familyKey: "shell",
    toolCallId: "call_shell_2",
  }), "turn-2:call_shell_2");
});

test("tool summary key falls back to family only when no call id is available", () => {
  assert.equal(resolveDirectTuiToolSummaryKey({
    turnId: "turn-3",
    familyKey: "code",
  }), "turn-3:code");
});

test("tool preview summary lines render shell arguments as a friendly action", () => {
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Shell",
    phase: "delta",
    providerToolName: "praxis_tool_shell_commandExecution",
    capabilityKey: "shell.commandExecution",
    argumentsPreview: "{\"target\":{\"command\":\"npm run check && curl http://localhost:3000\",\"workingDirectory\":\"/tmp/app\"}}",
  }), [
    "Shell composing",
    "Running npm run check && curl http://localhost:3000 in /tmp/app",
  ]);
});

test("tool preview summary lines block shell workspace writes while composing", () => {
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Tool",
    phase: "delta",
    providerToolName: "tool_call",
    argumentsPreview: JSON.stringify({
      target: {
        command: "set -e\nmkdir -p public notes\ncat > package.json <<'EOF'\n{}\nEOF\nnode server.js",
        workingDirectory: ".",
      },
    }),
  }), [
    "Shell blocked",
    "cat redirection writes workspace files; use code.overwrite, code.modify, or code.replaceFile for workspace file changes.",
  ]);

  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Shell",
    phase: "delta",
    providerToolName: "praxis_tool_shell_commandExecution",
    capabilityKey: "shell.commandExecution",
    argumentsPreview: "{\"target\":{\"command\":\"cat <<'EOF' > package.json\\n{}\\nEOF",
  }), [
    "Shell blocked",
    "cat heredoc redirection writes workspace files; use code.overwrite, code.modify, or code.replaceFile for workspace file changes.",
  ]);
});

test("tool preview summary lines render code scan and read arguments as friendly actions", () => {
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Code",
    phase: "delta",
    providerToolName: "praxis_tool_code_scan",
    capabilityKey: "code.scan",
    argumentsPreview: "{\"directoryPath\":\".\",\"depth\":2,\"maxEntries\":200,\"context\":{\"workspaceRoot\":\".\"}}",
  }), [
    "Code composing",
    "Scanning . (depth 2, up to 200 entries)",
  ]);

  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Code",
    phase: "delta",
    providerToolName: "praxis_tool_code_read",
    capabilityKey: "code.read",
    argumentsPreview: "{\"targetPaths\":[\"package.json\",\"tsconfig.json\"],\"maxBytesPerFile\":20000}",
  }), [
    "Code composing",
    "Reading package.json, tsconfig.json",
  ]);
});

test("tool preview summary lines render procedure arguments without raw JSON", () => {
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Tool",
    phase: "started",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview: "{\"procedureId\":\"inspect-current-workspace\",\"purpose\":\"Inspect current directory before creating the requested app\",\"executionMode\":\"parallel\",\"steps\":[{\"stepId\":\"pwd-list\",\"baseToolId\":\"shell.commandExecution\"}]}",
  }), [
    "Tool composing",
    "Composing procedure: Inspect current directory before creating the requested app",
    "Steps: pwd-list",
    "Tools: shell.commandExecution",
  ]);
});

test("tool preview summary lines do not misclassify procedure shell steps as direct shell writes", () => {
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Tool",
    phase: "delta",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview: JSON.stringify({
      procedureId: "create-app",
      purpose: "Create files through a procedure",
      executionMode: "serial",
      steps: [{
        stepId: "write-package",
        baseToolId: "shell.commandExecution",
        input: {
          command: "cat > package.json <<'EOF'\n{}\nEOF",
          cwd: ".",
        },
      }],
    }),
  }), [
    "Tool composing",
    "Composing procedure: Create files through a procedure",
    "Steps: write-package",
    "Tools: shell.commandExecution",
  ]);
});

test("tool preview summary lines tolerate incomplete streamed JSON", () => {
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Shell",
    phase: "delta",
    providerToolName: "praxis_tool_shell_commandExecution",
    capabilityKey: "shell.commandExecution",
    argumentsPreview: "{\"target\":{\"command\":\"npm run check && curl http://localhost:3000",
  }), [
    "Shell composing",
    "Running npm run check && curl http://localhost:3000",
  ]);

  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Tool",
    phase: "delta",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview: "{\"procedureId\":\"inspect-current-workspace\",\"purpose\":\"Inspect current directory before creating the requested app\",\"steps\":[",
  }), [
    "Tool composing",
    "Composing procedure: Inspect current directory before creating the requested app",
    "Receiving plan details (124 B)",
  ]);
});

test("tool preview summary lines show progress for partially streamed procedure write steps", () => {
  const argumentsPreview = [
    "{\"procedureId\":\"create-app\",\"purpose\":\"Create a markdown editor\",\"steps\":[",
    "{\"stepId\":\"write-index\",\"baseToolId\":\"code.overwrite\",\"input\":{",
    "\"targetPath\":\"index.html\",\"content\":\"<!doctype html>\\n<html>\\n<body>",
  ].join("");
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Tool",
    phase: "delta",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview,
  }), [
    "Tool composing",
    "Composing procedure: Create a markdown editor",
    "Receiving plan details (205 B, +3 lines)",
    "Steps: write-index",
    "Tools: code.overwrite",
    "Targets: index.html",
  ]);
  assert.deepEqual(resolveDirectTuiProcedurePlannedToolPreviews({
    phase: "delta",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview,
  }), [{
    familyKey: "code",
    familyTitle: "Code",
    lines: [
      "Code composing (+3)",
      "Writing index.html",
      "Receiving content (+3 lines)",
    ],
  }]);
  assert.deepEqual(resolveDirectTuiProcedurePlannedToolPreviews({
    phase: "done",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview,
  })[0]?.lines.slice(0, 2), [
    "Code ready (+3)",
    "Writing index.html",
  ]);
});

test("procedure planned shell preview shows the command like a direct shell call", () => {
  const argumentsPreview = [
    "{\"procedureId\":\"create-app\",\"purpose\":\"Check and create\",\"steps\":[",
    "{\"stepId\":\"make-dirs\",\"baseToolId\":\"shell.commandExecution\",\"input\":{",
    "\"command\":\"mkdir -p public notes\",\"workingDirectory\":\".\"",
    "}}]}",
  ].join("");
  assert.deepEqual(resolveDirectTuiProcedurePlannedToolPreviews({
    phase: "delta",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview,
  }), [{
    familyKey: "shell",
    familyTitle: "Shell",
    lines: [
      "Shell composing",
      "Running mkdir -p public notes in .",
    ],
  }]);
});

test("procedure planned code preview counts the currently open streamed content field", () => {
  const argumentsPreview = [
    "{\"procedureId\":\"create-app\",\"purpose\":\"Create files\",\"steps\":[",
    "{\"stepId\":\"write-a\",\"baseToolId\":\"code.overwrite\",\"input\":{",
    "\"targetPath\":\"a.txt\",\"content\":\"one\\ntwo\"}},",
    "{\"stepId\":\"write-b\",\"baseToolId\":\"code.overwrite\",\"input\":{",
    "\"targetPath\":\"b.txt\",\"content\":\"alpha\\nbeta\\ngamma",
  ].join("");
  assert.deepEqual(resolveDirectTuiProcedurePlannedToolPreviews({
    phase: "delta",
    providerToolName: "praxis_ephemeral_procedure",
    argumentsPreview,
  }), [{
    familyKey: "code",
    familyTitle: "Code",
    lines: [
      "Code composing (+5)",
      "Writing a.txt, b.txt",
      "Receiving content (+5 lines)",
    ],
  }]);
});

test("procedure planned code preview stabilization keeps early streamed counts from flickering backward", () => {
  assert.deepEqual(stabilizeDirectTuiProcedurePlannedToolPreviewLines({
    previousLines: [
      "Code composing (+450)",
      "Writing package.json, server.js",
      "Receiving content (+450 lines)",
    ],
    nextLines: [
      "Code composing (+380)",
      "Writing package.json, server.js",
    ],
  }), [
    "Code composing (+450)",
    "Writing package.json, server.js",
    "Receiving content (+450 lines)",
  ]);
});

test("tool preview summary lines show code edit diff stats while composing", () => {
  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Code",
    phase: "delta",
    providerToolName: "praxis_tool_code_modify",
    capabilityKey: "code.modify",
    argumentsPreview: JSON.stringify({
      targetPath: "src/app.ts",
      searchText: "const a = 1;\nconst b = 2;",
      replacementText: "const a = 1;\nconst b = 3;\nconst c = 4;",
    }),
  }), [
    "Code composing (+3 -2)",
    "Editing src/app.ts",
  ]);

  assert.deepEqual(resolveDirectTuiToolPreviewSummaryLines({
    title: "Code",
    phase: "delta",
    providerToolName: "praxis_tool_code_overwrite",
    capabilityKey: "code.overwrite",
    argumentsPreview: "{\"targetPath\":\"src/new.ts\",\"content\":\"export const a = 1;\\nexport const b = 2;",
  }), [
    "Code composing (+2)",
    "Writing src/new.ts",
  ]);
});

test("tool summary result line limit preserves code modify additions", () => {
  const resultLines = [
    "code.modify completed for test.md (27 B)",
    "@@ test.md · line 9 · 1 replacement @@",
    "-   9 | 34",
    "+   9 | 114514",
  ];

  assert.equal(resolveDirectTuiToolSummaryResultLineLimit({
    familyKey: "code",
    resultLines,
  }), 16);

  assert.equal(resolveDirectTuiToolSummaryResultLineLimit({
    familyKey: "shell",
    resultLines,
  }), 3);
});

test("tool summary live-state detection includes composing previews", () => {
  assert.equal(isDirectTuiLiveToolSummaryState("active"), true);
  assert.equal(isDirectTuiLiveToolSummaryState("composing"), true);
  assert.equal(isDirectTuiLiveToolSummaryState("ready"), false);
  assert.equal(isDirectTuiLiveToolSummaryState(undefined), false);
});

test("failed turn results map to failed TUI turn, task, and run states", () => {
  assert.equal(mapDirectTuiCoreTaskStatusToSurfaceTurnStatus("failed"), "failed");
  assert.equal(mapDirectTuiCoreTaskStatusToSurfaceTurnStatus("PROVIDER_UNAVAILABLE"), "failed");
  assert.equal(mapDirectTuiCoreTaskStatusToRunPanelStatus("failed"), "failed");
  assert.equal(mapDirectTuiCoreTaskStatusToCompletedTaskStatus("failed"), "failed");

  assert.equal(mapDirectTuiCoreTaskStatusToSurfaceTurnStatus("blocked"), "blocked");
  assert.equal(mapDirectTuiCoreTaskStatusToRunPanelStatus("blocked"), "paused");
  assert.equal(mapDirectTuiCoreTaskStatusToCompletedTaskStatus("blocked"), "blocked");

  assert.equal(mapDirectTuiCoreTaskStatusToSurfaceTurnStatus("completed"), "completed");
  assert.equal(mapDirectTuiCoreTaskStatusToRunPanelStatus("completed"), "completed");
  assert.equal(mapDirectTuiCoreTaskStatusToCompletedTaskStatus("completed"), "completed");
});

test("failed turn results settle unfinished tool previews instead of leaving composing copy live", () => {
  assert.equal(settleDirectTuiLiveToolSummaryText({
    text: "Code composing\nReading package.json, tsconfig.json",
    finalStatus: "failed",
  }), [
    "Code stopped",
    "Reading package.json, tsconfig.json",
    "Stopped before execution because the turn failed.",
  ].join("\n"));

  assert.equal(settleDirectTuiLiveToolSummaryText({
    text: "Shell composing\nRunning npm run dev",
    finalStatus: "completed",
  }), "Shell ready\nRunning npm run dev");
});

test("failed history-estimate turn context does not replace provider-backed context", () => {
  assert.equal(shouldApplyDirectTuiTurnResultContext({
    taskStatus: "failed",
    context: {
      estimated: true,
      contextSource: "application.history.estimate",
    },
  }), false);

  assert.equal(shouldApplyDirectTuiTurnResultContext({
    taskStatus: "failed",
    context: {
      estimated: false,
      contextSource: "provider.model-call.usage",
      lastRequestInputTokens: 44,
    },
  }), true);
});

test("cmp activity stage detection excludes infra bootstrap", () => {
  assert.equal(isDirectTuiCmpActivityStage("cmp/icma"), true);
  assert.equal(isDirectTuiCmpActivityStage("cmp/dispatcher"), true);
  assert.equal(isDirectTuiCmpActivityStage("cmp/infra_bootstrap"), false);
  assert.equal(isDirectTuiCmpActivityStage("core/run"), false);
});

test("cmp activity keys are created only for real cmp execution stages", () => {
  assert.equal(createDirectTuiCmpActivityKey({
    turnIndex: 11,
    stage: "cmp/checker",
  }), "11:cmp/checker");
  assert.equal(createDirectTuiCmpActivityKey({
    turnIndex: 11,
    stage: "cmp/infra_bootstrap",
  }), null);
});

test("cmp status descriptor animates only for active cmp stages", () => {
  assert.deepEqual(deriveDirectTuiCmpStatusDescriptor({
    activeStage: "cmp/icma",
  }), {
    label: "CMP icma running",
    animated: true,
    tone: "active",
  });
});

test("cmp status descriptor surfaces degraded readback without pretending it is running", () => {
  assert.deepEqual(deriveDirectTuiCmpStatusDescriptor({
    snapshot: {
      status: "degraded",
      readbackStatus: "degraded",
    },
  }), {
    label: "CMP readback degraded",
    animated: false,
    tone: "warning",
  });
});

test("cmp status descriptor distinguishes ready empty from active work", () => {
  assert.deepEqual(deriveDirectTuiCmpStatusDescriptor({
    snapshot: {
      status: "empty",
      readbackStatus: "ready",
    },
  }), {
    label: "CMP ready but empty",
    animated: false,
    tone: "muted",
  });
});

test("text selection render segments preserve colors while applying selection background", () => {
  const selection = updateTextSelection(
    startTextSelection("transcript", { row: 0, column: 1 }),
    "transcript",
    { row: 0, column: 4 },
  );

  assert.deepEqual(applyDirectTuiTextSelectionToRenderSegments({
    text: "abcdef",
    segments: [
      { text: "ab", color: "white" },
      { text: "cd", color: "cyan" },
      { text: "ef", color: "green" },
    ],
    row: 0,
    scope: "transcript",
    selection,
    selectionBackgroundColor: "blue",
  }), [
    { text: "a", color: "white", backgroundColor: undefined },
    { text: "b", color: "white", backgroundColor: "blue" },
    { text: "cd", color: "cyan", backgroundColor: "blue" },
    { text: "e", color: "green", backgroundColor: "blue" },
    { text: "f", color: "green", backgroundColor: undefined },
  ]);
});

test("text selection render segments ignore selections from another scope", () => {
  const selection = updateTextSelection(
    startTextSelection("composer", { row: 0, column: 0 }),
    "composer",
    { row: 0, column: 3 },
  );

  assert.deepEqual(applyDirectTuiTextSelectionToRenderSegments({
    text: "abcdef",
    segments: [{ text: "abcdef", color: "white" }],
    row: 0,
    scope: "transcript",
    selection,
    selectionBackgroundColor: "blue",
  }), [{ text: "abcdef", color: "white" }]);
});

test("composer selection top row follows slash panels and dispatch previews", () => {
  assert.equal(resolveDirectTuiComposerSelectionTopRow({
    transcriptViewportLineCount: 20,
    overlayLineCount: 0,
    pendingPreviewLineCount: 0,
  }), 23);

  assert.equal(resolveDirectTuiComposerSelectionTopRow({
    transcriptViewportLineCount: 20,
    overlayLineCount: 5,
    pendingPreviewLineCount: 2,
  }), 30);
});
