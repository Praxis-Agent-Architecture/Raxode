import assert from "node:assert/strict";
import test from "node:test";

import {
  recordSubmittedComposerHistory,
  resolveComposerHistoryNavigation,
} from "./composer-history.js";

test("recordSubmittedComposerHistory appends sent entries in order", () => {
  const history = recordSubmittedComposerHistory(
    [{ text: "first" }],
    { text: "second" },
  );

  assert.deepEqual(history, [
    { text: "first" },
    { text: "second" },
  ]);
});

test("resolveComposerHistoryNavigation enters history on up and captures the current draft", () => {
  const result = resolveComposerHistoryNavigation({
    entries: [
      { text: "alpha" },
      { text: "beta" },
    ],
    activeIndex: null,
    draftBeforeNavigation: null,
    currentDraft: { text: "draft" },
    direction: -1,
  });

  assert.equal(result.changed, true);
  assert.equal(result.nextActiveIndex, 1);
  assert.deepEqual(result.nextDraftBeforeNavigation, { text: "draft" });
  assert.deepEqual(result.draftToApply, { text: "beta" });
});

test("resolveComposerHistoryNavigation restores the saved draft when moving below the newest entry", () => {
  const result = resolveComposerHistoryNavigation({
    entries: [
      { text: "alpha" },
      { text: "beta" },
    ],
    activeIndex: 1,
    draftBeforeNavigation: { text: "draft" },
    currentDraft: { text: "ignored" },
    direction: 1,
  });

  assert.equal(result.changed, true);
  assert.equal(result.nextActiveIndex, null);
  assert.equal(result.nextDraftBeforeNavigation, null);
  assert.deepEqual(result.draftToApply, { text: "draft" });
});

test("resolveComposerHistoryNavigation walks older and newer entries while active", () => {
  const older = resolveComposerHistoryNavigation({
    entries: [
      { text: "alpha" },
      { text: "beta" },
      { text: "gamma" },
    ],
    activeIndex: 2,
    draftBeforeNavigation: { text: "draft" },
    currentDraft: { text: "ignored" },
    direction: -1,
  });

  assert.equal(older.nextActiveIndex, 1);
  assert.deepEqual(older.draftToApply, { text: "beta" });

  const newer = resolveComposerHistoryNavigation({
    entries: [
      { text: "alpha" },
      { text: "beta" },
      { text: "gamma" },
    ],
    activeIndex: 1,
    draftBeforeNavigation: { text: "draft" },
    currentDraft: { text: "ignored" },
    direction: 1,
  });

  assert.equal(newer.nextActiveIndex, 2);
  assert.deepEqual(newer.draftToApply, { text: "gamma" });
});

test("resolveComposerHistoryNavigation ignores impossible moves", () => {
  const downWithoutActive = resolveComposerHistoryNavigation({
    entries: [{ text: "alpha" }],
    activeIndex: null,
    draftBeforeNavigation: null,
    currentDraft: { text: "draft" },
    direction: 1,
  });
  assert.equal(downWithoutActive.changed, false);
  assert.equal(downWithoutActive.draftToApply, null);

  const upAtEarliest = resolveComposerHistoryNavigation({
    entries: [{ text: "alpha" }],
    activeIndex: 0,
    draftBeforeNavigation: { text: "draft" },
    currentDraft: { text: "ignored" },
    direction: -1,
  });
  assert.equal(upAtEarliest.changed, false);
  assert.equal(upAtEarliest.draftToApply, null);
});
