import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTuiTextInputKey,
  createTuiTextInputState,
  deleteBackwardInTuiTextInput,
  deleteForwardInTuiTextInput,
  isBackwardDeleteInput,
  insertIntoTuiTextInput,
  moveTuiTextInputCursorDown,
  moveTuiTextInputCursorLeft,
  moveTuiTextInputCursorUp,
  renderTuiTextInputCursor,
  setTuiTextInputValue,
} from "./text-input.js";

test("insertIntoTuiTextInput inserts at cursor position", () => {
  const seeded = setTuiTextInputValue(createTuiTextInputState("hello"), "hello", 2);
  const next = insertIntoTuiTextInput(seeded, "X");
  assert.equal(next.value, "heXllo");
  assert.equal(next.cursorOffset, 3);
});

test("moveTuiTextInputCursorLeft respects grapheme boundaries", () => {
  const seeded = setTuiTextInputValue(createTuiTextInputState("a你b"), "a你b", "a你".length);
  const next = moveTuiTextInputCursorLeft(seeded);
  assert.equal(next.cursorOffset, 1);
});

test("deleteBackwardInTuiTextInput removes previous grapheme", () => {
  const seeded = setTuiTextInputValue(createTuiTextInputState("你好a"), "你好a", "你好".length);
  const next = deleteBackwardInTuiTextInput(seeded);
  assert.equal(next.value, "你a");
  assert.equal(next.cursorOffset, 1);
});

test("deleteBackwardInTuiTextInput keeps unicode grapheme semantics on fast path", () => {
  const cjk = deleteBackwardInTuiTextInput(createTuiTextInputState("你好"));
  assert.equal(cjk.value, "你");
  assert.equal(cjk.cursorOffset, "你".length);

  const combining = deleteBackwardInTuiTextInput(createTuiTextInputState("e\u0301x"));
  assert.equal(combining.value, "e\u0301");

  const emoji = deleteBackwardInTuiTextInput(createTuiTextInputState("a🙂"));
  assert.equal(emoji.value, "a");
  assert.equal(emoji.cursorOffset, 1);
});

test("deleteBackwardInTuiTextInput removes special tokens as a whole", () => {
  const value = "hello [Image #1] world";
  const seeded = setTuiTextInputValue(createTuiTextInputState(value), value, "hello [Image #1]".length);
  const next = deleteBackwardInTuiTextInput(seeded);

  assert.equal(next.value, "hello  world");
  assert.equal(next.cursorOffset, "hello ".length);
});

test("deleteForwardInTuiTextInput removes pasted content token as a whole", () => {
  const value = "[Pasted Content #1 with 2600 characters] tail";
  const state = setTuiTextInputValue(createTuiTextInputState(value), value, 0);
  const next = deleteForwardInTuiTextInput(state);

  assert.equal(next.value, " tail");
  assert.equal(next.cursorOffset, 0);
});

test("renderTuiTextInputCursor returns cursor block at end of line", () => {
  const rendered = renderTuiTextInputCursor(createTuiTextInputState("abc"));
  assert.deepEqual(rendered, {
    before: "abc",
    cursor: " ",
    after: "",
  });
});

test("applyTuiTextInputKey handles left/right insertion and submit", () => {
  let state = createTuiTextInputState("hello");
  state = applyTuiTextInputKey(state, "", { leftArrow: true } as never).nextState;
  state = applyTuiTextInputKey(state, "X", {} as never).nextState;
  assert.equal(state.value, "hellXo");

  const submit = applyTuiTextInputKey(state, "", { return: true } as never);
  assert.equal(submit.submit, true);
  assert.equal(submit.handled, true);
});

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

test("applyTuiTextInputKey treats delete/backspace style keys as backward delete", () => {
  let state = createTuiTextInputState("hello");
  state = applyTuiTextInputKey(state, "\u007f", {} as never).nextState;
  assert.equal(state.value, "hell");

  state = applyTuiTextInputKey(state, "", { delete: true } as never).nextState;
  assert.equal(state.value, "hel");

  state = applyTuiTextInputKey(state, "o", {} as never).nextState;
  assert.equal(state.value, "helo");

  state = applyTuiTextInputKey(state, "h", { ctrl: true } as never).nextState;
  assert.equal(state.value, "hel");
});

test("applyTuiTextInputKey treats ctrl+d as forward delete", () => {
  let state = setTuiTextInputValue(createTuiTextInputState("hello"), "hello", 2);
  state = applyTuiTextInputKey(state, "d", { ctrl: true } as never).nextState;
  assert.equal(state.value, "helo");
  assert.equal(state.cursorOffset, 2);
});

test("isBackwardDeleteInput recognizes backspace-style input paths", () => {
  assert.equal(isBackwardDeleteInput("", { backspace: true } as never), true);
  assert.equal(isBackwardDeleteInput("", { delete: true } as never), true);
  assert.equal(isBackwardDeleteInput("h", { ctrl: true } as never), true);
  assert.equal(isBackwardDeleteInput("\u007f", {} as never), true);
  assert.equal(isBackwardDeleteInput("\b", {} as never), true);
  assert.equal(isBackwardDeleteInput("x", {} as never), false);
});

test("vertical cursor movement preserves approximate visual column across lines", () => {
  let state = createTuiTextInputState("abcd\nxy\n12345");
  state = setTuiTextInputValue(state, state.value, 3);
  state = moveTuiTextInputCursorDown(state);
  assert.equal(state.cursorOffset, "abcd\nxy".length);

  state = moveTuiTextInputCursorDown(state);
  assert.equal(state.cursorOffset, "abcd\nxy\n12".length);

  state = moveTuiTextInputCursorUp(state);
  assert.equal(state.cursorOffset, "abcd\nxy".length);
});
