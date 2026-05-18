import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCmpViewerHints,
  cycleCmpViewerSubtab,
  resolveCmpViewerSubtab,
} from "./cmp-viewer-subtabs.js";

test("cmp viewer subtabs default to summary and cycle to records", () => {
  assert.equal(resolveCmpViewerSubtab(undefined), "summary");
  assert.equal(resolveCmpViewerSubtab("records"), "records");
  assert.equal(cycleCmpViewerSubtab("summary"), "records");
  assert.equal(cycleCmpViewerSubtab("records"), "summary");
});

test("cmp viewer hints reflect summary vs records navigation", () => {
  assert.deepEqual(buildCmpViewerHints("summary"), [
    "press TAB to switch panel",
    "press ← to scroll left • press → to scroll right",
    "press ENTER to refresh current CMP summary",
    "press ESC to return to previous page",
  ]);
  assert.deepEqual(buildCmpViewerHints("records"), [
    "press TAB to switch panel",
    "press ← to previous page • press → to next page",
    "press ENTER to refresh current CMP summary",
    "press ESC to return to previous page",
  ]);
});
