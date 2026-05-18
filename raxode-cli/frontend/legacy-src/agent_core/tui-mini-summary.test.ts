import assert from "node:assert/strict";
import test from "node:test";

import type { RaxodeApplicationClient } from "../../bridge/applicationClient.js";
import {
  refineWebSearchToolSummary,
  setTuiMiniSummaryApplicationClientForTest,
  summarizePendingComposerText,
} from "./tui-mini-summary.js";

function createMockClient(output: unknown, seen: unknown[]): RaxodeApplicationClient {
  return {
    ready: Promise.resolve({} as never),
    async getView() {
      return {} as never;
    },
    async dispatch(command) {
      seen.push(command);
      return {
        ok: true,
        view: {} as never,
        events: [],
        output,
      };
    },
    subscribe() {
      return () => {};
    },
    async close() {},
  };
}

test("summarizePendingComposerText delegates to application auxiliary tui agent", async () => {
  const seen: unknown[] = [];
  setTuiMiniSummaryApplicationClientForTest(createMockClient({
    schemaVersion: "pending-composer-summary/v1",
    summary: "短标题",
  }, seen));
  try {
    const summary = await summarizePendingComposerText({
      sessionId: "session-1",
      runId: "run-1",
      text: "这是一段很长的内容，需要压成短标题。",
      route: {
        model: "gpt-5.4-mini",
        reasoningEffort: "low",
        timeoutMs: 1234,
      },
    });
    assert.equal(summary, "短标题");
    assert.equal((seen[0] as { type?: string }).type, "application.invokeAuxiliaryTask");
    assert.equal((seen[0] as { agentId?: string }).agentId, "agent.raxode.tui");
    assert.equal((seen[0] as { taskKind?: string }).taskKind, "tui.pending-composer-summary");
    assert.equal((seen[0] as { timeoutMs?: number }).timeoutMs, 1234);
  } finally {
    setTuiMiniSummaryApplicationClientForTest(undefined);
  }
});

test("refineWebSearchToolSummary delegates to application auxiliary tui agent", async () => {
  const seen: unknown[] = [];
  setTuiMiniSummaryApplicationClientForTest(createMockClient({
    schemaVersion: "tool-summary-websearch/v1",
    title: "WebSearch",
    lines: ["Found current price evidence."],
  }, seen));
  try {
    const summary = await refineWebSearchToolSummary({
      sessionId: "session-1",
      runId: "run-2",
      title: "WebSearch",
      intentLines: ["Search gold price"],
      resultLines: ["GC=F close 4730.7"],
      metadataLines: ["source: yahoo"],
    });
    assert.deepEqual(summary, {
      title: "WebSearch",
      lines: ["Found current price evidence."],
    });
    assert.equal((seen[0] as { type?: string }).type, "application.invokeAuxiliaryTask");
    assert.equal((seen[0] as { agentId?: string }).agentId, "agent.raxode.tui");
    assert.equal((seen[0] as { taskKind?: string }).taskKind, "tui.tool-summary.websearch");
  } finally {
    setTuiMiniSummaryApplicationClientForTest(undefined);
  }
});
