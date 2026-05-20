import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve("automations/raxode-cache-xray.mjs");

test("raxode-cache-xray prints help without treating --help as a log path", async () => {
  const result = await execFileAsync(process.execPath, [scriptPath, "--help"], {
    cwd: path.resolve("."),
  });

  assert.match(result.stdout, /Usage: node automations\/raxode-cache-xray\.mjs/u);
  assert.match(result.stdout, /--latest/u);
});

test("raxode-cache-xray explains cache shape, observed usage, comparison, and tool-result budget", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "raxode-cache-xray-"));
  const logPath = path.join(dir, "legacy-direct-application-test.jsonl");
  const rows = [
    {
      event: "stage_end",
      stage: "core/model.infer",
      usage: { inputTokens: 100, cachedInputTokens: 60, outputTokens: 5, thinkingTokens: 1 },
      resultMetadata: {
        previousProviderResponseId: "resp-before",
        providerResponseId: "resp-now",
      },
      context: {
        contextSource: "provider.model-call.usage",
        lastRequestInputTokens: 100,
        promptTokens: 100,
        usableInputTokens: 258400,
      },
      cacheDebug: {
        kind: "praxis.modelCall.cacheDebug",
        promptPack: { totalEstimatedTokens: 20, renderedTextEstimatedTokens: 24, cacheablePrefixEstimatedTokens: 18, dynamicEstimatedTokens: 2, segments: [] },
        providerBody: {
          estimatedTokens: 130,
          inputEstimatedTokens: 70,
          toolsEstimatedTokens: 40,
          toolCount: 178,
          previousProviderOutputItems: 0,
          toolResultInputs: 0,
          fingerprints: { bodyHash: "a".repeat(64), toolsHash: "b".repeat(64), inputHash: "c".repeat(64) },
          cacheShape: {
            providerStablePrefixEstimatedTokens: 58,
            providerDynamicInputEstimatedTokens: 70,
            stablePrefixShare: 0.4462,
            dynamicInputShare: 0.5385,
            stablePrefixHash: "d".repeat(64),
            dynamicPayloadHash: "e".repeat(64),
          },
          toolResultBudget: {
            budgetBytes: 131072,
            originalToolResultBytes: 200000,
            replayedToolResultBytes: 120000,
            fullToolResults: 3,
            compactedToolResults: 5,
          },
        },
        observedUsage: {
          inputTokens: 100,
          cachedInputTokens: 60,
          nonCachedInputTokens: 40,
          cacheHitRate: 0.6,
          stablePrefixWarmthEstimate: 1.0345,
          diagnosis: "dynamic-payload-dominates",
          reasons: ["non-cached dynamic payload is large enough"],
        },
        comparisonToPrevious: {
          stablePrefixChanged: false,
          dynamicPayloadChanged: true,
          instructionsChanged: false,
          toolsChanged: false,
          changedFingerprintKeys: ["inputHash"],
        },
      },
    },
  ];
  await writeFile(logPath, rows.map((row) => JSON.stringify(row)).join("\n"), "utf8");

  const result = await execFileAsync(process.execPath, [scriptPath, logPath], {
    cwd: path.resolve("."),
  });

  assert.match(result.stdout, /diagnosis: dynamic-payload-dominates/u);
  assert.match(result.stdout, /stable prefix: ~58/u);
  assert.match(result.stdout, /provider response: previous=resp-before current=resp-now/u);
  assert.match(result.stdout, /tool result budget: original=200000B replayed=120000B/u);
  assert.match(result.stdout, /comparison: stablePrefixChanged=false dynamicPayloadChanged=true/u);
  assert.match(result.stdout, /weighted cache hit: 60%/u);
});

test("raxode-cache-xray can require new telemetry fields for live validation", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "raxode-cache-xray-old-"));
  const logPath = path.join(dir, "legacy-direct-application-old.jsonl");
  await writeFile(logPath, JSON.stringify({
    event: "stage_end",
    stage: "core/model.infer",
    usage: { inputTokens: 100, cachedInputTokens: 50 },
    cacheDebug: {
      kind: "praxis.modelCall.cacheDebug",
      promptPack: { segments: [] },
      providerBody: { fingerprints: {} },
    },
  }), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, logPath, "--require-new-telemetry"], {
      cwd: path.resolve("."),
    }),
    (error) => {
      assert.equal(error.code, 3);
      assert.match(error.stderr, /Missing new cache telemetry/u);
      return true;
    },
  );
});

test("raxode-cache-xray requires adjacent comparison after the first model row", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "raxode-cache-xray-comparison-"));
  const logPath = path.join(dir, "legacy-direct-application-no-comparison.jsonl");
  const cacheDebug = {
    kind: "praxis.modelCall.cacheDebug",
    promptPack: { segments: [] },
    providerBody: {
      fingerprints: { bodyHash: "a".repeat(64), toolsHash: "b".repeat(64), inputHash: "c".repeat(64) },
      cacheShape: {
        providerStablePrefixEstimatedTokens: 50,
        providerDynamicInputEstimatedTokens: 5,
        stablePrefixShare: 0.9,
        dynamicInputShare: 0.1,
        stablePrefixHash: "d".repeat(64),
        dynamicPayloadHash: "e".repeat(64),
      },
      toolResultBudget: {
        budgetBytes: 131072,
        originalToolResultBytes: 0,
        replayedToolResultBytes: 0,
        fullToolResults: 0,
        compactedToolResults: 0,
      },
    },
    observedUsage: {
      inputTokens: 100,
      cachedInputTokens: 90,
      diagnosis: "warm-stable-prefix",
      reasons: ["warm"],
    },
  };
  await writeFile(logPath, [
    JSON.stringify({ event: "stage_end", stage: "core/model.infer", usage: { inputTokens: 100, cachedInputTokens: 90 }, cacheDebug }),
    JSON.stringify({ event: "stage_end", stage: "core/model.infer", usage: { inputTokens: 101, cachedInputTokens: 91 }, cacheDebug }),
  ].join("\n"), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, logPath, "--require-new-telemetry"], {
      cwd: path.resolve("."),
    }),
    (error) => {
      assert.equal(error.code, 3);
      assert.match(error.stderr, /Missing new cache telemetry/u);
      return true;
    },
  );
});
