import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTuiTextInputKey,
  createTuiTextInputState,
} from "./text-input.js";

test("applyTuiTextInputKey inserts newline for ctrl+j and shift+enter", () => {
  let state = createTuiTextInputState("hello");

  const ctrlJ = applyTuiTextInputKey(state, "j", { ctrl: true } as never);
  assert.equal(ctrlJ.submit, false);
  assert.equal(ctrlJ.handled, true);
  assert.equal(ctrlJ.nextState.value, "hello\n");

  state = createTuiTextInputState("hello");
  const shiftEnter = applyTuiTextInputKey(state, "", { return: true, shift: true } as never);
  assert.equal(shiftEnter.submit, false);
  assert.equal(shiftEnter.handled, true);
  assert.equal(shiftEnter.nextState.value, "hello\n");

  for (const sequence of [
    "\u001B[13;2u",
    "\u001B[13;2~",
    "\u001B[27;2;13~",
    "[13;2u",
    "[13;2~",
    "[27;2;13~",
  ]) {
    state = createTuiTextInputState("hello");
    const terminalShiftEnter = applyTuiTextInputKey(state, sequence, {} as never);
    assert.equal(terminalShiftEnter.submit, false);
    assert.equal(terminalShiftEnter.handled, true);
    assert.equal(terminalShiftEnter.nextState.value, "hello\n");
  }
});
