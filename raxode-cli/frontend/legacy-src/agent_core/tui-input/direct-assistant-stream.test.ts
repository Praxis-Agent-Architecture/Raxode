import assert from "node:assert/strict";
import test from "node:test";

import { createDirectTuiAssistantStreamCoalescer } from "./direct-assistant-stream.js";

test("assistant stream coalescer emits first update and queues rapid follow-ups", async () => {
  let nowMs = 0;
  const emitted: string[] = [];
  const coalescer = createDirectTuiAssistantStreamCoalescer<string>({
    intervalMs: 30,
    now: () => nowMs,
    emit: (update) => {
      emitted.push(update.decodedText);
    },
  });

  coalescer.push({ turnId: "turn-1", decodedText: "a", payload: "a" });
  nowMs = 5;
  coalescer.push({ turnId: "turn-1", decodedText: "ab", payload: "ab" });
  nowMs = 10;
  coalescer.push({ turnId: "turn-1", decodedText: "abc", payload: "abc" });

  assert.deepEqual(emitted, ["a"]);

  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.deepEqual(emitted, ["a", "abc"]);
});

test("assistant stream coalescer force flushes pending update immediately", () => {
  let nowMs = 0;
  const emitted: string[] = [];
  const coalescer = createDirectTuiAssistantStreamCoalescer<string>({
    intervalMs: 1000,
    now: () => nowMs,
    emit: (update) => {
      emitted.push(update.decodedText);
    },
  });

  coalescer.push({ turnId: "turn-1", decodedText: "a", payload: "a" });
  nowMs = 5;
  coalescer.push({ turnId: "turn-1", decodedText: "ab", payload: "ab" });
  coalescer.flushTurn("turn-1");

  assert.deepEqual(emitted, ["a", "ab"]);
});
