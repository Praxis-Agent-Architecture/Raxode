import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPendingComposerWaitlistWindow,
  buildPendingComposerVisibleWindow,
  clampPendingComposerSelectionIndex,
  compactPendingComposerText,
  formatPendingComposerOrdinal,
  PENDING_COMPOSER_MAX_NARROW,
  PENDING_COMPOSER_MAX_WIDE,
  resolvePendingComposerPreviewOrdinal,
  resolvePendingComposerWaitlistSelectionMove,
  shouldSummarizePendingComposerText,
  takeNextPendingComposerDispatchBatch,
} from "./pending-composer-submissions.js";

test("takeNextPendingComposerDispatchBatch groups leading waiting items", () => {
  const entries = [
    { mode: "waiting" as const, text: "first" },
    { mode: "waiting" as const, text: "second" },
    { mode: "queue" as const, text: "third" },
  ];
  assert.deepEqual(
    takeNextPendingComposerDispatchBatch(entries).map((entry) => entry.text),
    ["first", "second"],
  );
});

test("takeNextPendingComposerDispatchBatch lets queue lead a batch and absorb following waiting items", () => {
  const entries = [
    { mode: "queue" as const, text: "first" },
    { mode: "waiting" as const, text: "second" },
    { mode: "waiting" as const, text: "third" },
    { mode: "queue" as const, text: "fourth" },
  ];
  assert.deepEqual(
    takeNextPendingComposerDispatchBatch(entries).map((entry) => entry.text),
    ["first", "second", "third"],
  );
});

test("buildPendingComposerVisibleWindow shows the newest six items by default", () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({ sequence: index + 1 }));
  const window = buildPendingComposerVisibleWindow(entries, 0);

  assert.deepEqual(window.visibleItems.map((entry) => entry.sequence), [8, 7, 6, 5, 4, 3]);
  assert.equal(window.hiddenCount, 2);
  assert.equal(window.maxOffset, 2);
});

test("buildPendingComposerVisibleWindow browses older items when offset increases", () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({ sequence: index + 1 }));
  const window = buildPendingComposerVisibleWindow(entries, 2);

  assert.deepEqual(window.visibleItems.map((entry) => entry.sequence), [6, 5, 4, 3, 2, 1]);
  assert.equal(window.hiddenCount, 0);
});

test("clampPendingComposerSelectionIndex keeps the queue head at zero and caps the top item", () => {
  assert.equal(clampPendingComposerSelectionIndex(-1, 9), 0);
  assert.equal(clampPendingComposerSelectionIndex(0, 9), 0);
  assert.equal(clampPendingComposerSelectionIndex(99, 9), 8);
  assert.equal(clampPendingComposerSelectionIndex(3, 0), 0);
});

test("buildPendingComposerWaitlistWindow anchors the initial page on the queue head", () => {
  const entries = Array.from({ length: 9 }, (_, index) => ({ sequence: index + 1 }));
  const window = buildPendingComposerWaitlistWindow(entries, 0);

  assert.deepEqual(window.visibleItems.map((entry) => entry.ordinal), [6, 5, 4, 3, 2, 1]);
  assert.equal(window.hiddenAboveCount, 3);
  assert.equal(window.selectedOrdinal, 1);
});

test("buildPendingComposerWaitlistWindow scrolls upward once selection leaves the first page", () => {
  const entries = Array.from({ length: 9 }, (_, index) => ({ sequence: index + 1 }));
  const window = buildPendingComposerWaitlistWindow(entries, 6);

  assert.deepEqual(window.visibleItems.map((entry) => entry.ordinal), [7, 6, 5, 4, 3, 2]);
  assert.equal(window.hiddenAboveCount, 2);
  assert.equal(window.selectedOrdinal, 7);
});

test("buildPendingComposerWaitlistWindow exposes the oldest visible page at the top boundary", () => {
  const entries = Array.from({ length: 9 }, (_, index) => ({ sequence: index + 1 }));
  const window = buildPendingComposerWaitlistWindow(entries, 8);

  assert.deepEqual(window.visibleItems.map((entry) => entry.ordinal), [9, 8, 7, 6, 5, 4]);
  assert.equal(window.hiddenAboveCount, 0);
  assert.equal(window.selectedOrdinal, 9);
});

test("resolvePendingComposerWaitlistSelectionMove starts selection from queue head on first upward shortcut", () => {
  assert.deepEqual(
    resolvePendingComposerWaitlistSelectionMove({
      currentIndex: null,
      direction: 1,
      totalCount: 9,
    }),
    {
      nextIndex: 0,
      boundary: null,
    },
  );
});

test("resolvePendingComposerWaitlistSelectionMove leaves the composer focused when moving down without selection", () => {
  assert.deepEqual(
    resolvePendingComposerWaitlistSelectionMove({
      currentIndex: null,
      direction: -1,
      totalCount: 9,
    }),
    {
      nextIndex: null,
      boundary: null,
    },
  );
});

test("resolvePendingComposerWaitlistSelectionMove drops back to composer when moving below 01", () => {
  assert.deepEqual(
    resolvePendingComposerWaitlistSelectionMove({
      currentIndex: 0,
      direction: -1,
      totalCount: 9,
    }),
    {
      nextIndex: null,
      boundary: null,
    },
  );
});

test("resolvePendingComposerWaitlistSelectionMove reports the top boundary instead of wrapping", () => {
  assert.deepEqual(
    resolvePendingComposerWaitlistSelectionMove({
      currentIndex: 8,
      direction: 1,
      totalCount: 9,
    }),
    {
      nextIndex: 8,
      boundary: "top",
    },
  );
});

test("formatPendingComposerOrdinal switches to three digits at 100+", () => {
  assert.equal(formatPendingComposerOrdinal(7, 8), "07");
  assert.equal(formatPendingComposerOrdinal(7, 108), "007");
});

test("resolvePendingComposerPreviewOrdinal keeps the queue head at 01 even when rendered on the bottom row", () => {
  assert.equal(resolvePendingComposerPreviewOrdinal(0), 1);
  assert.equal(resolvePendingComposerPreviewOrdinal(1), 2);
  assert.equal(resolvePendingComposerPreviewOrdinal(2), 3);
});

test("shouldSummarizePendingComposerText respects wide and narrow caps", () => {
  assert.equal(shouldSummarizePendingComposerText("a".repeat(PENDING_COMPOSER_MAX_NARROW)), false);
  assert.equal(shouldSummarizePendingComposerText("a".repeat(PENDING_COMPOSER_MAX_NARROW + 1)), true);
  assert.equal(shouldSummarizePendingComposerText("你".repeat(PENDING_COMPOSER_MAX_WIDE)), false);
  assert.equal(shouldSummarizePendingComposerText("你".repeat(PENDING_COMPOSER_MAX_WIDE + 1)), true);
});

test("compactPendingComposerText trims long content into the display budget", () => {
  const compacted = compactPendingComposerText("请你做个详细的自我介绍详细一点我不明白啊我还想多知道一些");
  assert.match(compacted, /\.\.\.$/u);
  assert.equal(shouldSummarizePendingComposerText(compacted), false);
});
