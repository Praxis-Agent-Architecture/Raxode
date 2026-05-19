import assert from "node:assert/strict";
import test from "node:test";

import {
  consumePendingOutboundTurnEntry,
  resolveCommittedUserMessageId,
} from "./pending-outbound-turn.js";

test("resolveCommittedUserMessageId reuses optimistic message identity when available", () => {
  assert.equal(
    resolveCommittedUserMessageId({
      turnId: "turn-8",
      pendingOutboundTurn: {
        messageId: "user:turn-7",
      },
    }),
    "user:turn-7",
  );
});

test("resolveCommittedUserMessageId falls back to the runtime turn id when no optimistic entry exists", () => {
  assert.equal(
    resolveCommittedUserMessageId({
      turnId: "turn-8",
      pendingOutboundTurn: null,
    }),
    "user:turn-8",
  );
});

test("consumePendingOutboundTurnEntry prefers an exact turn id match", () => {
  const result = consumePendingOutboundTurnEntry({
    entries: [
      { turnId: "turn-7", turnIndex: 7, messageId: "user:turn-7", userText: "alpha" },
      { turnId: "turn-8", turnIndex: 8, messageId: "user:turn-8", userText: "beta" },
    ],
    turnId: "turn-8",
    turnIndex: 99,
    userText: "alpha",
  });

  assert.equal(result.matched?.messageId, "user:turn-8");
  assert.deepEqual(result.remaining.map((entry) => entry.turnId), ["turn-7"]);
});

test("consumePendingOutboundTurnEntry can recover by unique user text when the turn id drifted", () => {
  const result = consumePendingOutboundTurnEntry({
    entries: [
      { turnId: "turn-7", turnIndex: 7, messageId: "user:turn-7", userText: "主要介绍你的能力" },
    ],
    turnId: "turn-8",
    turnIndex: 8,
    userText: "主要介绍你的能力",
  });

  assert.equal(result.matched?.messageId, "user:turn-7");
  assert.equal(result.remaining.length, 0);
});

test("consumePendingOutboundTurnEntry refuses an ambiguous repeated-text fallback", () => {
  const result = consumePendingOutboundTurnEntry({
    entries: [
      { turnId: "turn-7", turnIndex: 7, messageId: "user:turn-7", userText: "nihao" },
      { turnId: "turn-8", turnIndex: 8, messageId: "user:turn-8", userText: "nihao" },
    ],
    turnId: "turn-9",
    turnIndex: 9,
    userText: "nihao",
  });

  assert.equal(result.matched, null);
  assert.deepEqual(result.remaining.map((entry) => entry.turnId), ["turn-7", "turn-8"]);
});
