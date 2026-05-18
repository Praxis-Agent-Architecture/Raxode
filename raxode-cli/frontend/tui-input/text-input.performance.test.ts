import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  applyTuiTextInputKey,
  createTuiTextInputState,
  insertIntoTuiTextInput,
} from "./text-input.js";

test("text input keeps repeated backspace on the fast path", () => {
  let state = createTuiTextInputState();
  const sample = "raxode ".repeat(1_000);
  state = insertIntoTuiTextInput(state, sample);

  const startedAt = performance.now();
  for (let index = 0; index < sample.length; index += 1) {
    const result = applyTuiTextInputKey(state, "\u007f", {
      backspace: true,
    } as never);
    assert.equal(result.handled, true);
    state = result.nextState;
  }
  const elapsedMs = performance.now() - startedAt;

  assert.equal(state.value, "");
  assert.ok(elapsedMs < 120, `expected repeated backspace to stay fast, took ${elapsedMs.toFixed(2)}ms`);
});

test("text input ignores terminal mouse reports instead of inserting them", () => {
  const state = createTuiTextInputState("hello");
  const result = applyTuiTextInputKey(state, "[<0;5;32M", {} as never);
  assert.equal(result.handled, true);
  assert.equal(result.nextState.value, "hello");
});
