import { createProcessApplicationClient, type RaxodeApplicationClient } from "../../bridge/applicationClient.js";
import type { RaxodeApplicationReasoningEffort } from "../../../contracts.js";

export interface WebSearchMiniSummaryInput {
  sessionId: string;
  runId: string;
  title: string;
  intentLines: string[];
  resultLines: string[];
  metadataLines: string[];
  route?: TuiMiniSummaryRoute;
}

export interface TuiMiniSummaryResult {
  title: string;
  lines: string[];
}

export interface PendingComposerMiniSummaryInput {
  sessionId: string;
  runId: string;
  text: string;
  route?: TuiMiniSummaryRoute;
}

export type TuiMiniSummaryRoute = {
  provider?: string;
  model?: string;
  roleId?: string;
  reasoningEffort?: RaxodeApplicationReasoningEffort | string;
  serviceTier?: "fast";
  maxOutputTokens?: number;
  timeoutMs?: number;
};

const TOOL_SUMMARY_TIMEOUT_MS = 1800;
const TOOL_SUMMARY_SCHEMA = "tool-summary-websearch/v1";
const PENDING_COMPOSER_SUMMARY_SCHEMA = "pending-composer-summary/v1";
let applicationClient: RaxodeApplicationClient | undefined;
let applicationClientOverride: RaxodeApplicationClient | undefined;

export function setTuiMiniSummaryApplicationClientForTest(client: RaxodeApplicationClient | undefined): void {
  applicationClientOverride = client;
  applicationClient = undefined;
}

function getApplicationClient(): RaxodeApplicationClient {
  if (applicationClientOverride) {
    return applicationClientOverride;
  }
  applicationClient ??= createProcessApplicationClient({
    cwd: process.cwd(),
  });
  return applicationClient;
}

function truncateJson(value: unknown, maxChars = 1200): string {
  const text = JSON.stringify(value);
  if (!text) {
    return "null";
  }
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function buildWebSearchSummaryPrompt(input: WebSearchMiniSummaryInput): string {
  return [
    "Current family title:",
    input.title,
    "",
    "Current intent lines:",
    truncateJson(input.intentLines),
    "",
    "Current result lines:",
    truncateJson(input.resultLines),
    "",
    "Current metadata lines:",
    truncateJson(input.metadataLines),
  ].join("\n");
}

function parseMiniSummary(jsonValue: unknown): TuiMiniSummaryResult {
  if (!jsonValue || typeof jsonValue !== "object") {
    throw new Error("mini summary did not return an object");
  }
  const record = jsonValue as Record<string, unknown>;
  if (record.schemaVersion !== TOOL_SUMMARY_SCHEMA) {
    throw new Error("mini summary schemaVersion mismatch");
  }
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const lines = Array.isArray(record.lines)
    ? record.lines.filter((line): line is string => typeof line === "string").map((line) => line.trim()).filter(Boolean)
    : [];
  if (!title || lines.length === 0) {
    throw new Error("mini summary omitted title or lines");
  }
  return {
    title,
    lines: lines.slice(0, 3),
  };
}

function buildPendingComposerSummaryPrompt(input: PendingComposerMiniSummaryInput): string {
  return [
    "Current queued composer text:",
    truncateJson(input.text, 800),
  ].join("\n");
}

function parsePendingComposerSummary(jsonValue: unknown): string {
  if (!jsonValue || typeof jsonValue !== "object") {
    throw new Error("pending composer summary did not return an object");
  }
  const record = jsonValue as Record<string, unknown>;
  if (record.schemaVersion !== PENDING_COMPOSER_SUMMARY_SCHEMA) {
    throw new Error("pending composer summary schemaVersion mismatch");
  }
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  if (!summary) {
    throw new Error("pending composer summary omitted summary");
  }
  return summary;
}

export async function refineWebSearchToolSummary(
  input: WebSearchMiniSummaryInput,
): Promise<TuiMiniSummaryResult | null> {
  const timeoutMs = input.route?.timeoutMs ?? TOOL_SUMMARY_TIMEOUT_MS;
  const result = await Promise.race([
    getApplicationClient().dispatch({
      type: "application.invokeAuxiliaryTask",
      mode: process.env.RAXODE_TUI_AUX_MODE === "dry-run" ? "dry-run" : "live",
      agentKey: "tui",
      agentId: "agent.raxode.tui",
      taskKind: "tui.tool-summary.websearch",
      schemaVersion: TOOL_SUMMARY_SCHEMA,
      sessionId: `session.raxode.tui.${input.sessionId}`,
      correlationId: input.runId,
      timeoutMs,
      model: input.route?.model,
      reasoningEffort: input.route?.reasoningEffort as RaxodeApplicationReasoningEffort | undefined,
      input: {
        title: input.title,
        intentLines: input.intentLines,
        resultLines: input.resultLines,
        metadataLines: input.metadataLines,
        prompt: buildWebSearchSummaryPrompt(input),
      },
    }).then((response) => response.ok ? parseMiniSummary(response.output) : null),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);

  return result ?? null;
}

export async function summarizePendingComposerText(
  input: PendingComposerMiniSummaryInput,
): Promise<string | null> {
  const timeoutMs = input.route?.timeoutMs ?? TOOL_SUMMARY_TIMEOUT_MS;
  const result = await Promise.race([
    getApplicationClient().dispatch({
      type: "application.invokeAuxiliaryTask",
      mode: process.env.RAXODE_TUI_AUX_MODE === "dry-run" ? "dry-run" : "live",
      agentKey: "tui",
      agentId: "agent.raxode.tui",
      taskKind: "tui.pending-composer-summary",
      schemaVersion: PENDING_COMPOSER_SUMMARY_SCHEMA,
      sessionId: `session.raxode.tui.${input.sessionId}`,
      correlationId: input.runId,
      timeoutMs,
      model: input.route?.model,
      reasoningEffort: input.route?.reasoningEffort as RaxodeApplicationReasoningEffort | undefined,
      input: {
        text: input.text,
        prompt: buildPendingComposerSummaryPrompt(input),
      },
    }).then((response) => response.ok ? parsePendingComposerSummary(response.output) : null),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);

  return result ?? null;
}
