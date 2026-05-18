import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDirectTuiSessionExitSummary,
  estimateDirectTuiUsagePriceUsd,
  formatDirectTuiPercent,
  formatDirectTuiTokenCount,
  formatDirectTuiUsd,
} from "./direct-session-summary.js";

test("direct session summary aggregates usage totals and resume selector", () => {
  const summary = buildDirectTuiSessionExitSummary({
    snapshot: {
      sessionId: "direct-100",
      name: "alpha",
      usageLedger: [
        {
          requestId: "turn:1",
          kind: "core_turn",
          provider: "openai",
          model: "gpt-5.4",
          status: "success",
          inputTokens: 2_000_000,
          cachedInputTokens: 1_800_000,
          outputTokens: 500_000,
          thinkingTokens: 100_000,
          startedAt: "2026-04-16T00:00:00.000Z",
          endedAt: "2026-04-16T00:00:01.000Z",
        },
        {
          requestId: "turn:2",
          kind: "core_turn",
          provider: "openai",
          model: "gpt-5.4-mini",
          status: "failed",
          inputTokens: 1_000_000,
          cachedInputTokens: 500_000,
          outputTokens: 250_000,
          startedAt: "2026-04-16T00:00:02.000Z",
          endedAt: "2026-04-16T00:00:03.000Z",
          estimated: true,
        },
      ],
    },
    sessions: [
      { sessionId: "direct-100", name: "alpha" },
      { sessionId: "direct-200", name: "beta" },
    ],
    generatedAt: "2026-04-16T00:00:04.000Z",
  });

  assert.equal(summary.inputTokens, 3_000_000);
  assert.equal(summary.outputTokens, 750_000);
  assert.equal(summary.thinkingTokens, 100_000);
  assert.equal(summary.requestCount, 2);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.successRate, 0.5);
  assert.equal(summary.averageCacheHitRate, 2_300_000 / 3_000_000);
  assert.equal(summary.resumeSelector, "alpha");
  assert.equal(summary.estimatedPrice, true);
  assert.equal(summary.totalPriceUsd, 8.8);
});

test("direct session summary prefers internal model-call usage over aggregate turn usage", () => {
  const summary = buildDirectTuiSessionExitSummary({
    snapshot: {
      sessionId: "direct-model-ledger",
      name: "model ledger",
      usageLedger: [
        {
          requestId: "turn:1",
          kind: "core_turn",
          provider: "openai",
          model: "gpt-5.4",
          status: "success",
          inputTokens: 1000,
          cachedInputTokens: 900,
          outputTokens: 100,
          thinkingTokens: 50,
          startedAt: "2026-04-16T00:00:00.000Z",
          endedAt: "2026-04-16T00:00:01.000Z",
        },
        {
          requestId: "model:1",
          kind: "core_model",
          provider: "openai",
          model: "gpt-5.4",
          status: "success",
          inputTokens: 600,
          cachedInputTokens: 300,
          outputTokens: 40,
          thinkingTokens: 10,
          startedAt: "2026-04-16T00:00:00.000Z",
          endedAt: "2026-04-16T00:00:01.000Z",
        },
        {
          requestId: "model:2",
          kind: "core_model",
          provider: "openai",
          model: "gpt-5.4",
          status: "success",
          inputTokens: 400,
          cachedInputTokens: 100,
          outputTokens: 60,
          thinkingTokens: 20,
          startedAt: "2026-04-16T00:00:01.000Z",
          endedAt: "2026-04-16T00:00:02.000Z",
        },
      ],
    },
    sessions: [{ sessionId: "direct-model-ledger", name: "model ledger" }],
    generatedAt: "2026-04-16T00:00:04.000Z",
  });

  assert.equal(summary.inputTokens, 1000);
  assert.equal(summary.outputTokens, 100);
  assert.equal(summary.thinkingTokens, 30);
  assert.equal(summary.requestCount, 1);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.successRate, 1);
  assert.equal(summary.modelRequestCount, 2);
  assert.equal(summary.modelSuccessCount, 2);
  assert.equal(summary.modelSuccessRate, 1);
  assert.equal(summary.averageCacheHitRate, 0.4);
});

test("direct session summary separates turn success from model request success", () => {
  const summary = buildDirectTuiSessionExitSummary({
    snapshot: {
      sessionId: "direct-failed-final-turn",
      name: "failed final turn",
      usageLedger: [
        {
          requestId: "turn:1",
          kind: "core_turn",
          provider: "openai",
          model: "gpt-5.4",
          status: "success",
          inputTokens: 1200,
          outputTokens: 120,
          startedAt: "2026-05-16T00:00:00.000Z",
          endedAt: "2026-05-16T00:00:01.000Z",
        },
        {
          requestId: "model:1",
          kind: "core_model",
          provider: "openai",
          model: "gpt-5.4",
          status: "success",
          inputTokens: 900,
          cachedInputTokens: 720,
          outputTokens: 80,
          startedAt: "2026-05-16T00:00:00.000Z",
          endedAt: "2026-05-16T00:00:01.000Z",
        },
        {
          requestId: "model:2",
          kind: "core_model",
          provider: "openai",
          model: "gpt-5.4",
          status: "success",
          inputTokens: 1100,
          cachedInputTokens: 990,
          outputTokens: 70,
          startedAt: "2026-05-16T00:00:02.000Z",
          endedAt: "2026-05-16T00:00:03.000Z",
        },
        {
          requestId: "turn:2",
          kind: "core_turn",
          provider: "openai",
          model: "gpt-5.4",
          status: "failed",
          estimated: true,
          errorCode: "PROVIDER_UNAVAILABLE",
          startedAt: "2026-05-16T00:00:02.000Z",
          endedAt: "2026-05-16T00:00:03.000Z",
        },
      ],
    },
    sessions: [{ sessionId: "direct-failed-final-turn", name: "failed final turn" }],
    generatedAt: "2026-05-16T00:00:04.000Z",
  });

  assert.equal(summary.inputTokens, 2000);
  assert.equal(summary.outputTokens, 150);
  assert.equal(summary.requestCount, 2);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.successRate, 0.5);
  assert.equal(summary.modelRequestCount, 2);
  assert.equal(summary.modelSuccessCount, 2);
  assert.equal(summary.modelSuccessRate, 1);
  assert.equal(summary.averageCacheHitRate, 1710 / 2000);
});

test("pricing helpers format session values for the exit panel", () => {
  assert.equal(estimateDirectTuiUsagePriceUsd({
    provider: "openai",
    model: "gpt-5.4",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }), 10);
  assert.equal(formatDirectTuiTokenCount(1234567), "1,234,567");
  assert.equal(formatDirectTuiPercent(0.9832), "98.32%");
  assert.equal(formatDirectTuiUsd(42.5), "$42.50");
  assert.equal(formatDirectTuiUsd(undefined), "N/A");
});
