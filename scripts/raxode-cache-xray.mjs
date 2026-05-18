#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function usage() {
  return [
    "Usage: node scripts/raxode-cache-xray.mjs <legacy-direct-application-log.jsonl>",
    "       node scripts/raxode-cache-xray.mjs --latest [--dir <live-reports-dir>] [--require-new-telemetry]",
    "",
    "Prints cache hit, stable-prefix, dynamic-payload, tool-result-budget, and context telemetry from raxode legacy JSONL logs.",
  ].join("\n");
}

function defaultLiveReportsDir() {
  return path.join(os.homedir(), ".local/share/raxcode-homes/praxis-org/live-reports");
}

function latestJsonlIn(dir) {
  if (!existsSync(dir)) {
    throw new Error(`Live reports directory does not exist: ${dir}`);
  }
  const candidates = readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(dir, name))
    .map((filePath) => ({ filePath, mtimeMs: statSync(filePath).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (candidates.length === 0) {
    throw new Error(`No .jsonl live report found in: ${dir}`);
  }
  return candidates[0].filePath;
}

function resolveLogPath(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const latest = argv.includes("--latest");
  if (latest) {
    const dirIndex = argv.indexOf("--dir");
    const dir = dirIndex >= 0 && argv[dirIndex + 1] ? argv[dirIndex + 1] : process.env.RAXODE_CACHE_XRAY_REPORT_DIR ?? defaultLiveReportsDir();
    return latestJsonlIn(path.resolve(dir));
  }
  return argv.find((arg) => !arg.startsWith("--"));
}

const logPath = resolveLogPath(process.argv.slice(2));
const requireNewTelemetry = process.argv.includes("--require-new-telemetry");
if (!logPath) {
  console.error(usage());
  process.exit(1);
}

const rows = readFileSync(logPath, "utf8")
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Failed to parse ${logPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

const modelRows = rows.filter((row) =>
  row?.event === "stage_end" &&
  row?.stage === "core/model.infer" &&
  row?.cacheDebug?.kind === "praxis.modelCall.cacheDebug");

if (modelRows.length === 0) {
  console.error("No cacheDebug model rows found. Re-run raxode after the cache x-ray telemetry patch.");
  process.exit(2);
}

console.log(`# log: ${logPath}`);

let totalInput = 0;
let totalCached = 0;
let rowsWithObservedUsage = 0;
let rowsWithCacheShape = 0;
let rowsWithToolResultBudget = 0;
let rowsWithComparison = 0;

function shortHash(value) {
  return String(value ?? "").slice(0, 12);
}

function formatPercentFromRatio(value) {
  if (!Number.isFinite(value)) return "?";
  return `${Math.round(value * 1000) / 10}%`;
}

for (const [index, row] of modelRows.entries()) {
  const usage = row.usage ?? {};
  const cacheDebug = row.cacheDebug;
  const promptPack = cacheDebug.promptPack ?? {};
  const providerBody = cacheDebug.providerBody ?? {};
  const observedUsage = cacheDebug.observedUsage && typeof cacheDebug.observedUsage === "object" ? cacheDebug.observedUsage : {};
  const cacheShape = providerBody.cacheShape && typeof providerBody.cacheShape === "object" ? providerBody.cacheShape : {};
  const toolResultBudget = providerBody.toolResultBudget && typeof providerBody.toolResultBudget === "object" ? providerBody.toolResultBudget : {};
  const comparison = cacheDebug.comparisonToPrevious && typeof cacheDebug.comparisonToPrevious === "object" ? cacheDebug.comparisonToPrevious : undefined;
  const context = row.context && typeof row.context === "object" ? row.context : {};
  const resultMetadata = row.resultMetadata && typeof row.resultMetadata === "object" ? row.resultMetadata : {};
  if (Object.keys(observedUsage).length > 0) rowsWithObservedUsage += 1;
  if (Object.keys(cacheShape).length > 0) rowsWithCacheShape += 1;
  if (Object.keys(toolResultBudget).length > 0) rowsWithToolResultBudget += 1;
  if (comparison) rowsWithComparison += 1;
  const inputTokens = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const cachedInputTokens = Number.isFinite(usage.cachedInputTokens) ? usage.cachedInputTokens : 0;
  totalInput += inputTokens;
  totalCached += cachedInputTokens;
  const hitRate = inputTokens > 0 ? Math.round((cachedInputTokens / inputTokens) * 100) : 0;
  console.log(`\n# model call ${index + 1}`);
  console.log(`usage: input=${inputTokens} cached=${cachedInputTokens} hit=${hitRate}% output=${usage.outputTokens ?? "?"} thinking=${usage.thinkingTokens ?? "?"}`);
  if (observedUsage.diagnosis || observedUsage.reasons) {
    console.log(`diagnosis: ${observedUsage.diagnosis ?? "?"} nonCached=${observedUsage.nonCachedInputTokens ?? "?"} stableWarmth=${formatPercentFromRatio(Number(observedUsage.stablePrefixWarmthEstimate))}`);
    const reasons = Array.isArray(observedUsage.reasons) ? observedUsage.reasons : [];
    for (const reason of reasons.slice(0, 3)) {
      console.log(`  reason: ${reason}`);
    }
  }
  console.log(`provider body: total~${providerBody.estimatedTokens ?? "?"} input~${providerBody.inputEstimatedTokens ?? "?"} tools~${providerBody.toolsEstimatedTokens ?? "?"} toolCount=${providerBody.toolCount ?? "?"} previousItems=${providerBody.previousProviderOutputItems ?? "?"} toolResults=${providerBody.toolResultInputs ?? "?"}`);
  if (resultMetadata.providerResponseId || resultMetadata.previousProviderResponseId) {
    console.log(`provider response: previous=${resultMetadata.previousProviderResponseId ?? "-"} current=${resultMetadata.providerResponseId ?? "-"}`);
  }
  if (Object.keys(cacheShape).length > 0) {
    console.log(`stable prefix: ~${cacheShape.providerStablePrefixEstimatedTokens ?? "?"} tokens share=${formatPercentFromRatio(Number(cacheShape.stablePrefixShare))} hash=${shortHash(cacheShape.stablePrefixHash)}`);
    console.log(`dynamic payload: ~${cacheShape.providerDynamicInputEstimatedTokens ?? "?"} tokens share=${formatPercentFromRatio(Number(cacheShape.dynamicInputShare))} hash=${shortHash(cacheShape.dynamicPayloadHash)}`);
  }
  if (Object.keys(toolResultBudget).length > 0) {
    console.log(`tool result budget: original=${toolResultBudget.originalToolResultBytes ?? "?"}B replayed=${toolResultBudget.replayedToolResultBytes ?? "?"}B budget=${toolResultBudget.budgetBytes ?? "?"}B full=${toolResultBudget.fullToolResults ?? "?"} compacted=${toolResultBudget.compactedToolResults ?? "?"}`);
  }
  if (comparison) {
    console.log(`comparison: stablePrefixChanged=${comparison.stablePrefixChanged ?? "?"} dynamicPayloadChanged=${comparison.dynamicPayloadChanged ?? "?"} instructionsChanged=${comparison.instructionsChanged ?? "?"} toolsChanged=${comparison.toolsChanged ?? "?"}`);
    const changed = Array.isArray(comparison.changedFingerprintKeys) ? comparison.changedFingerprintKeys : [];
    if (changed.length > 0) {
      console.log(`changed fingerprints: ${changed.join(", ")}`);
    }
  }
  if (Object.keys(context).length > 0) {
    console.log(`context: source=${context.contextSource ?? "?"} lastInput=${context.lastRequestInputTokens ?? "?"} prompt=${context.promptTokens ?? "?"} usable=${context.usableInputTokens ?? "?"}`);
  }
  const fingerprints = providerBody.fingerprints && typeof providerBody.fingerprints === "object" ? providerBody.fingerprints : {};
  if (Object.keys(fingerprints).length > 0) {
    console.log(`provider hashes: body=${shortHash(fingerprints.bodyHash)} tools=${shortHash(fingerprints.toolsHash)} input=${shortHash(fingerprints.inputHash)} developer=${shortHash(fingerprints.developerHash)} promptPack=${shortHash(fingerprints.promptPackUserHash)} previous=${shortHash(fingerprints.previousItemsHash)} toolResults=${shortHash(fingerprints.toolResultsHash)}`);
  }
  console.log(`promptPack: total~${promptPack.totalEstimatedTokens ?? "?"} rendered~${promptPack.renderedTextEstimatedTokens ?? "?"} prefix~${promptPack.cacheablePrefixEstimatedTokens ?? "?"} dynamic~${promptPack.dynamicEstimatedTokens ?? "?"}`);
  const segments = Array.isArray(promptPack.segments) ? promptPack.segments : [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object") continue;
    const internalHash = segment.providerHints && typeof segment.providerHints === "object"
      ? segment.providerHints.internalStateHash
      : undefined;
    console.log(`  - ${segment.segmentKind}: ${segment.estimatedTokens ?? "?"} tokens ${segment.cachePolicy ?? "?"} hash=${String(segment.segmentHash ?? "").slice(0, 12)} internal=${String(internalHash ?? "").slice(0, 12)} materials=${segment.materialCount ?? "?"}`);
  }
  const warnings = Array.isArray(promptPack.cacheRiskWarnings) ? promptPack.cacheRiskWarnings : [];
  if (warnings.length > 0) {
    console.log(`warnings: ${warnings.join(", ")}`);
  }
}

const weightedHitRate = totalInput > 0 ? Math.round((totalCached / totalInput) * 100) : 0;
console.log(`\nweighted cache hit: ${weightedHitRate}% (${totalCached}/${totalInput})`);
const requiredComparisonRows = Math.max(0, modelRows.length - 1);
console.log(`telemetry coverage: observedUsage=${rowsWithObservedUsage}/${modelRows.length} cacheShape=${rowsWithCacheShape}/${modelRows.length} toolResultBudget=${rowsWithToolResultBudget}/${modelRows.length} comparison=${rowsWithComparison}/${modelRows.length}`);

if (requireNewTelemetry && (
  rowsWithObservedUsage < modelRows.length ||
  rowsWithCacheShape < modelRows.length ||
  rowsWithToolResultBudget < modelRows.length ||
  rowsWithComparison < requiredComparisonRows
)) {
  console.error("Missing new cache telemetry. Re-run raxode from the patched checkout, then run this command again.");
  process.exit(3);
}
