import assert from "node:assert/strict";
import test from "node:test";

import { createSurfaceEvent } from "./events.js";
import { createInitialSurfaceState, reduceSurfaceEvents } from "./reducer.js";
import {
  selectActiveTasks,
  selectCurrentTurn,
  selectInterruptibleTasks,
  selectLatestAssistantMessage,
  selectOpenOverlays,
  selectPanel,
  selectStatusMessages,
  selectTranscriptMessages,
} from "./selectors.js";
import {
  createSurfaceMessage,
  createSurfaceOverlay,
  createSurfaceTask,
  createSurfaceTurn,
} from "./types.js";

test("surface selectors expose transcript windows and current turn", () => {
  const state = reduceSurfaceEvents(createInitialSurfaceState(), [
    createSurfaceEvent({
      eventId: "event:turn.started:turn-1",
      type: "turn.started",
      emittedAt: "2026-04-11T09:00:00.000Z",
      at: "2026-04-11T09:00:00.000Z",
      source: "core",
      turn: createSurfaceTurn({
        turnId: "turn-1",
        id: "turn-1",
        turnIndex: 0,
        status: "running",
        startedAt: "2026-04-11T09:00:00.000Z",
        updatedAt: "2026-04-11T09:00:00.000Z",
        outputMessageIds: [],
        taskIds: [],
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:m1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:00:01.000Z",
      at: "2026-04-11T09:00:01.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "m1",
        id: "m1",
        kind: "user",
        createdAt: "2026-04-11T09:00:01.000Z",
        turnId: "turn-1",
        text: "a",
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:m2",
      type: "message.appended",
      emittedAt: "2026-04-11T09:00:02.000Z",
      at: "2026-04-11T09:00:02.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "m2",
        id: "m2",
        kind: "assistant",
        createdAt: "2026-04-11T09:00:02.000Z",
        turnId: "turn-1",
        text: "b",
      }),
    }),
  ]);

  assert.equal(selectCurrentTurn(state)?.id, "turn-1");
  assert.deepEqual(
    selectTranscriptMessages(state, { limit: 1 }).map((message) => message.id),
    ["m2"],
  );
  assert.equal(selectLatestAssistantMessage(state)?.id, "m2");
});

test("surface selectors preserve insertion order within the same turn", () => {
  const state = reduceSurfaceEvents(createInitialSurfaceState(), [
    createSurfaceEvent({
      eventId: "event:turn.started:turn-2",
      type: "turn.started",
      emittedAt: "2026-04-11T09:20:00.000Z",
      at: "2026-04-11T09:20:00.000Z",
      source: "core",
      turn: createSurfaceTurn({
        turnId: "turn-2",
        id: "turn-2",
        turnIndex: 1,
        status: "running",
        startedAt: "2026-04-11T09:20:00.000Z",
        updatedAt: "2026-04-11T09:20:00.000Z",
        outputMessageIds: [],
        taskIds: [],
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:user-2",
      type: "message.appended",
      emittedAt: "2026-04-11T09:20:01.000Z",
      at: "2026-04-11T09:20:01.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "user-2",
        id: "user-2",
        kind: "user",
        createdAt: "2026-04-11T09:20:01.000Z",
        turnId: "turn-2",
        text: "帮我搜索",
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:assistant-2a",
      type: "message.appended",
      emittedAt: "2026-04-11T09:20:02.000Z",
      at: "2026-04-11T09:20:02.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "assistant-2a",
        id: "assistant-2a",
        kind: "assistant",
        createdAt: "2026-04-11T09:20:02.000Z",
        turnId: "turn-2",
        text: "我先查一下。",
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:tool-2",
      type: "message.appended",
      emittedAt: "2026-04-11T09:20:03.000Z",
      at: "2026-04-11T09:20:03.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "tool-2",
        id: "tool-2",
        kind: "status",
        createdAt: "2026-04-11T09:20:03.000Z",
        turnId: "turn-2",
        text: "WebSearch\nSearching and grounding query",
        metadata: {
          source: "tool_summary",
        },
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:assistant-2b",
      type: "message.appended",
      emittedAt: "2026-04-11T09:20:04.000Z",
      at: "2026-04-11T09:20:04.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "assistant-2b",
        id: "assistant-2b",
        kind: "assistant",
        createdAt: "2026-04-11T09:20:04.000Z",
        turnId: "turn-2",
        text: "这是后半段回答。",
      }),
    }),
  ]);

  assert.deepEqual(
    selectTranscriptMessages(state, { turnId: "turn-2" }).map((message) => message.id),
    ["user-2", "assistant-2a", "tool-2", "assistant-2b"],
  );
});

test("surface selectors hide superseded tool preview messages after family summary arrives", () => {
  const state = reduceSurfaceEvents(createInitialSurfaceState(), [
    createSurfaceEvent({
      eventId: "event:turn.started:turn-2",
      type: "turn.started",
      emittedAt: "2026-04-11T09:25:00.000Z",
      at: "2026-04-11T09:25:00.000Z",
      source: "core",
      turn: createSurfaceTurn({
        turnId: "turn-2",
        id: "turn-2",
        turnIndex: 2,
        status: "running",
        startedAt: "2026-04-11T09:25:00.000Z",
        updatedAt: "2026-04-11T09:25:00.000Z",
        outputMessageIds: [],
        taskIds: [],
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:preview-code-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:25:01.000Z",
      at: "2026-04-11T09:25:01.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "preview-code-1",
        id: "preview-code-1",
        kind: "status",
        createdAt: "2026-04-11T09:25:01.000Z",
        turnId: "turn-2",
        text: "Tool ready\nScanning . (depth 2, up to 100 entries)",
        metadata: {
          source: "tool_summary",
          familyKey: "code",
          summaryRole: "tool_preview",
        },
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:family-code-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:25:02.000Z",
      at: "2026-04-11T09:25:02.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "family-code-1",
        id: "family-code-1",
        kind: "status",
        createdAt: "2026-04-11T09:25:02.000Z",
        turnId: "turn-2",
        text: "Code\nScanning . (depth 2, up to 100 entries)\nScanned .: 4 entries",
        metadata: {
          source: "tool_summary",
          familyKey: "code",
          summaryRole: "family",
        },
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:preview-code-2",
      type: "message.appended",
      emittedAt: "2026-04-11T09:25:03.000Z",
      at: "2026-04-11T09:25:03.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "preview-code-2",
        id: "preview-code-2",
        kind: "status",
        createdAt: "2026-04-11T09:25:03.000Z",
        turnId: "turn-2",
        text: "Code composing\nReading package.json",
        metadata: {
          source: "tool_summary",
          familyKey: "code",
          summaryRole: "tool_preview",
        },
      }),
    }),
  ]);

  assert.deepEqual(
    selectTranscriptMessages(state, { turnId: "turn-2" }).map((message) => message.id),
    ["family-code-1", "preview-code-2"],
  );
});

test("surface selectors hide generic tool preview messages after any later family summary in the same turn", () => {
  const state = reduceSurfaceEvents(createInitialSurfaceState(), [
    createSurfaceEvent({
      eventId: "event:turn.started:turn-3",
      type: "turn.started",
      emittedAt: "2026-04-11T09:26:00.000Z",
      at: "2026-04-11T09:26:00.000Z",
      source: "core",
      turn: createSurfaceTurn({
        turnId: "turn-3",
        id: "turn-3",
        turnIndex: 3,
        status: "running",
        startedAt: "2026-04-11T09:26:00.000Z",
        updatedAt: "2026-04-11T09:26:00.000Z",
        outputMessageIds: [],
        taskIds: [],
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:preview-tool-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:26:01.000Z",
      at: "2026-04-11T09:26:01.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "preview-tool-1",
        id: "preview-tool-1",
        kind: "status",
        createdAt: "2026-04-11T09:26:01.000Z",
        turnId: "turn-3",
        text: "Tool ready\nRunning pwd",
        metadata: {
          source: "tool_summary",
          familyKey: "tool",
          summaryRole: "tool_preview",
        },
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:shell-family-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:26:02.000Z",
      at: "2026-04-11T09:26:02.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "shell-family-1",
        id: "shell-family-1",
        kind: "status",
        createdAt: "2026-04-11T09:26:02.000Z",
        turnId: "turn-3",
        text: "Shell\nRunning pwd\nCommand completed with exit 0: pwd",
        metadata: {
          source: "tool_summary",
          familyKey: "shell",
          summaryRole: "family",
        },
      }),
    }),
  ]);

  assert.deepEqual(
    selectTranscriptMessages(state, { turnId: "turn-3" }).map((message) => message.id),
    ["shell-family-1"],
  );
});

test("surface selectors keep late previous-turn output before the next optimistic user turn", () => {
  const state = reduceSurfaceEvents(createInitialSurfaceState(), [
    createSurfaceEvent({
      eventId: "event:turn.started:turn-1",
      type: "turn.started",
      emittedAt: "2026-04-11T09:30:00.000Z",
      at: "2026-04-11T09:30:00.000Z",
      source: "core",
      turn: createSurfaceTurn({
        turnId: "turn-1",
        id: "turn-1",
        turnIndex: 1,
        status: "running",
        startedAt: "2026-04-11T09:30:00.000Z",
        updatedAt: "2026-04-11T09:30:00.000Z",
        outputMessageIds: [],
        taskIds: [],
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:user-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:30:01.000Z",
      at: "2026-04-11T09:30:01.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "user-1",
        id: "user-1",
        kind: "user",
        createdAt: "2026-04-11T09:30:01.000Z",
        turnId: "turn-1",
        text: "给我查一下 apple 股价",
      }),
    }),
    createSurfaceEvent({
      eventId: "event:turn.started:turn-2",
      type: "turn.started",
      emittedAt: "2026-04-11T09:30:02.000Z",
      at: "2026-04-11T09:30:02.000Z",
      source: "ui",
      turn: createSurfaceTurn({
        turnId: "turn-2",
        id: "turn-2",
        turnIndex: 2,
        status: "waiting",
        startedAt: "2026-04-11T09:30:02.000Z",
        updatedAt: "2026-04-11T09:30:02.000Z",
        outputMessageIds: [],
        taskIds: [],
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:user-2",
      type: "message.appended",
      emittedAt: "2026-04-11T09:30:02.000Z",
      at: "2026-04-11T09:30:02.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "user-2",
        id: "user-2",
        kind: "user",
        createdAt: "2026-04-11T09:30:02.000Z",
        turnId: "turn-2",
        text: "lsp你能用吗?",
        metadata: {
          optimistic: true,
        },
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:tool-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:30:03.000Z",
      at: "2026-04-11T09:30:03.000Z",
      source: "tap",
      message: createSurfaceMessage({
        messageId: "tool-1",
        id: "tool-1",
        kind: "status",
        createdAt: "2026-04-11T09:30:03.000Z",
        turnId: "turn-1",
        text: "WebSearch\nApple stock price current quote",
        metadata: {
          source: "tool_summary",
        },
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:assistant-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:30:04.000Z",
      at: "2026-04-11T09:30:04.000Z",
      source: "core",
      message: createSurfaceMessage({
        messageId: "assistant-1",
        id: "assistant-1",
        kind: "assistant",
        createdAt: "2026-04-11T09:30:04.000Z",
        turnId: "turn-1",
        text: "Apple 当前报价为 293.32 美元。",
      }),
    }),
  ]);

  assert.deepEqual(
    selectTranscriptMessages(state).map((message) => message.id),
    ["user-1", "tool-1", "assistant-1", "user-2"],
  );
});

test("surface selectors expose active tasks overlays panels and status messages", () => {
  const state = reduceSurfaceEvents(createInitialSurfaceState(), [
    createSurfaceEvent({
      eventId: "event:task.upserted:task-running",
      type: "task.upserted",
      emittedAt: "2026-04-11T09:10:00.000Z",
      at: "2026-04-11T09:10:00.000Z",
      source: "tap",
      task: createSurfaceTask({
        taskId: "task-running",
        id: "task-running",
        kind: "cmp_sync",
        status: "running",
        title: "Run cmp sync",
        summary: "cmp sync in progress",
        startedAt: "2026-04-11T09:10:00.000Z",
        updatedAt: "2026-04-11T09:10:00.000Z",
        foregroundable: true,
      }),
    }),
    createSurfaceEvent({
      eventId: "event:task.upserted:task-background",
      type: "task.upserted",
      emittedAt: "2026-04-11T09:10:01.000Z",
      at: "2026-04-11T09:10:01.000Z",
      source: "tap",
      task: createSurfaceTask({
        taskId: "task-background",
        id: "task-background",
        kind: "mp_materialize",
        status: "running",
        title: "Store log",
        summary: "background write",
        startedAt: "2026-04-11T09:10:01.000Z",
        updatedAt: "2026-04-11T09:10:01.000Z",
        foregroundable: false,
      }),
    }),
    createSurfaceEvent({
      eventId: "event:task.upserted:task-blocked",
      type: "task.upserted",
      emittedAt: "2026-04-11T09:10:01.500Z",
      at: "2026-04-11T09:10:01.500Z",
      source: "tap",
      task: createSurfaceTask({
        taskId: "task-blocked",
        id: "task-blocked",
        kind: "human_gate",
        status: "blocked",
        title: "Need user input",
        summary: "waiting on questionnaire",
        startedAt: "2026-04-11T09:10:01.500Z",
        updatedAt: "2026-04-11T09:10:01.500Z",
        foregroundable: true,
      }),
    }),
    createSurfaceEvent({
      eventId: "event:overlay.opened:overlay-search",
      type: "overlay.opened",
      emittedAt: "2026-04-11T09:10:02.000Z",
      at: "2026-04-11T09:10:02.000Z",
      source: "ui",
      overlay: createSurfaceOverlay({
        overlayId: "overlay-search",
        id: "overlay-search",
        kind: "search",
        title: "Search",
        createdAt: "2026-04-11T09:10:02.000Z",
        openedAt: "2026-04-11T09:10:02.000Z",
      }),
    }),
    createSurfaceEvent({
      eventId: "event:message.appended:status-1",
      type: "message.appended",
      emittedAt: "2026-04-11T09:10:03.000Z",
      at: "2026-04-11T09:10:03.000Z",
      source: "ui",
      message: createSurfaceMessage({
        messageId: "status-1",
        id: "status-1",
        kind: "status",
        createdAt: "2026-04-11T09:10:03.000Z",
        text: "cmp sync running",
      }),
    }),
  ]);

  assert.deepEqual(
    selectActiveTasks(state).map((task) => task.id),
    ["task-blocked", "task-running", "task-background"],
  );
  assert.deepEqual(
    selectInterruptibleTasks(state).map((task) => task.id),
    ["task-running", "task-background"],
  );
  assert.equal(selectOpenOverlays(state)[0]?.id, "overlay-search");
  assert.equal(selectPanel(state, "history")?.transcriptSize, 1);
  assert.equal(selectStatusMessages(state)[0]?.id, "status-1");
});
