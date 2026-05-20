import stringWidth from "string-width";

import {
  getSelectionColumnsForRow,
  splitTextBySelectionColumns,
  type TextSelectionScope,
  type TextSelectionState,
} from "../terminal/selection.js";
import type { SurfaceMessage } from "../surface/types.js";

export type DirectTuiConversationPhase = "intro" | "conversation";

export interface DirectTuiContextUsageSnapshot {
  promptTokens?: number;
  lastRequestInputTokens?: number;
  lastRequestTotalTokens?: number;
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
}

export function resolveDirectTuiContextUsedTokens(input: {
  snapshot?: DirectTuiContextUsageSnapshot | null;
  draftContextTokens?: number;
}): number {
  const providerInputTokens = finiteNonNegativeNumber(input.snapshot?.lastRequestInputTokens);
  const providerTotalTokens = finiteNonNegativeNumber(input.snapshot?.lastRequestTotalTokens);
  const promptTokens = finiteNonNegativeNumber(input.snapshot?.promptTokens);
  const draftTokens = finiteNonNegativeNumber(input.draftContextTokens) ?? 0;
  return (providerInputTokens ?? providerTotalTokens ?? promptTokens ?? 0) + draftTokens;
}

export function resolveDirectTuiContextRemainingPercent(used: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  const usedRatio = Math.max(0, Math.min(1, Math.max(0, used) / total));
  return Math.round((1 - usedRatio) * 100);
}

export function formatDirectTuiContextRemainingPercent(used: number, total: number): string {
  return `${resolveDirectTuiContextRemainingPercent(used, total)}%`;
}

export function formatDirectTuiContextUsedPercent(used: number, total: number): string {
  return `${100 - resolveDirectTuiContextRemainingPercent(used, total)}%`;
}

export function hasDirectTuiFormalConversation(
  messages: readonly Pick<SurfaceMessage, "kind">[],
): boolean {
  return messages.some((message) => message.kind === "user");
}

export function resolveDirectTuiConversationPhase(input: {
  conversationActivated: boolean;
  messages: readonly Pick<SurfaceMessage, "kind">[];
}): DirectTuiConversationPhase {
  if (input.conversationActivated || hasDirectTuiFormalConversation(input.messages)) {
    return "conversation";
  }
  return "intro";
}

export function shouldRenderDirectTuiConversationHeader(input: {
  conversationActivated: boolean;
  messages: readonly Pick<SurfaceMessage, "kind">[];
  pendingSessionSwitch: boolean;
}): boolean {
  if (input.pendingSessionSwitch) {
    return false;
  }
  return resolveDirectTuiConversationPhase({
    conversationActivated: input.conversationActivated,
    messages: input.messages,
  }) === "intro" || input.messages.length > 0;
}

export function shouldUseDirectTuiPinnedRunStatus(input: {
  enablePinnedRunStatus?: boolean;
  hasTransientRunStatusLine: boolean;
  isTty: boolean;
  hasActiveToolSummary: boolean;
  exitSummaryActive: boolean;
  rewindInFlight: boolean;
  hasRewindOverlay: boolean;
  hasRushConfirmOverlay: boolean;
  hasRushOverlay: boolean;
  modelPickerOpen: boolean;
}): boolean {
  return Boolean(
    input.enablePinnedRunStatus === true
      && input.hasTransientRunStatusLine
      && input.isTty
      && !input.hasActiveToolSummary
      && !input.exitSummaryActive
      && !input.rewindInFlight
      && !input.hasRewindOverlay
      && !input.hasRushConfirmOverlay
      && !input.hasRushOverlay
      && !input.modelPickerOpen,
  );
}

export function shouldAnimateDirectTuiRunStatus(input: {
  hasRunIndicator: boolean;
  hasActiveToolSummary: boolean;
}): boolean {
  return input.hasRunIndicator && !input.hasActiveToolSummary;
}

export function resolveDirectTuiInkColor(color?: string): string | undefined {
  if (color === "orange") {
    return "#FF8A1F";
  }
  return color;
}

export function shouldBreakDirectTuiAssistantSegmentOnStageStart(stage?: string | null): boolean {
  const normalizedStage = stage?.trim();
  if (!normalizedStage) {
    return true;
  }
  if (normalizedStage === "core/run") {
    return false;
  }
  if (normalizedStage === "core/model.infer") {
    return false;
  }
  if (normalizedStage.startsWith("cmp/")) {
    return false;
  }
  return true;
}

export function resolveDirectTuiToolSummaryKey(input: {
  turnId: string;
  familyKey?: string | null;
  toolCallId?: string | null;
}): string {
  const normalizedToolCallId = input.toolCallId?.trim();
  if (normalizedToolCallId) {
    return `${input.turnId}:${normalizedToolCallId}`;
  }
  const normalizedFamilyKey = input.familyKey?.trim();
  return `${input.turnId}:${normalizedFamilyKey || "tool"}`;
}

function previewObjectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function previewStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function previewNumberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function previewStringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => previewStringValue(item) ?? [])
    : [];
}

function compactPreviewText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function truncatePreviewText(value: string, maxLength: number): string {
  const compacted = compactPreviewText(value);
  if (compacted.length <= maxLength) return compacted;
  const headLength = Math.max(0, Math.floor((maxLength - 15) / 2));
  const tailLength = Math.max(0, maxLength - 15 - headLength);
  return `${compacted.slice(0, headLength)} ...[truncated]... ${compacted.slice(-tailLength)}`;
}

function formatPreviewPathList(paths: readonly string[], maxItems = 4): string {
  const cleanPaths = paths.map((item) => item.trim()).filter((item) => item.length > 0);
  if (cleanPaths.length === 0) return "file";
  const shown = cleanPaths.slice(0, maxItems).join(", ");
  return cleanPaths.length > maxItems ? `${shown}, +${cleanPaths.length - maxItems} more` : shown;
}

function decodePreviewJsonStringFragment(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\"/gu, "\"")
      .replace(/\\\\/gu, "\\")
      .trim();
  }
}

function extractPreviewStringField(source: string | undefined | null, field: string): string | undefined {
  const text = source?.trim();
  if (!text) return undefined;
  const closedPattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u");
  const closed = text.match(closedPattern)?.[1];
  if (closed !== undefined) return previewStringValue(decodePreviewJsonStringFragment(closed));
  const openPattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)$`, "u");
  const open = text.match(openPattern)?.[1];
  return open === undefined ? undefined : previewStringValue(decodePreviewJsonStringFragment(open));
}

function extractPreviewStringFields(source: string | undefined | null, field: string): string[] {
  const text = source?.trim();
  if (!text) return [];
  const values: string[] = [];
  const closedPattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "gu");
  for (const match of text.matchAll(closedPattern)) {
    const value = previewStringValue(decodePreviewJsonStringFragment(match[1] ?? ""));
    if (value !== undefined && !values.includes(value)) values.push(value);
  }
  const openPattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)$`, "u");
  const openMatch = text.match(openPattern)?.[1];
  const open = openMatch === undefined ? undefined : previewStringValue(decodePreviewJsonStringFragment(openMatch));
  if (open !== undefined && !values.includes(open)) values.push(open);
  return values;
}

function extractPreviewNumberField(source: string | undefined | null, field: string): number | undefined {
  const text = source?.trim();
  if (!text) return undefined;
  const match = text.match(new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "u"))?.[1];
  if (match === undefined) return undefined;
  const parsed = Number(match);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePreviewArguments(source: string | undefined | null): Record<string, unknown> | undefined {
  const text = source?.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return undefined;
  try {
    return previewObjectValue(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function flattenPreviewArguments(argumentsRecord: Record<string, unknown> | undefined): Record<string, unknown> {
  if (argumentsRecord === undefined) return {};
  const target = previewObjectValue(argumentsRecord.target);
  return target === undefined ? argumentsRecord : { ...argumentsRecord, ...target };
}

function previewToolIdFromProviderName(providerToolName?: string | null): string | undefined {
  const normalized = providerToolName?.trim();
  if (!normalized) return undefined;
  if (normalized === "praxis_ephemeral_procedure") return "praxis.ephemeralProcedure";
  if (normalized.startsWith("praxis_tool_")) {
    return normalized.slice("praxis_tool_".length).replace(/_/gu, ".");
  }
  return normalized.replace(/_/gu, ".");
}

function friendlyProviderToolName(providerToolName?: string | null): string {
  return previewToolIdFromProviderName(providerToolName) ?? "tool call";
}

function summarizeCodeToolPreview(input: {
  toolId: string;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  if (!input.toolId.startsWith("code.")) return undefined;
  const args = flattenPreviewArguments(input.argumentsRecord);
  const targetPath = previewStringValue(args.targetPath)
    ?? previewStringValue(args.path)
    ?? previewStringValue(args.filePath)
    ?? extractPreviewStringField(input.argumentsPreview, "targetPath")
    ?? extractPreviewStringField(input.argumentsPreview, "path")
    ?? extractPreviewStringField(input.argumentsPreview, "filePath");
  const targetPaths = [
    ...previewStringArrayValue(args.targetPaths),
    ...previewStringArrayValue(args.paths),
    ...previewStringArrayValue(args.files),
  ];
  const directoryPath = previewStringValue(args.directoryPath)
    ?? previewStringValue(args.workspaceRoot)
    ?? extractPreviewStringField(input.argumentsPreview, "directoryPath")
    ?? extractPreviewStringField(input.argumentsPreview, "workspaceRoot");
  const pathSummary = targetPaths.length > 0 ? formatPreviewPathList(targetPaths) : targetPath;
  switch (input.toolId) {
    case "code.scan": {
      const depth = previewNumberValue(args.depth) ?? extractPreviewNumberField(input.argumentsPreview, "depth");
      const maxEntries = previewNumberValue(args.maxEntries) ?? extractPreviewNumberField(input.argumentsPreview, "maxEntries");
      const detail = [
        depth !== undefined ? `depth ${depth}` : undefined,
        maxEntries !== undefined ? `up to ${maxEntries} entries` : undefined,
      ].filter((item): item is string => item !== undefined).join(", ");
      return `Scanning ${directoryPath ?? "."}${detail ? ` (${detail})` : ""}`;
    }
    case "code.read":
      return `Reading ${pathSummary ?? "file"}`;
    case "code.search.Ripgrep":
    case "code.search_Ripgrep": {
      const query = previewStringValue(args.query)
        ?? previewStringValue(args.pattern)
        ?? extractPreviewStringField(input.argumentsPreview, "query")
        ?? extractPreviewStringField(input.argumentsPreview, "pattern");
      return `Searching ${directoryPath ?? "."}${query ? ` for ${JSON.stringify(truncatePreviewText(query, 80))}` : ""}`;
    }
    case "code.overwrite":
      return `Writing ${targetPath ?? "file"}`;
    case "code.modify":
      return `Editing ${targetPath ?? "file"}`;
    case "code.replaceFile":
      return `Replacing ${targetPath ?? "file"}`;
    case "code.delete":
      return `Deleting from ${targetPath ?? "file"}`;
    case "code.format":
      return `Formatting ${targetPath ?? pathSummary ?? "file"}`;
    default:
      if (pathSummary) return `${input.toolId} on ${pathSummary}`;
      if (directoryPath) return `${input.toolId} in ${directoryPath}`;
      return undefined;
  }
}

function previewTextLineCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0) return 0;
  return value.split(/\r\n|\r|\n/u).length;
}

function formatPreviewBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

function previewRangeDeletionCount(value: unknown): number | undefined {
  const range = previewObjectValue(value);
  const startLine = previewNumberValue(range?.startLine) ?? previewNumberValue(range?.start);
  const endLine = previewNumberValue(range?.endLine) ?? previewNumberValue(range?.end);
  if (startLine === undefined || endLine === undefined || endLine < startLine) {
    return undefined;
  }
  return Math.floor(endLine - startLine + 1);
}

function formatCodePreviewDiffStats(input: {
  additions?: number;
  deletions?: number;
}): string | undefined {
  const additions = input.additions !== undefined && Number.isFinite(input.additions)
    ? Math.max(0, Math.floor(input.additions))
    : undefined;
  const deletions = input.deletions !== undefined && Number.isFinite(input.deletions)
    ? Math.max(0, Math.floor(input.deletions))
    : undefined;
  const parts = [
    additions !== undefined ? `+${additions}` : undefined,
    deletions !== undefined ? `-${deletions}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? `(${parts.join(" ")})` : undefined;
}

function sumPreviewTextLineCounts(values: readonly string[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((total, value) => total + (previewTextLineCount(value) ?? 0), 0);
}

function resolveCodePreviewDiffStats(input: {
  toolId: string;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  if (!input.toolId.startsWith("code.")) return undefined;
  const args = flattenPreviewArguments(input.argumentsRecord);
  switch (input.toolId) {
    case "code.modify": {
      const searchText = previewStringValue(args.searchText)
        ?? extractPreviewStringField(input.argumentsPreview, "searchText");
      const replacementText = previewStringValue(args.replacementText)
        ?? extractPreviewStringField(input.argumentsPreview, "replacementText");
      return formatCodePreviewDiffStats({
        additions: previewTextLineCount(replacementText),
        deletions: previewTextLineCount(searchText),
      });
    }
    case "code.overwrite": {
      const content = previewStringValue(args.content)
        ?? extractPreviewStringField(input.argumentsPreview, "content");
      return formatCodePreviewDiffStats({
        additions: previewTextLineCount(content),
      });
    }
    case "code.replaceFile": {
      const newContent = previewStringValue(args.newContent)
        ?? extractPreviewStringField(input.argumentsPreview, "newContent");
      return formatCodePreviewDiffStats({
        additions: previewTextLineCount(newContent),
      });
    }
    case "code.delete":
      return formatCodePreviewDiffStats({
        deletions: previewRangeDeletionCount(args.range),
      });
    default:
      return undefined;
  }
}

const SHELL_FILE_WRITE_REDIRECTION_PATTERN = /(?:^|[\s;|&])(?:>|>>|1>|1>>)\s*(?!&|\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_CAT_WRITE_PATTERN = /(?:^|[\s;|&])cat\s+>\s*(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_CAT_HEREDOC_WRITE_PATTERN = /(?:^|[\s;|&])cat\b[^;&|]*<<[^;&|]*>\s*(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_TEE_WRITE_PATTERN = /(?:^|[\s;|&])tee\s+(?:-[a-zA-Z]*a[a-zA-Z]*\s+)?(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_PROGRAMMATIC_FILE_WRITE_PATTERN =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|write_text|openSync\s*\([^)]*['"]w|open\s*\([^)]*['"]w)\b/u;
const SHELL_PROGRAMMATIC_FILE_WRITE_TARGET_PATTERN =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|write_text|openSync|open)\s*\(\s*['"]([^'"]+)['"]/u;

function compactShellPreviewSource(source: string): string {
  return source.replace(/\\\r?\n/gu, " ").replace(/\s+/gu, " ").trim();
}

function isAllowedTemporaryShellPreviewWriteTarget(target: string | undefined): boolean {
  if (target === undefined) return false;
  return target === "/dev/null"
    || target.startsWith("/tmp/")
    || target.startsWith("/var/tmp/")
    || target.startsWith("/run/user/");
}

function matchShellPreviewWorkspaceWriteTarget(pattern: RegExp, source: string): string | undefined {
  const match = pattern.exec(source);
  if (match === null) return undefined;
  const target = match[2];
  return isAllowedTemporaryShellPreviewWriteTarget(target) ? undefined : target;
}

function shellPreviewCommand(input: {
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  const args = flattenPreviewArguments(input.argumentsRecord);
  const commandArray = previewStringArrayValue(args.command);
  return previewStringValue(args.command)
    ?? (commandArray.length > 0 ? commandArray.join(" ") : undefined)
    ?? previewStringValue(args.script)
    ?? extractPreviewStringField(input.argumentsPreview, "command")
    ?? extractPreviewStringField(input.argumentsPreview, "script");
}

function shellPreviewWorkspaceWriteReason(command: string | undefined): string | undefined {
  if (command === undefined) return undefined;
  const compacted = compactShellPreviewSource(command);
  if (compacted.length === 0) return undefined;
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_CAT_WRITE_PATTERN, compacted) !== undefined) {
    return "cat redirection writes workspace files";
  }
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_CAT_HEREDOC_WRITE_PATTERN, compacted) !== undefined) {
    return "cat heredoc redirection writes workspace files";
  }
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_TEE_WRITE_PATTERN, compacted) !== undefined) {
    return "tee writes workspace files";
  }
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_FILE_WRITE_REDIRECTION_PATTERN, compacted) !== undefined) {
    return "shell output redirection writes workspace files";
  }
  if (SHELL_PROGRAMMATIC_FILE_WRITE_PATTERN.test(compacted)) {
    const target = SHELL_PROGRAMMATIC_FILE_WRITE_TARGET_PATTERN.exec(compacted)?.[1];
    if (isAllowedTemporaryShellPreviewWriteTarget(target)) return undefined;
    return "ad-hoc shell scripts write workspace files";
  }
  return undefined;
}

function shellWorkspaceWriteBlockedLine(reason: string): string {
  return `${reason}; use code.overwrite, code.modify, or code.replaceFile for workspace file changes.`;
}

function summarizeShellToolPreview(input: {
  toolId: string;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  if (!input.toolId.startsWith("shell.")) return undefined;
  const args = flattenPreviewArguments(input.argumentsRecord);
  const command = shellPreviewCommand(input);
  const cwd = previewStringValue(args.workingDirectory)
    ?? previewStringValue(args.cwd)
    ?? extractPreviewStringField(input.argumentsPreview, "workingDirectory")
    ?? extractPreviewStringField(input.argumentsPreview, "cwd");
  if (command) {
    const workspaceWriteReason = shellPreviewWorkspaceWriteReason(command);
    if (workspaceWriteReason !== undefined) {
      return shellWorkspaceWriteBlockedLine(workspaceWriteReason);
    }
    const verb = input.toolId === "shell.serviceStartAndVerify"
      ? "Starting and verifying"
      : input.toolId === "shell.detachedExecution" || input.toolId === "shell.backgroundExecution"
      ? "Launching"
      : "Running";
    return `${verb} ${truncatePreviewText(command, 180)}${cwd ? ` in ${cwd}` : ""}`;
  }
  const executionId = previewStringValue(args.executionId)
    ?? previewStringValue(args.launchId)
    ?? extractPreviewStringField(input.argumentsPreview, "executionId")
    ?? extractPreviewStringField(input.argumentsPreview, "launchId");
  return executionId ? `${input.toolId} for ${executionId}` : undefined;
}

function summarizeProcedurePreview(input: {
  toolId: string;
  providerToolName?: string | null;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string[] | undefined {
  if (!isProcedureToolPreview(input)) {
    return undefined;
  }
  const purpose = previewStringValue(input.argumentsRecord?.purpose)
    ?? extractPreviewStringField(input.argumentsPreview, "purpose");
  const steps = Array.isArray(input.argumentsRecord?.steps)
    ? input.argumentsRecord.steps.flatMap((step) => {
      const stepRecord = previewObjectValue(step);
      return previewStringValue(stepRecord?.stepId)
        ?? previewStringValue(stepRecord?.baseToolId)
        ?? [];
    })
    : extractPreviewStringFields(input.argumentsPreview, "stepId");
  const tools = Array.isArray(input.argumentsRecord?.steps)
    ? input.argumentsRecord.steps.flatMap((step) => {
      const stepRecord = previewObjectValue(step);
      return previewStringValue(stepRecord?.baseToolId) ?? [];
    })
    : extractPreviewStringFields(input.argumentsPreview, "baseToolId");
  const targets = [
    ...extractPreviewStringFields(input.argumentsPreview, "targetPath"),
    ...extractPreviewStringFields(input.argumentsPreview, "path"),
    ...extractPreviewStringFields(input.argumentsPreview, "filePath"),
  ].filter((target, index, all) => all.indexOf(target) === index);
  const streamedBytes = input.argumentsRecord === undefined
    ? (input.argumentsPreview?.length ?? 0)
    : 0;
  const streamedContentLineCount = input.argumentsRecord === undefined
    ? previewTextLineCount(extractPreviewStringField(input.argumentsPreview, "content")
      ?? extractPreviewStringField(input.argumentsPreview, "newContent"))
    : undefined;
  return [
    purpose ? `Composing procedure: ${truncatePreviewText(purpose, 160)}` : "Composing procedure",
    streamedBytes > 0
      ? `Receiving plan details (${formatPreviewBytes(streamedBytes)}${streamedContentLineCount !== undefined ? `, +${streamedContentLineCount} lines` : ""})`
      : undefined,
    steps.length > 0 ? `Steps: ${formatPreviewPathList(steps, 3)}` : undefined,
    tools.length > 0 ? `Tools: ${formatPreviewPathList(tools, 3)}` : undefined,
    targets.length > 0 ? `Targets: ${formatPreviewPathList(targets, 4)}` : undefined,
  ].filter((line): line is string => line !== undefined);
}

function isProcedureToolPreview(input: {
  toolId: string;
  providerToolName?: string | null;
}): boolean {
  return input.toolId === "praxis.ephemeralProcedure"
    || input.providerToolName === "praxis_ephemeral_procedure";
}

function summarizeGenericToolPreview(input: {
  providerToolName?: string | null;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string {
  const args = flattenPreviewArguments(input.argumentsRecord);
  const command = previewStringValue(args.command) ?? extractPreviewStringField(input.argumentsPreview, "command");
  const query = previewStringValue(args.query) ?? extractPreviewStringField(input.argumentsPreview, "query");
  const url = previewStringValue(args.url) ?? extractPreviewStringField(input.argumentsPreview, "url");
  const target = command ?? query ?? url;
  return target
    ? truncatePreviewText(target, 180)
    : `Model is composing ${friendlyProviderToolName(input.providerToolName)}`;
}

export function resolveDirectTuiToolPreviewSummaryLines(input: {
  title: string;
  phase?: string | null;
  providerToolName?: string | null;
  capabilityKey?: string | null;
  argumentsPreview?: string | null;
}): string[] {
  const title = input.title.trim() || "Tool";
  const phase = input.phase?.trim() || "started";
  const toolId = input.capabilityKey?.trim()
    || previewToolIdFromProviderName(input.providerToolName)
    || "tool.call";
  const argumentsRecord = parsePreviewArguments(input.argumentsPreview);
  const isProcedurePreview = isProcedureToolPreview({ toolId, providerToolName: input.providerToolName });
  const shellWorkspaceWriteReason = isProcedurePreview
    ? undefined
    : shellPreviewWorkspaceWriteReason(shellPreviewCommand({
      argumentsRecord,
      argumentsPreview: input.argumentsPreview,
    }));
  const shellWorkspaceWriteBlocked = shellWorkspaceWriteReason !== undefined;
  const codePreviewDiffStats = resolveCodePreviewDiffStats({
    toolId,
    argumentsRecord,
    argumentsPreview: input.argumentsPreview,
  });
  const procedureLines = summarizeProcedurePreview({
    toolId,
    providerToolName: input.providerToolName,
    argumentsRecord,
    argumentsPreview: input.argumentsPreview,
  });
  const actionLine = procedureLines?.[0]
    ?? (shellWorkspaceWriteReason !== undefined ? shellWorkspaceWriteBlockedLine(shellWorkspaceWriteReason) : undefined)
    ?? summarizeCodeToolPreview({ toolId, argumentsRecord, argumentsPreview: input.argumentsPreview })
    ?? summarizeShellToolPreview({ toolId, argumentsRecord, argumentsPreview: input.argumentsPreview })
    ?? summarizeGenericToolPreview({
      providerToolName: input.providerToolName,
      argumentsRecord,
      argumentsPreview: input.argumentsPreview,
    });
  const displayTitle = shellWorkspaceWriteBlocked && title === "Tool" ? "Shell" : title;
  const displayPhase = shellWorkspaceWriteBlocked
    ? "blocked"
    : phase === "done"
      ? "ready"
      : "composing";
  return [
    `${displayTitle} ${displayPhase}${codePreviewDiffStats ? ` ${codePreviewDiffStats}` : ""}`,
    actionLine,
    ...(procedureLines?.slice(1) ?? []),
  ];
}

export type DirectTuiProcedurePlannedToolPreview = {
  familyKey: string;
  familyTitle: string;
  lines: string[];
};

function parseProcedureCodeAdditionsLine(line: string | undefined): number | undefined {
  const match = line?.match(/\(\+(\d+)(?:\s+-\d+)?\)/u)?.[1];
  if (match === undefined) return undefined;
  const parsed = Number(match);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseProcedureReceivingContentLine(line: string | undefined): number | undefined {
  const match = line?.match(/^Receiving content \(\+(\d+) lines\)$/u)?.[1];
  if (match === undefined) return undefined;
  const parsed = Number(match);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function stabilizeDirectTuiProcedurePlannedToolPreviewLines(input: {
  previousLines?: readonly string[] | null;
  nextLines: readonly string[];
}): string[] {
  const nextLines = [...input.nextLines];
  if (!nextLines[0]?.startsWith("Code ")) return nextLines;

  const previousAdditions = parseProcedureCodeAdditionsLine(input.previousLines?.[0]);
  const nextAdditions = parseProcedureCodeAdditionsLine(nextLines[0]);
  if (previousAdditions !== undefined && (nextAdditions === undefined || nextAdditions < previousAdditions)) {
    nextLines[0] = nextLines[0].replace(/\s+\(\+\d+(?:\s+-\d+)?\)/u, "");
    nextLines[0] = `${nextLines[0]} (+${previousAdditions})`;
  }

  const previousContentLines = input.previousLines
    ?.map(parseProcedureReceivingContentLine)
    .find((value): value is number => value !== undefined);
  if (previousContentLines !== undefined) {
    const receivingIndex = nextLines.findIndex((line) => parseProcedureReceivingContentLine(line) !== undefined);
    if (receivingIndex >= 0) {
      const nextContentLines = parseProcedureReceivingContentLine(nextLines[receivingIndex]);
      if (nextContentLines === undefined || nextContentLines < previousContentLines) {
        nextLines[receivingIndex] = `Receiving content (+${previousContentLines} lines)`;
      }
    } else {
      nextLines.push(`Receiving content (+${previousContentLines} lines)`);
    }
  }

  return nextLines;
}

export function resolveDirectTuiProcedurePlannedToolPreviews(input: {
  phase?: string | null;
  providerToolName?: string | null;
  capabilityKey?: string | null;
  argumentsPreview?: string | null;
}): DirectTuiProcedurePlannedToolPreview[] {
  const toolId = input.capabilityKey?.trim()
    || previewToolIdFromProviderName(input.providerToolName)
    || "tool.call";
  if (!isProcedureToolPreview({ toolId, providerToolName: input.providerToolName })) {
    return [];
  }
  const argumentsRecord = parsePreviewArguments(input.argumentsPreview);
  const plannedToolIds = Array.isArray(argumentsRecord?.steps)
    ? argumentsRecord.steps.flatMap((step) => {
      const stepRecord = previewObjectValue(step);
      return previewStringValue(stepRecord?.baseToolId) ?? [];
    })
    : extractPreviewStringFields(input.argumentsPreview, "baseToolId");
  const uniqueToolIds = plannedToolIds.filter((plannedToolId, index, all) => all.indexOf(plannedToolId) === index);
  const targets = [
    ...extractPreviewStringFields(input.argumentsPreview, "targetPath"),
    ...extractPreviewStringFields(input.argumentsPreview, "path"),
    ...extractPreviewStringFields(input.argumentsPreview, "filePath"),
  ].filter((target, index, all) => all.indexOf(target) === index);
  const contentLineCount = sumPreviewTextLineCounts([
    ...extractPreviewStringFields(input.argumentsPreview, "content"),
    ...extractPreviewStringFields(input.argumentsPreview, "newContent"),
    ...extractPreviewStringFields(input.argumentsPreview, "replacementText"),
  ]);
  const codePreviewDiffStats = formatCodePreviewDiffStats({
    additions: sumPreviewTextLineCounts([
      ...extractPreviewStringFields(input.argumentsPreview, "content"),
      ...extractPreviewStringFields(input.argumentsPreview, "newContent"),
      ...extractPreviewStringFields(input.argumentsPreview, "replacementText"),
    ]),
    deletions: sumPreviewTextLineCounts(extractPreviewStringFields(input.argumentsPreview, "searchText")),
  });
  const displayPhase = input.phase?.trim() === "done" ? "ready" : "composing";
  const previews: DirectTuiProcedurePlannedToolPreview[] = [];
  const codeToolIds = uniqueToolIds.filter((plannedToolId) => plannedToolId.startsWith("code."));
  if (codeToolIds.length > 0) {
    const targetSummary = targets.length > 0 ? formatPreviewPathList(targets, 4) : undefined;
    previews.push({
      familyKey: "code",
      familyTitle: "Code",
      lines: [
        `Code ${displayPhase}${codePreviewDiffStats ? ` ${codePreviewDiffStats}` : ""}`,
        targetSummary !== undefined
          ? `Writing ${targetSummary}`
          : `${displayPhase === "ready" ? "Ready" : "Composing"} ${formatPreviewPathList(codeToolIds, 3)}`,
        contentLineCount !== undefined ? `Receiving content (+${contentLineCount} lines)` : undefined,
      ].filter((line): line is string => line !== undefined),
    });
  }
  const shellToolIds = uniqueToolIds.filter((plannedToolId) => plannedToolId.startsWith("shell."));
  if (shellToolIds.length > 0) {
    const shellPreviewLine = summarizeShellToolPreview({
      toolId: shellToolIds[0] ?? "shell.commandExecution",
      argumentsPreview: input.argumentsPreview,
    });
    previews.push({
      familyKey: "shell",
      familyTitle: "Shell",
      lines: [
        `Shell ${displayPhase}`,
        shellPreviewLine
          ?? `${displayPhase === "ready" ? "Ready" : "Composing"} ${formatPreviewPathList(shellToolIds, 3)}`,
      ],
    });
  }
  return previews;
}

export function isDirectTuiCodeDiffPreviewLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("@@")
    || /^[-+]\s*[0-9?]+\s+\|/u.test(trimmed)
    || trimmed === "... diff preview trimmed";
}

export function resolveDirectTuiToolSummaryResultLineLimit(input: {
  familyKey?: string | null;
  resultLines: readonly string[];
}): number {
  const familyKey = input.familyKey?.trim().toLowerCase();
  const hasCodeDiff = familyKey === "code" && input.resultLines.some(isDirectTuiCodeDiffPreviewLine);
  return hasCodeDiff ? 16 : 3;
}

export function isDirectTuiLiveToolSummaryState(summaryState: unknown): boolean {
  return summaryState === "active" || summaryState === "composing";
}

export type DirectTuiSurfaceTurnStatus = "running" | "blocked" | "completed" | "failed";

export function mapDirectTuiCoreTaskStatusToSurfaceTurnStatus(taskStatus?: string | null): DirectTuiSurfaceTurnStatus {
  const normalized = taskStatus?.trim().toLowerCase();
  if (normalized === "blocked" || normalized === "exhausted") {
    return "blocked";
  }
  if (
    normalized === "failed"
    || normalized === "error"
    || normalized === "rejected"
    || normalized === "provider_rejected"
    || normalized === "provider_unavailable"
    || normalized === "provider_timeout"
  ) {
    return "failed";
  }
  if (
    normalized === "completed"
    || normalized === "incomplete"
    || normalized === "success"
    || normalized === "succeeded"
  ) {
    return "completed";
  }
  return "running";
}

export type DirectTuiRunPanelStatus = "acting" | "completed" | "paused" | "failed";

export function mapDirectTuiCoreTaskStatusToRunPanelStatus(taskStatus?: string | null): DirectTuiRunPanelStatus {
  const turnStatus = mapDirectTuiCoreTaskStatusToSurfaceTurnStatus(taskStatus);
  if (turnStatus === "failed") {
    return "failed";
  }
  if (turnStatus === "completed") {
    return "completed";
  }
  if (turnStatus === "blocked") {
    return "paused";
  }
  return "acting";
}

export type DirectTuiCompletedTaskStatus = "blocked" | "completed" | "failed";

export function mapDirectTuiCoreTaskStatusToCompletedTaskStatus(
  taskStatus?: string | null,
): DirectTuiCompletedTaskStatus {
  const turnStatus = mapDirectTuiCoreTaskStatusToSurfaceTurnStatus(taskStatus);
  if (turnStatus === "failed") {
    return "failed";
  }
  if (turnStatus === "blocked") {
    return "blocked";
  }
  return "completed";
}

export function shouldApplyDirectTuiTurnResultContext(input: {
  taskStatus?: string | null;
  context?: {
    estimated?: boolean;
    contextSource?: string;
    usageSource?: string;
    lastRequestInputTokens?: number;
  } | null;
}): boolean {
  if (!input.context) {
    return false;
  }
  if (mapDirectTuiCoreTaskStatusToSurfaceTurnStatus(input.taskStatus) !== "failed") {
    return true;
  }
  const source = input.context.contextSource ?? input.context.usageSource;
  const isHistoryEstimate = input.context.estimated === true && source === "application.history.estimate";
  return !isHistoryEstimate || typeof input.context.lastRequestInputTokens === "number";
}

function compactToolSummarySettlementReason(reason?: string | null): string | undefined {
  const normalized = reason?.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function settleToolSummaryTitle(title: string, status: "blocked" | "failed" | "ready" | "stopped"): string {
  const statusWord = status;
  if (/\b(failed|stopped|blocked)\b/iu.test(title)) {
    return title;
  }
  if (/\b(composing|running|active|ready|started)\b/iu.test(title)) {
    return title.replace(/\b(composing|running|active|ready|started)\b/iu, statusWord);
  }
  return `${title} ${statusWord}`;
}

export function settleDirectTuiLiveToolSummaryText(input: {
  text?: string | null;
  status?: "failed" | "stopped";
  finalStatus?: string | null;
  reason?: string | null;
}): string {
  const lines = (input.text ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0
        && !trimmed.startsWith("Stopped before completion")
        && !trimmed.startsWith("Stopped before execution because");
    });
  const finalStatus = input.finalStatus === undefined && input.status
    ? "failed"
    : mapDirectTuiCoreTaskStatusToSurfaceTurnStatus(input.finalStatus);
  if (finalStatus === "completed") {
    return [
      settleToolSummaryTitle(lines[0] ?? "Tool", "ready"),
      ...lines.slice(1, 4),
    ].join("\n");
  }
  const reason = compactToolSummarySettlementReason(input.reason);
  if (finalStatus === "blocked") {
    return [
      settleToolSummaryTitle(lines[0] ?? "Tool", "blocked"),
      ...lines.slice(1, 4),
      reason
        ? `Stopped before execution because the turn was blocked: ${reason}`
        : "Stopped before execution because the turn was blocked.",
    ].join("\n");
  }
  const title = settleToolSummaryTitle(lines[0] ?? "Tool", input.status ?? "stopped");
  return [
    title,
    ...lines.slice(1, 4),
    reason
      ? `Stopped before execution because the turn failed: ${reason}`
      : "Stopped before execution because the turn failed.",
  ].join("\n");
}

export function isDirectTuiCmpActivityStage(stage?: string | null): boolean {
  const normalizedStage = stage?.trim();
  if (!normalizedStage || !normalizedStage.startsWith("cmp/")) {
    return false;
  }
  return normalizedStage !== "cmp/infra_bootstrap";
}

export function createDirectTuiCmpActivityKey(input: {
  turnIndex?: number | null;
  stage?: string | null;
}): string | null {
  if (!isDirectTuiCmpActivityStage(input.stage)) {
    return null;
  }
  const normalizedTurnIndex = typeof input.turnIndex === "number" && Number.isFinite(input.turnIndex)
    ? input.turnIndex
    : 0;
  return `${normalizedTurnIndex}:${input.stage?.trim()}`;
}

export interface DirectTuiCmpStatusDescriptor {
  label: string;
  animated: boolean;
  tone: "muted" | "active" | "warning" | "danger";
}

export function deriveDirectTuiCmpStatusDescriptor(input: {
  activeStage?: string | null;
  snapshot?: {
    status?: string;
    readbackStatus?: string;
    emptyReason?: string;
  } | null;
}): DirectTuiCmpStatusDescriptor {
  const activeStage = input.activeStage?.trim();
  if (activeStage) {
    return {
      label: `CMP ${activeStage.replace(/^cmp\//u, "")} running`,
      animated: true,
      tone: "active",
    };
  }

  const readbackStatus = input.snapshot?.readbackStatus?.trim().toLowerCase();
  const status = input.snapshot?.status?.trim().toLowerCase();
  if (readbackStatus === "failed" || status === "failed") {
    return {
      label: "CMP readback failed",
      animated: false,
      tone: "danger",
    };
  }
  if (readbackStatus === "degraded" || status === "degraded") {
    return {
      label: "CMP readback degraded",
      animated: false,
      tone: "warning",
    };
  }
  if (readbackStatus === "ready" && status === "empty") {
    return {
      label: "CMP ready but empty",
      animated: false,
      tone: "muted",
    };
  }
  if (readbackStatus === "ready" || status === "ready") {
    return {
      label: "CMP ready",
      animated: false,
      tone: "muted",
    };
  }
  if (status === "booting") {
    return {
      label: "CMP warming up",
      animated: false,
      tone: "muted",
    };
  }
  return {
    label: "CMP status pending",
    animated: false,
    tone: "muted",
  };
}

export interface DirectTuiTextSelectionSegment {
  text: string;
  backgroundColor?: string;
}

export function applyDirectTuiTextSelectionToRenderSegments<
  TSegment extends DirectTuiTextSelectionSegment,
>(input: {
  text: string;
  segments?: readonly TSegment[];
  row: number;
  scope: TextSelectionScope;
  selection: TextSelectionState | null;
  selectionBackgroundColor: string;
}): TSegment[] | undefined {
  if (input.selection?.scope !== input.scope) {
    return input.segments ? [...input.segments] : undefined;
  }
  const lineWidth = Math.max(1, stringWidth(input.text));
  const range = getSelectionColumnsForRow(input.selection, input.row, lineWidth);
  if (!range || range.endColumnExclusive <= range.startColumn) {
    return input.segments ? [...input.segments] : undefined;
  }
  const sourceSegments: readonly TSegment[] = input.segments?.length
    ? input.segments
    : ([{ text: input.text }] as TSegment[]);
  const output: TSegment[] = [];
  let segmentColumn = 0;
  for (const segment of sourceSegments) {
    for (const piece of splitTextBySelectionColumns(segment.text, range, segmentColumn)) {
      output.push({
        ...segment,
        text: piece.text,
        backgroundColor: piece.selected ? input.selectionBackgroundColor : segment.backgroundColor,
      });
    }
    segmentColumn += stringWidth(segment.text);
  }
  return output;
}

export function resolveDirectTuiComposerSelectionTopRow(input: {
  transcriptViewportLineCount: number;
  overlayLineCount: number;
  pendingPreviewLineCount: number;
}): number {
  return Math.max(0, input.transcriptViewportLineCount)
    + 3
    + Math.max(0, input.overlayLineCount)
    + Math.max(0, input.pendingPreviewLineCount);
}

export type DirectTuiAssistantTurnResultAction =
  | { kind: "noop" }
  | { kind: "append"; text: string }
  | { kind: "update"; text: string; messageId: string };

export type DirectTuiAssistantDeltaAction =
  | { kind: "noop" }
  | { kind: "append"; text: string }
  | { kind: "delta"; textDelta: string; messageId: string }
  | { kind: "update"; text: string; messageId: string };

export interface DirectTuiStreamingAssistantText {
  messageId: string;
  turnId: string;
  text: string;
}

export function mergeDirectTuiStreamingAssistantLine(input: {
  transcriptLines: readonly string[];
  streamingAssistant?: DirectTuiStreamingAssistantText | null;
}): string[] {
  if (!input.streamingAssistant?.text) {
    return [...input.transcriptLines];
  }
  return [
    ...input.transcriptLines,
    `● ${input.streamingAssistant.text}`,
    "",
  ];
}

export function resolveDirectTuiAssistantDeltaAction(input: {
  decodedText: string;
  previousDisplayedText: string;
  activeMessageId?: string;
}): DirectTuiAssistantDeltaAction {
  if (!input.activeMessageId) {
    if (input.previousDisplayedText.length > 0 && input.decodedText.startsWith(input.previousDisplayedText)) {
      const textDelta = input.decodedText.slice(input.previousDisplayedText.length);
      if (!textDelta) {
        return { kind: "noop" };
      }
      return {
        kind: "append",
        text: textDelta,
      };
    }
    if (!input.decodedText) {
      return { kind: "noop" };
    }
    return {
      kind: "append",
      text: input.decodedText,
    };
  }
  if (!input.decodedText.startsWith(input.previousDisplayedText)) {
    return {
      kind: "update",
      text: input.decodedText,
      messageId: input.activeMessageId,
    };
  }
  const textDelta = input.decodedText.slice(input.previousDisplayedText.length);
  if (!textDelta) {
    return { kind: "noop" };
  }
  return {
    kind: "delta",
    textDelta,
    messageId: input.activeMessageId,
  };
}

export function resolveDirectTuiAssistantTurnResultAction(input: {
  finalAnswer: string | null;
  streamedText: string;
  activeMessageId?: string;
}): DirectTuiAssistantTurnResultAction {
  if (!input.finalAnswer) {
    return { kind: "noop" };
  }
  const finalAnswerText = input.finalAnswer.trim();
  if (!finalAnswerText) {
    return { kind: "noop" };
  }
  if (!input.activeMessageId) {
    const streamedText = input.streamedText.trim();
    if (streamedText.length > 0 && streamedText === finalAnswerText) {
      return { kind: "noop" };
    }
    if (streamedText.length > 0 && streamedText.endsWith(finalAnswerText)) {
      return { kind: "noop" };
    }
    if (input.streamedText.length > 0 && input.finalAnswer.startsWith(input.streamedText)) {
      const suffix = input.finalAnswer.slice(input.streamedText.length);
      return suffix.length > 0
        ? {
          kind: "append",
          text: suffix,
        }
        : { kind: "noop" };
    }
    return {
      kind: "append",
      text: input.finalAnswer,
    };
  }
  if (input.finalAnswer === input.streamedText) {
    return { kind: "noop" };
  }
  return {
    kind: "update",
    text: input.finalAnswer,
    messageId: input.activeMessageId,
  };
}
