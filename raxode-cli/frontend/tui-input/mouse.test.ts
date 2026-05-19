import assert from "node:assert/strict";
import test from "node:test";

import {
  DISABLE_TERMINAL_ALTERNATE_SCROLL,
  DISABLE_TERMINAL_MOUSE_CAPTURE,
  DISABLE_TERMINAL_MOUSE_SELECTION_CAPTURE,
  DISABLE_TERMINAL_MOUSE_REPORTING,
  ENABLE_TERMINAL_ALTERNATE_SCROLL,
  ENABLE_TERMINAL_MOUSE_CAPTURE,
  ENABLE_TERMINAL_MOUSE_SELECTION_CAPTURE,
  ENABLE_TERMINAL_MOUSE_REPORTING,
  enableTerminalMouseReporting,
  isTerminalMouseInput,
  parseMouseScrollDelta,
  parseTerminalMouseEvents,
  resolveTerminalMouseReportingMode,
  shouldEnableTerminalMouseReporting,
} from "./mouse.js";

test("mouse scroll parser accepts SGR reports with or without ESC prefix", () => {
  assert.equal(parseMouseScrollDelta("\u001B[<64;20;5M"), 3);
  assert.equal(parseMouseScrollDelta("[<65;20;5M"), -3);
  assert.equal(parseMouseScrollDelta("\u001B[<80;20;5M"), 3);
  assert.equal(parseMouseScrollDelta("\u001B[<81;20;5M"), -3);
  assert.equal(parseMouseScrollDelta("<64;20;5M<64;20;5M"), 6);
  assert.equal(parseMouseScrollDelta("plain text"), null);
});

test("mouse parser normalizes SGR click events", () => {
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<0;12;9M"), [{
    kind: "click",
    button: "left",
    pressed: true,
    x: 12,
    y: 9,
    rawCode: 0,
  }]);
  assert.deepEqual(parseTerminalMouseEvents("[<2;14;10m"), [{
    kind: "click",
    button: "right",
    pressed: false,
    x: 14,
    y: 10,
    rawCode: 2,
  }]);
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<35;12;9m"), [{
    kind: "click",
    button: "left",
    pressed: false,
    x: 12,
    y: 9,
    rawCode: 35,
  }]);
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<3;12;9m"), [{
    kind: "click",
    button: "left",
    pressed: false,
    x: 12,
    y: 9,
    rawCode: 3,
  }]);
});

test("mouse parser normalizes SGR drag events", () => {
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<32;12;9M"), [{
    kind: "drag",
    button: "left",
    x: 12,
    y: 9,
    rawCode: 32,
  }]);
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<34;14;10M"), [{
    kind: "drag",
    button: "right",
    x: 14,
    y: 10,
    rawCode: 34,
  }]);
});

test("mouse parser preserves coordinates for mixed scroll and click batches", () => {
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<64;20;5M\u001B[<0;3;7M"), [{
    kind: "scroll",
    delta: 3,
    x: 20,
    y: 5,
    rawCode: 64,
  }, {
    kind: "click",
    button: "left",
    pressed: true,
    x: 3,
    y: 7,
    rawCode: 0,
  }]);
});

test("mouse input detector filters complete SGR mouse reports", () => {
  assert.equal(isTerminalMouseInput("\u001B[<0;12;9M"), true);
  assert.equal(isTerminalMouseInput("[<0;12;9M"), true);
  assert.equal(isTerminalMouseInput("hello[<0;12;9M"), false);
  assert.equal(isTerminalMouseInput("plain text"), false);
});

test("terminal mouse reporting is opt-in so native terminal drag selection works by default", () => {
  assert.equal(shouldEnableTerminalMouseReporting({}), false);
  assert.equal(shouldEnableTerminalMouseReporting({}, { defaultEnabled: true }), true);
  assert.equal(resolveTerminalMouseReportingMode({}, { defaultEnabled: true }), "capture");
  assert.equal(resolveTerminalMouseReportingMode({}, { defaultEnabled: true, defaultMode: "alternate-scroll" }), "alternate-scroll");
  assert.equal(shouldEnableTerminalMouseReporting({ RAXODE_ENABLE_MOUSE: "1" }), true);
  assert.equal(shouldEnableTerminalMouseReporting({ RAXODE_ENABLE_MOUSE: "capture" }), true);
  assert.equal(resolveTerminalMouseReportingMode({ RAXODE_ENABLE_MOUSE: "managed-selection" }), "managed-selection");
  assert.equal(resolveTerminalMouseReportingMode({ RAXODE_ENABLE_MOUSE: "wheel" }), "alternate-scroll");
  assert.equal(resolveTerminalMouseReportingMode({ RAXODE_ENABLE_MOUSE: "selection" }), "alternate-scroll");
  assert.equal(shouldEnableTerminalMouseReporting({ RAXODE_ENABLE_MOUSE: "0" }), false);
  assert.equal(shouldEnableTerminalMouseReporting({ RAXODE_ENABLE_MOUSE: "0" }, { defaultEnabled: true }), false);
});

test("terminal mouse reporting writes enable and cleanup sequences for tty outputs", () => {
  const previous = process.env.RAXODE_ENABLE_MOUSE;
  process.env.RAXODE_ENABLE_MOUSE = "1";
  const writes: string[] = [];
  try {
    const cleanup = enableTerminalMouseReporting({
      isTTY: true,
      write: (chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      },
    });
    cleanup();
  } finally {
    if (previous === undefined) {
      delete process.env.RAXODE_ENABLE_MOUSE;
    } else {
      process.env.RAXODE_ENABLE_MOUSE = previous;
    }
  }
  assert.deepEqual(writes, [
    ENABLE_TERMINAL_MOUSE_REPORTING,
    DISABLE_TERMINAL_MOUSE_REPORTING,
  ]);
  assert.equal(ENABLE_TERMINAL_MOUSE_REPORTING, ENABLE_TERMINAL_MOUSE_CAPTURE);
  assert.equal(DISABLE_TERMINAL_MOUSE_REPORTING, DISABLE_TERMINAL_MOUSE_CAPTURE);
});

test("terminal mouse reporting can be enabled by a caller default", () => {
  const previous = process.env.RAXODE_ENABLE_MOUSE;
  delete process.env.RAXODE_ENABLE_MOUSE;
  const writes: string[] = [];
  try {
    const cleanup = enableTerminalMouseReporting({
      isTTY: true,
      write: (chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      },
    }, { defaultEnabled: true });
    cleanup();
  } finally {
    if (previous === undefined) {
      delete process.env.RAXODE_ENABLE_MOUSE;
    } else {
      process.env.RAXODE_ENABLE_MOUSE = previous;
    }
  }
  assert.deepEqual(writes, [
    ENABLE_TERMINAL_MOUSE_REPORTING,
    DISABLE_TERMINAL_MOUSE_REPORTING,
  ]);
});

test("terminal alternate scroll mode avoids app-level click capture", () => {
  const previous = process.env.RAXODE_ENABLE_MOUSE;
  delete process.env.RAXODE_ENABLE_MOUSE;
  const writes: string[] = [];
  try {
    const cleanup = enableTerminalMouseReporting({
      isTTY: true,
      write: (chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      },
    }, { defaultEnabled: true, defaultMode: "alternate-scroll" });
    cleanup();
  } finally {
    if (previous === undefined) {
      delete process.env.RAXODE_ENABLE_MOUSE;
    } else {
      process.env.RAXODE_ENABLE_MOUSE = previous;
    }
  }
  assert.deepEqual(writes, [
    ENABLE_TERMINAL_ALTERNATE_SCROLL,
    DISABLE_TERMINAL_ALTERNATE_SCROLL,
  ]);
});

test("terminal managed selection mode enables button motion reports", () => {
  const previous = process.env.RAXODE_ENABLE_MOUSE;
  process.env.RAXODE_ENABLE_MOUSE = "managed-selection";
  const writes: string[] = [];
  try {
    const cleanup = enableTerminalMouseReporting({
      isTTY: true,
      write: (chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      },
    });
    cleanup();
  } finally {
    if (previous === undefined) {
      delete process.env.RAXODE_ENABLE_MOUSE;
    } else {
      process.env.RAXODE_ENABLE_MOUSE = previous;
    }
  }
  assert.deepEqual(writes, [
    ENABLE_TERMINAL_MOUSE_SELECTION_CAPTURE,
    DISABLE_TERMINAL_MOUSE_SELECTION_CAPTURE,
  ]);
});

test("terminal mouse reporting does not write sequences for non-tty outputs", () => {
  const writes: string[] = [];
  const cleanup = enableTerminalMouseReporting({
    isTTY: false,
    write: (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  });
  cleanup();
  assert.deepEqual(writes, []);
});
