import assert from "node:assert/strict";
import test from "node:test";

import {
  DISABLE_TERMINAL_BRACKETED_PASTE,
  ENABLE_TERMINAL_BRACKETED_PASTE,
  consumeBracketedPasteInput,
  enableTerminalBracketedPaste,
  isTerminalPasteShortcutInput,
} from "./paste.js";

test("paste shortcut recognizes ctrl-v and terminal CSI-u paste sequences", () => {
  assert.equal(isTerminalPasteShortcutInput("v", { ctrl: true }), true);
  assert.equal(isTerminalPasteShortcutInput("V", { ctrl: true }), true);
  assert.equal(isTerminalPasteShortcutInput("\u0016", {}), true);
  assert.equal(isTerminalPasteShortcutInput("\u001B[118;6u", {}), true);
  assert.equal(isTerminalPasteShortcutInput("[118;6u", {}), true);
  assert.equal(isTerminalPasteShortcutInput("[118;5u", {}), true);
  assert.equal(isTerminalPasteShortcutInput("v", {}), false);
});

test("bracketed paste consumer extracts a complete paste payload", () => {
  const state = { active: false };
  assert.deepEqual(consumeBracketedPasteInput("\u001B[200~1\n1\n1\u001B[201~", state), {
    handled: true,
    text: "1\n1\n1",
  });
  assert.equal(state.active, false);
});

test("bracketed paste consumer aggregates split paste chunks", () => {
  const state = { active: false };
  assert.deepEqual(consumeBracketedPasteInput("\u001B[200~1\n", state), {
    handled: true,
    text: "1\n",
  });
  assert.equal(state.active, true);
  assert.deepEqual(consumeBracketedPasteInput("1\n1\u001B[201~", state), {
    handled: true,
    text: "1\n1",
  });
  assert.equal(state.active, false);
});

test("terminal bracketed paste mode writes enable and cleanup sequences for tty outputs", () => {
  const writes: string[] = [];
  const cleanup = enableTerminalBracketedPaste({
    isTTY: true,
    write: (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  });
  cleanup();
  assert.deepEqual(writes, [
    ENABLE_TERMINAL_BRACKETED_PASTE,
    DISABLE_TERMINAL_BRACKETED_PASTE,
  ]);
});
