import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSelectedText,
  formatOsc52ClipboardSequence,
  getSelectionColumnsForRow,
  isTerminalTextSelectionCopySequence,
  isTextSelectionCopyInput,
  normalizeTextSelectionBounds,
  resolveNativeClipboardCommands,
  resolveSelectionAutoScrollDelta,
  resolveSelectablePoint,
  resolveTextSelectionClipboardCommands,
  resolveTranscriptSelectionPointFromViewport,
  splitTextBySelectionColumns,
  startTextSelection,
  updateTextSelection,
  wrapTerminalPassthroughSequence,
} from "./selection.js";

test("text selection normalizes anchor and focus in reading order", () => {
  const selection = updateTextSelection(
    startTextSelection("transcript", { row: 3, column: 8 }),
    "transcript",
    { row: 1, column: 2 },
  );

  assert.deepEqual(normalizeTextSelectionBounds(selection), {
    scope: "transcript",
    start: { row: 1, column: 2 },
    end: { row: 3, column: 8 },
  });
});

test("text selection ignores the first drag event when it stays on the anchor cell", () => {
  const started = startTextSelection("transcript", { row: 3, column: 8 });
  const tremor = updateTextSelection(started, "transcript", { row: 3, column: 8 });
  const moved = updateTextSelection(tremor, "transcript", { row: 3, column: 9 });
  const backToAnchor = updateTextSelection(moved, "transcript", { row: 3, column: 8 });

  assert.equal(tremor.focus, null);
  assert.deepEqual(moved.focus, { row: 3, column: 9 });
  assert.deepEqual(backToAnchor.focus, { row: 3, column: 8 });
});

test("text selection returns per-row inclusive cell ranges", () => {
  const selection = updateTextSelection(
    startTextSelection("transcript", { row: 1, column: 3 }),
    "transcript",
    { row: 3, column: 4 },
  );

  assert.deepEqual(getSelectionColumnsForRow(selection, 0, 20), null);
  assert.deepEqual(getSelectionColumnsForRow(selection, 1, 20), { startColumn: 3, endColumnExclusive: 20 });
  assert.deepEqual(getSelectionColumnsForRow(selection, 2, 20), { startColumn: 0, endColumnExclusive: 20 });
  assert.deepEqual(getSelectionColumnsForRow(selection, 3, 20), { startColumn: 0, endColumnExclusive: 5 });
  assert.deepEqual(getSelectionColumnsForRow(selection, 4, 20), null);
});

test("text selection splits a line at grapheme cell boundaries", () => {
  assert.deepEqual(
    splitTextBySelectionColumns("abcdef", { startColumn: 2, endColumnExclusive: 5 }),
    [
      { text: "ab", selected: false },
      { text: "cde", selected: true },
      { text: "f", selected: false },
    ],
  );
  assert.deepEqual(
    splitTextBySelectionColumns("a你b", { startColumn: 1, endColumnExclusive: 3 }),
    [
      { text: "a", selected: false },
      { text: "你", selected: true },
      { text: "b", selected: false },
    ],
  );
});

test("text selection extracts only selected transcript text", () => {
  const selection = updateTextSelection(
    startTextSelection("transcript", { row: 0, column: 2 }),
    "transcript",
    { row: 1, column: 3 },
  );

  assert.equal(extractSelectedText(["abcdef", "ghijkl"], selection), "cdef\nghij");
});

test("text selection extracts composer text independently from transcript", () => {
  const selection = updateTextSelection(
    startTextSelection("composer", { row: 0, column: 1 }),
    "composer",
    { row: 1, column: 2 },
  );

  assert.equal(extractSelectedText(["hello", "world"], selection), "ello\nwor");
});

test("selectable point resolver keeps transcript and composer regions separate", () => {
  assert.deepEqual(resolveSelectablePoint({ x: 5, y: 2 }, [
    { scope: "transcript", topRow: 1, rowCount: 3, leftColumn: 2 },
    { scope: "composer", topRow: 6, rowCount: 1, leftColumn: 5 },
  ]), {
    scope: "transcript",
    point: { row: 1, column: 3 },
  });

  assert.deepEqual(resolveSelectablePoint({ x: 8, y: 6 }, [
    { scope: "transcript", topRow: 1, rowCount: 3, leftColumn: 2 },
    { scope: "composer", topRow: 6, rowCount: 1, leftColumn: 5 },
  ]), {
    scope: "composer",
    point: { row: 0, column: 3 },
  });

  assert.equal(resolveSelectablePoint({ x: 4, y: 6 }, [
    { scope: "composer", topRow: 6, rowCount: 1, leftColumn: 5 },
  ]), null);
});

test("transcript edge auto-scroll is based on drag position only inside active transcript selection", () => {
  assert.equal(resolveSelectionAutoScrollDelta({
    active: true,
    scope: "transcript",
    pointerRow: 1,
    viewportRowCount: 10,
    scrollOffset: 2,
    maxScrollOffset: 20,
  }), 3);
  assert.equal(resolveSelectionAutoScrollDelta({
    active: true,
    scope: "transcript",
    pointerRow: 10,
    viewportRowCount: 10,
    scrollOffset: 2,
    maxScrollOffset: 20,
  }), -3);
  assert.equal(resolveSelectionAutoScrollDelta({
    active: true,
    scope: "composer",
    pointerRow: 10,
    viewportRowCount: 10,
    scrollOffset: 2,
    maxScrollOffset: 20,
  }), 0);
});

test("transcript selection point follows the visible transcript window after scroll", () => {
  assert.deepEqual(resolveTranscriptSelectionPointFromViewport({
    eventX: 8,
    eventY: 5,
    contentLeftColumn: 2,
    transcriptLineCount: 100,
    transcriptViewportLineCount: 20,
    scrollOffset: 0,
  }), {
    row: 84,
    column: 6,
  });

  assert.deepEqual(resolveTranscriptSelectionPointFromViewport({
    eventX: 8,
    eventY: 5,
    contentLeftColumn: 2,
    transcriptLineCount: 100,
    transcriptViewportLineCount: 20,
    scrollOffset: 9,
  }), {
    row: 75,
    column: 6,
  });
});

test("OSC 52 clipboard formatter encodes selected text", () => {
  assert.equal(formatOsc52ClipboardSequence("hello", {}), "\u001B]52;c;aGVsbG8=\u0007");
  assert.equal(
    formatOsc52ClipboardSequence("hello", { TMUX: "/tmp/tmux" }),
    "\u001BPtmux;\u001B\u001B]52;c;aGVsbG8=\u0007\u001B\\",
  );
  assert.equal(
    wrapTerminalPassthroughSequence("\u001B]52;c;x\u0007", { STY: "screen" }),
    "\u001BP\u001B]52;c;x\u0007\u001B\\",
  );
});

test("text selection copy input recognizes ctrl-c and terminal CSI-u copy sequences", () => {
  assert.equal(isTextSelectionCopyInput("c", { ctrl: true }), true);
  assert.equal(isTextSelectionCopyInput("C", { ctrl: true }), true);
  assert.equal(isTextSelectionCopyInput("\u0003", {}), true);
  assert.equal(isTextSelectionCopyInput("\u001B[99;6u", {}), true);
  assert.equal(isTextSelectionCopyInput("[99;6u", {}), true);
  assert.equal(isTextSelectionCopyInput("[99;5u", {}), true);
  assert.equal(isTextSelectionCopyInput("c", {}), false);
  assert.equal(isTerminalTextSelectionCopySequence("[99;6u"), true);
  assert.equal(isTerminalTextSelectionCopySequence("[13;2u"), false);
});

test("native clipboard command resolver uses local platform tools only outside ssh", () => {
  assert.deepEqual(resolveNativeClipboardCommands({ platform: "linux", env: {} }), [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ]);
  assert.deepEqual(resolveNativeClipboardCommands({ platform: "linux", env: { SSH_CONNECTION: "host" } }), []);
  assert.deepEqual(resolveNativeClipboardCommands({ platform: "darwin", env: {} }), [{ command: "pbcopy", args: [] }]);
  assert.deepEqual(resolveNativeClipboardCommands({ platform: "win32", env: {} }), [{ command: "clip", args: [] }]);
});

test("text selection clipboard command resolver loads tmux buffer before native tools", () => {
  assert.deepEqual(resolveTextSelectionClipboardCommands({
    platform: "linux",
    env: { TMUX: "/tmp/tmux", SSH_CONNECTION: "remote" },
  }), [
    { command: "tmux", args: ["load-buffer", "-w", "-"] },
  ]);

  assert.deepEqual(resolveTextSelectionClipboardCommands({
    platform: "linux",
    env: { TMUX: "/tmp/tmux", LC_TERMINAL: "iTerm2" },
  }), [
    { command: "tmux", args: ["load-buffer", "-"] },
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ]);
});
