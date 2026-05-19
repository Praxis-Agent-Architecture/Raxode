import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePendingComposerDispatchesAfterFlush,
  shouldStartPendingComposerDispatchFlush,
} from "./pending-composer-flush.js";

test("shouldStartPendingComposerDispatchFlush requires a ready head entry and an idle foreground", () => {
  assert.equal(shouldStartPendingComposerDispatchFlush({
    pendingEntry: { id: "dispatch-1", status: "ready" },
    backendReady: true,
    hasRunningForegroundWork: false,
    activeFlushId: null,
  }), true);
  assert.equal(shouldStartPendingComposerDispatchFlush({
    pendingEntry: { id: "dispatch-1", status: "waiting_turn_end" },
    backendReady: true,
    hasRunningForegroundWork: false,
    activeFlushId: null,
  }), false);
  assert.equal(shouldStartPendingComposerDispatchFlush({
    pendingEntry: { id: "dispatch-1", status: "ready" },
    backendReady: true,
    hasRunningForegroundWork: true,
    activeFlushId: null,
  }), false);
  assert.equal(shouldStartPendingComposerDispatchFlush({
    pendingEntry: { id: "dispatch-1", status: "ready" },
    backendReady: true,
    hasRunningForegroundWork: false,
    activeFlushId: "dispatch-1",
  }), false);
});

test("resolvePendingComposerDispatchesAfterFlush removes the sent head before chain detection", () => {
  const result = resolvePendingComposerDispatchesAfterFlush({
    entries: [
      { id: "dispatch-1", status: "ready" },
      { id: "dispatch-2", status: "ready" },
      { id: "dispatch-3", status: "waiting_turn_end" },
    ],
    flushedEntryId: "dispatch-1",
    sent: true,
  });

  assert.deepEqual(result.nextEntries.map((entry) => entry.id), ["dispatch-2", "dispatch-3"]);
  assert.equal(result.nextChainInterrupt, true);
});

test("resolvePendingComposerDispatchesAfterFlush keeps the queue intact when no send occurred", () => {
  const result = resolvePendingComposerDispatchesAfterFlush({
    entries: [
      { id: "dispatch-1", status: "ready" },
      { id: "dispatch-2", status: "waiting_turn_end" },
    ],
    flushedEntryId: "dispatch-1",
    sent: false,
  });

  assert.deepEqual(result.nextEntries.map((entry) => entry.id), ["dispatch-1", "dispatch-2"]);
  assert.equal(result.nextChainInterrupt, false);
});
