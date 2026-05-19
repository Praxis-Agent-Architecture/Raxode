/*
 * 文件定位：raxode-cli/backend legacy direct TUI adapter。
 * 核心目的：让 legacy `direct-tui.tsx` 保持原 UI/输入协议，同时接入新的 applicationLayer Raxode 后端。
 */

import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  RuntimeApprovalEnvelope,
  RuntimeApprovalResolution,
  RuntimeApprovalResolver,
} from "@praxis-ai/praxis/agent-core";
import type {
  PraxisApplicationAttachment,
  PraxisApplicationCommandResult,
  CreateApplicationProjectRuntimeOptions,
  PraxisApplicationEvent,
  PraxisApplicationContextTelemetry,
  PraxisApplicationPermissionProfile,
  PraxisApplicationRuntimeMode,
  PraxisApplicationUsageTelemetry,
} from "@praxis-ai/praxis/application-layer";

type LegacyDirectBackendOptions = {
  projectRoot?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  cwd?: string;
  sessionId?: string;
  stateRoot?: string;
  mode?: PraxisApplicationRuntimeMode;
  initialTurnIndex?: number;
  now?: () => string;
  liveProviderResolver?: CreateApplicationProjectRuntimeOptions["liveProviderResolver"];
};

type DirectEnvelope = {
  type?: string;
  text?: string;
  attachments?: Array<Record<string, unknown>>;
  pastedContents?: Array<Record<string, unknown>>;
  fileRefs?: Array<Record<string, unknown>>;
  answers?: Array<Record<string, unknown>>;
};

type LegacyHumanGateDecisionEnvelope = {
  type: "human_gate_decision";
  gateId: string;
  action: "approve" | "approve_always" | "reject" | "reject_stop";
  note?: string;
};

type PendingRuntimeApproval = {
  envelope: RuntimeApprovalEnvelope;
  featureKey: string;
  featureDisplay: string;
  toolId?: string;
  resolve: (resolution: RuntimeApprovalResolution) => void;
};

function defaultProjectRoot(): string {
  return new URL(".", import.meta.url).pathname;
}

function defaultStateRoot(cwd: string): string {
  return path.resolve(process.env.PRAXIS_STATE_ROOT ?? process.env.RAXODE_HOME ?? path.join(cwd, ".raxode"));
}

function normalizePermissionProfile(value: string | undefined): PraxisApplicationPermissionProfile {
  switch (value) {
    case "bapr":
    case "yolo":
    case "permissive":
    case "standard":
    case "restricted":
      return value;
    case "balanced":
      return "permissive";
    case "strict":
      return "standard";
    default:
      return "standard";
  }
}

function normalizeInitialTurnIndex(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeDirectPayload(raw: string): {
  text: string;
  inputSource: string;
  attachments: PraxisApplicationAttachment[];
} {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { text: raw, inputSource: "manual", attachments: [] };
  }
  try {
    const parsed = JSON.parse(trimmed) as DirectEnvelope;
    if (parsed.type === "direct_question_answer") {
      const text = (parsed.answers ?? [])
        .map((answer) => {
          const questionId = typeof answer.questionId === "string" ? answer.questionId : "question";
          const value = typeof answer.answerText === "string"
            ? answer.answerText
            : typeof answer.selectedOptionLabel === "string"
              ? answer.selectedOptionLabel
              : typeof answer.selectedOptionId === "string"
                ? answer.selectedOptionId
                : "";
          return `${questionId}: ${value}`;
        })
        .filter((line) => line.trim().length > 0)
        .join("\n");
      return {
        text: text || "Question answers submitted.",
        inputSource: "question_answer",
        attachments: [],
      };
    }
    if (parsed.type !== "direct_user_input" && parsed.type !== "direct_init_request") {
      return { text: raw, inputSource: "manual", attachments: [] };
    }
    const pastedAttachments: PraxisApplicationAttachment[] = (parsed.pastedContents ?? []).flatMap((entry, index) => {
      const text = typeof entry.text === "string" ? entry.text : "";
      if (!text) return [];
      const tokenText = typeof entry.tokenText === "string" ? entry.tokenText : `[Pasted Content #${index + 1}]`;
      return [{
        id: typeof entry.id === "string" ? entry.id : `legacy-paste:${index + 1}`,
        kind: "text" as const,
        tokenText,
        displayName: tokenText,
        text,
        metadata: {
          sourceKind: "legacy-direct-tui",
        },
      }];
    });
    const fileAttachments: PraxisApplicationAttachment[] = (parsed.fileRefs ?? []).flatMap((entry, index) => {
      const localPath = typeof entry.absolutePath === "string" ? entry.absolutePath : "";
      if (!localPath) return [];
      return [{
        id: typeof entry.id === "string" ? entry.id : `legacy-file:${index + 1}`,
        kind: "file" as const,
        tokenText: typeof entry.tokenText === "string" ? entry.tokenText : `@${localPath}`,
        displayName: typeof entry.displayName === "string" ? entry.displayName : path.basename(localPath),
        localPath,
        metadata: {
          sourceKind: "legacy-direct-tui",
        },
      }];
    });
    const imageAttachments: PraxisApplicationAttachment[] = (parsed.attachments ?? []).flatMap((entry, index) => {
      const localPath = typeof entry.localPath === "string" ? entry.localPath : undefined;
      const remoteUrl = typeof entry.remoteUrl === "string" ? entry.remoteUrl : undefined;
      if (!localPath && !remoteUrl) return [];
      return [{
        id: typeof entry.id === "string" ? entry.id : `legacy-attachment:${index + 1}`,
        kind: "image" as const,
        tokenText: typeof entry.tokenText === "string" ? entry.tokenText : `[Image #${index + 1}]`,
        displayName: typeof entry.displayName === "string" ? entry.displayName : undefined,
        mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
        localPath,
        remoteUrl,
        metadata: {
          sourceKind: "legacy-direct-tui",
        },
      }];
    });
    return {
      text: parsed.text ?? "",
      inputSource: parsed.type === "direct_init_request" ? "init" : "manual",
      attachments: [...imageAttachments, ...pastedAttachments, ...fileAttachments],
    };
  } catch {
    return { text: raw, inputSource: "manual", attachments: [] };
  }
}

function parseLegacyHumanGateDecision(raw: string): LegacyHumanGateDecisionEnvelope | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.type !== "human_gate_decision") return undefined;
    const gateId = typeof parsed.gateId === "string" ? parsed.gateId.trim() : "";
    const action = parsed.action;
    if (
      gateId.length === 0
      || (action !== "approve" && action !== "approve_always" && action !== "reject" && action !== "reject_stop")
    ) {
      return undefined;
    }
    return {
      type: "human_gate_decision",
      gateId,
      action,
      note: typeof parsed.note === "string" && parsed.note.trim().length > 0 ? parsed.note.trim() : undefined,
    };
  } catch {
    return undefined;
  }
}

function runtimeApprovalToolId(envelope: RuntimeApprovalEnvelope): string | undefined {
  const toolId = envelope.metadata.toolId;
  return typeof toolId === "string" && toolId.trim().length > 0 ? toolId.trim() : undefined;
}

function inferRuntimeApprovalFeature(envelope: RuntimeApprovalEnvelope): {
  featureKey: string;
  featureDisplay: string;
  toolId?: string;
} {
  const toolId = runtimeApprovalToolId(envelope);
  if (toolId?.startsWith("computeruse.")) {
    return { featureKey: "computer_use", featureDisplay: "computer_use", toolId };
  }
  if (toolId) {
    const family = toolId.split(".")[0] ?? "tool";
    return { featureKey: family, featureDisplay: family, toolId };
  }
  if (envelope.source === "model") {
    return { featureKey: "model_approval", featureDisplay: "model_approval" };
  }
  if (envelope.source === "runtime") {
    return { featureKey: "runtime", featureDisplay: "runtime" };
  }
  return { featureKey: "tool", featureDisplay: "tool" };
}

function normalizeApprovalRiskLevel(riskLevel: string | undefined): "normal" | "risky" | "dangerous" {
  if (riskLevel === "dangerous") return "dangerous";
  if (riskLevel === "safe" || riskLevel === "normal") return "normal";
  return "risky";
}

function runtimeApprovalSummary(featureDisplay: string): string {
  return `Raxode now infers: Under the current circumstances, the "${featureDisplay}" feature should be used.`;
}

function buildRuntimeApprovalPanelSnapshot(
  pendingApprovals: ReadonlyMap<string, PendingRuntimeApproval>,
  now: () => string,
): Record<string, unknown> {
  const pendingHumanGates = [...pendingApprovals.values()].map((pending) => {
    const updatedAt = now();
    const riskLevel = normalizeApprovalRiskLevel(pending.envelope.riskLevel);
    return {
      gateId: pending.envelope.approvalId,
      requestId: pending.envelope.approvalId,
      capabilityKey: pending.featureDisplay,
      requestedTier: riskLevel,
      mode: "application-approval",
      reason: pending.envelope.reason,
      createdAt: updatedAt,
      updatedAt,
      externalPathPrefixes: [],
      plainLanguageRisk: {
        plainLanguageSummary: runtimeApprovalSummary(pending.featureDisplay),
        requestedAction: pending.toolId ? `Use ${pending.toolId}` : `Use ${pending.featureDisplay}`,
        riskLevel,
        whyItIsRisky: pending.envelope.reason,
        possibleConsequence: `The ${pending.featureDisplay} feature may interact with runtime resources or the desktop session.`,
        whatHappensIfNotRun: `Raxode will continue without using ${pending.featureDisplay} for this request.`,
        availableUserActions: [
          {
            actionId: "approve-once",
            label: "Approve the use of this feature this time.",
            kind: "approve",
          },
          {
            actionId: "approve-always",
            label: "Always Approve this feature for this session.",
            kind: "approve",
          },
          {
            actionId: "continue-deny",
            label: "Continue and Deny the use of this feature this time.",
            kind: "deny",
          },
          {
            actionId: "stop-deny",
            label: "Stop and Deny the use of this feature this time.",
            kind: "deny",
          },
        ],
        metadata: {
          sourceKind: "application-approval",
          approvalId: pending.envelope.approvalId,
          featureKey: pending.featureKey,
          featureDisplay: pending.featureDisplay,
          ...(pending.toolId ? { toolId: pending.toolId } : {}),
        },
      },
    };
  });
  return {
    summaryLines: pendingHumanGates.length > 0
      ? [`${pendingHumanGates.length} approval request(s) waiting for human decision.`]
      : ["No pending application approval requests."],
    status: pendingHumanGates.length > 0 ? "waiting_human" : "ready",
    registeredCount: 0,
    familyCount: 0,
    blockedCount: 0,
    pendingHumanGateCount: pendingHumanGates.length,
    pendingHumanGates,
    groups: [],
  };
}

function approvalDecisionToRuntimeResolution(input: {
  decision: LegacyHumanGateDecisionEnvelope;
  pending: PendingRuntimeApproval;
}): RuntimeApprovalResolution {
  if (input.decision.action === "approve" || input.decision.action === "approve_always") {
    return {
      status: "approved",
      resolvedBy: input.decision.action === "approve_always"
        ? "raxode.tui.approve_always"
        : "raxode.tui.approve_once",
      reason: input.decision.note ?? `${input.pending.featureDisplay} approved by human through Raxode TUI`,
      metadata: {
        approvalId: input.pending.envelope.approvalId,
        featureKey: input.pending.featureKey,
        featureDisplay: input.pending.featureDisplay,
        decision: input.decision.action,
      },
    };
  }
  return {
    status: "denied",
    resolvedBy: input.decision.action === "reject_stop"
      ? "raxode.tui.reject_stop"
      : "raxode.tui.reject",
    reason: input.decision.note ?? `${input.pending.featureDisplay} denied by human through Raxode TUI`,
    metadata: {
      approvalId: input.pending.envelope.approvalId,
      featureKey: input.pending.featureKey,
      featureDisplay: input.pending.featureDisplay,
      decision: input.decision.action,
      stopTurn: input.decision.action === "reject_stop",
    },
  };
}

async function writeLog(logPath: string, record: Record<string, unknown>): Promise<void> {
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function hasUsageNumber(usage: PraxisApplicationUsageTelemetry | undefined): usage is PraxisApplicationUsageTelemetry {
  return usage !== undefined && (
    typeof usage.inputTokens === "number" ||
    typeof usage.outputTokens === "number" ||
    typeof usage.thinkingTokens === "number" ||
    typeof usage.totalTokens === "number" ||
    typeof usage.cachedInputTokens === "number"
  );
}

function hasContextNumber(context: PraxisApplicationContextTelemetry | undefined): context is PraxisApplicationContextTelemetry {
  return context !== undefined && (
    typeof context.activeTokens === "number" ||
    typeof context.promptTokens === "number" ||
    typeof context.transcriptTokens === "number"
  );
}

type LegacyDirectContextSnapshot = ReturnType<typeof buildContextSnapshot>;

function buildContextSnapshot(result?: PraxisApplicationCommandResult) {
  const model = result?.view.model;
  const context = hasContextNumber(result?.view.context) ? result.view.context : undefined;
  const usage = hasUsageNumber(result?.view.usage) ? result.view.usage : undefined;
  const observedInputTokens = typeof usage?.lastInputTokens === "number" && Number.isFinite(usage.lastInputTokens)
    ? usage.lastInputTokens
    : typeof usage?.inputTokens === "number" && Number.isFinite(usage.inputTokens)
      ? usage.inputTokens
      : undefined;
  const observedTotalTokens = typeof usage?.lastTotalTokens === "number" && Number.isFinite(usage.lastTotalTokens)
    ? usage.lastTotalTokens
    : typeof usage?.totalTokens === "number" && Number.isFinite(usage.totalTokens)
      ? usage.totalTokens
      : undefined;
  const estimatedActiveTokens = context?.activeTokens ?? context?.promptTokens ?? 0;
  const activeTokens = observedInputTokens ?? estimatedActiveTokens;
  const transcriptTokens = context?.transcriptTokens ?? 0;
  const source = observedInputTokens === undefined
    ? context?.source ?? "application.history.estimate"
    : context?.source ?? "provider.model-call.usage";
  return {
    provider: model?.provider ?? "openai",
    model: model?.model ?? "gpt-5.5",
    promptKind: "applicationLayer",
    windowTokens: model?.contextWindowTokens ?? 400_000,
    maxInputTokens: model?.maxInputTokens ?? 272_000,
    inputBudgetThreshold: model?.inputBudgetThreshold ?? 0.95,
    usableInputTokens: model?.usableInputTokens ?? Math.floor(272_000 * 0.95),
    windowSource: model?.metadataSource ?? "manual-registry",
    contextSource: source,
    usageSource: usage?.source ?? context?.source ?? "application.history.estimate",
    activeTokens,
    promptTokens: activeTokens,
    lastRequestInputTokens: observedInputTokens,
    lastRequestTotalTokens: observedTotalTokens,
    transcriptTokens,
    summaryTokens: context?.summaryTokens ?? 0,
    historyMessages: context?.historyMessages ?? 0,
    estimated: observedInputTokens === undefined ? context?.estimated ?? true : false,
    compacted: context?.compacted ?? false,
  };
}

function isProviderBackedContext(context: LegacyDirectContextSnapshot | undefined): boolean {
  if (!context) {
    return false;
  }
  return context.contextSource === "provider.model-call.usage"
    || context.usageSource === "provider.model-call.usage"
    || typeof context.lastRequestInputTokens === "number"
    || typeof context.lastRequestTotalTokens === "number";
}

function contextFor(
  result?: PraxisApplicationCommandResult,
  options: { lastProviderContext?: LegacyDirectContextSnapshot } = {},
) {
  const nextContext = buildContextSnapshot(result);
  const previousProviderContext = options.lastProviderContext;
  if (
    result?.ok === false
    && !isProviderBackedContext(nextContext)
    && previousProviderContext !== undefined
    && isProviderBackedContext(previousProviderContext)
  ) {
    return {
      ...previousProviderContext,
      transcriptTokens: Math.max(
        previousProviderContext.transcriptTokens,
        nextContext.transcriptTokens,
      ),
      summaryTokens: Math.max(
        previousProviderContext.summaryTokens,
        nextContext.summaryTokens,
      ),
      historyMessages: Math.max(
        previousProviderContext.historyMessages,
        nextContext.historyMessages,
      ),
      retainedAfterFailure: true,
      failureContextSource: nextContext.contextSource,
    };
  }
  return nextContext;
}

function usageFor(result: PraxisApplicationCommandResult) {
  const usage = hasUsageNumber(result.view.usage) ? result.view.usage : undefined;
  if (usage === undefined) {
    return { estimated: true };
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    thinkingTokens: usage.thinkingTokens,
    totalTokens: usage.totalTokens,
    cachedInputTokens: usage.cachedInputTokens,
    lastInputTokens: usage.lastInputTokens,
    lastTotalTokens: usage.lastTotalTokens,
    source: usage.source,
    estimated: usage.estimated,
  };
}

function legacyResultErrorCode(error: { code: string; message: string }): string {
  if (error.code !== "MODEL_INVOCATION_FAILED") {
    return error.code;
  }
  const normalizedMessage = error.message.toLowerCase();
  if (
    normalizedMessage.includes("provider_http_error")
    || normalizedMessage.includes("provider_unavailable")
    || normalizedMessage.includes("status 503")
    || normalizedMessage.includes("upstream connect error")
    || normalizedMessage.includes("connection timeout")
  ) {
    return "PROVIDER_UNAVAILABLE";
  }
  return error.code;
}

function parseApplicationTurnIndex(turnId: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(turnId?.replace(/^turn\./u, "") ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function legacyStreamFrameMs(): number {
  const raw = Number.parseFloat(process.env.RAXODE_STREAM_FPS ?? process.env.RAXODE_RENDER_FPS ?? "120");
  const fps = Number.isFinite(raw) && raw > 0 ? raw : 120;
  return Math.max(1, 1000 / fps);
}

function chunkStreamText(text: string): string[] {
  const chars = Array.from(text);
  const targetChunkCount = Math.max(1, Math.min(chars.length, Math.ceil(chars.length / 8)));
  const chunkSize = Math.max(1, Math.ceil(chars.length / targetChunkCount));
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += chunkSize) {
    chunks.push(chars.slice(index, index + chunkSize).join(""));
  }
  return chunks;
}

async function waitFrame(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function stringMetadata(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayMetadata(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function numberMetadata(metadata: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordMetadata(metadata: Readonly<Record<string, unknown>> | undefined, key: string): Record<string, unknown> | undefined {
  const value = metadata?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function legacyToolStageRecord(input: {
  applicationEvent: PraxisApplicationEvent;
  sessionId: string;
  turnIndex: number;
}): Record<string, unknown> | undefined {
  if (input.applicationEvent.kind !== "tool") return undefined;
  const metadata = input.applicationEvent.metadata;
  const toolId = stringMetadata(metadata, "toolId");
  if (!toolId) return undefined;
  const toolStatus = stringMetadata(metadata, "toolStatus") ?? "completed";
  const running = toolStatus === "running";
  const humanResultSummary = running ? [] : stringArrayMetadata(metadata, "humanResultSummary");
  const errorPreview = running || humanResultSummary.length > 0 ? undefined : stringMetadata(metadata, "errorPreview");
  const resultMetadata = {
    ...recordMetadata(metadata, "resultMetadata"),
    toolCallId: stringMetadata(metadata, "toolCallId"),
    toolId,
    toolStatus,
    familyKey: stringMetadata(metadata, "familyKey"),
    familyTitle: stringMetadata(metadata, "familyTitle"),
    inputSummary: stringMetadata(metadata, "inputSummary"),
  };
  return {
    ts: input.applicationEvent.createdAt,
    event: running ? "stage_start" : "stage_end",
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    stage: "core/capability_bridge",
    status: running ? "running" : (toolStatus === "failed" ? "failed" : "completed"),
    capabilityKey: toolId,
    toolCallId: stringMetadata(metadata, "toolCallId"),
    familyKey: stringMetadata(metadata, "familyKey"),
    familyTitle: stringMetadata(metadata, "familyTitle"),
    inputSummary: stringMetadata(metadata, "inputSummary"),
    familyIntentSummary: stringMetadata(metadata, "inputSummary"),
    output: humanResultSummary.length > 0 ? humanResultSummary.join("\n") : undefined,
    error: errorPreview,
    familyResultSummary: humanResultSummary.length > 0
      ? humanResultSummary
      : [errorPreview].filter((line): line is string => typeof line === "string" && line.length > 0).slice(0, 3),
    resultMetadata,
    text: input.applicationEvent.message,
  };
}

function legacyModelStageRecord(input: {
  applicationEvent: PraxisApplicationEvent;
  sessionId: string;
  turnIndex: number;
}): Record<string, unknown> | undefined {
  if (input.applicationEvent.kind !== "model") return undefined;
  const metadata = input.applicationEvent.metadata;
  const modelPhase = stringMetadata(metadata, "modelPhase");
  if (modelPhase !== "started" && modelPhase !== "completed" && modelPhase !== "failed") return undefined;
  const model = stringMetadata(metadata, "model") ?? stringMetadata(metadata, "carrierId") ?? "model";
  const usage = recordMetadata(metadata, "usage");
  const context = recordMetadata(metadata, "context");
  const cacheDebug = recordMetadata(metadata, "cacheDebug");
  return {
    ts: input.applicationEvent.createdAt,
    event: modelPhase === "started" ? "stage_start" : "stage_end",
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    stage: "core/model.infer",
    status: modelPhase === "started" ? "running" : (modelPhase === "failed" ? "failed" : "completed"),
    label: "core/model.infer",
    text: modelPhase === "started"
      ? `Requesting ${model} and waiting for model decision.`
      : modelPhase === "completed"
        ? `${model} returned a model decision.`
        : stringMetadata(metadata, "errorMessage") ?? `${model} model request failed.`,
    usage,
    context,
    cacheDebug,
    resultMetadata: metadata,
  };
}

function legacyToolCallPreviewRecord(input: {
  applicationEvent: PraxisApplicationEvent;
  sessionId: string;
  turnIndex: number;
}): Record<string, unknown> | undefined {
  if (input.applicationEvent.kind !== "stream") return undefined;
  const metadata = input.applicationEvent.metadata;
  if (stringMetadata(metadata, "channel") !== "tool_call_preview") return undefined;
  const phase = stringMetadata(metadata, "phase") ?? "delta";
  return {
    ts: input.applicationEvent.createdAt,
    event: "tool_call_preview",
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    status: phase,
    stage: "core/tool_call.preview",
    toolCallId: stringMetadata(metadata, "callId"),
    itemId: stringMetadata(metadata, "itemId"),
    outputIndex: numberMetadata(metadata, "outputIndex"),
    providerToolName: stringMetadata(metadata, "providerToolName"),
    text: input.applicationEvent.message,
    argumentsDelta: stringMetadata(metadata, "argumentsDelta"),
    arguments: stringMetadata(metadata, "arguments"),
    rawType: stringMetadata(metadata, "rawType"),
  };
}

export async function startLegacyDirectApplicationBackend(options: LegacyDirectBackendOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const cwd = path.resolve(options.cwd ?? process.env.PRAXIS_WORKSPACE_ROOT ?? process.cwd());
  const sessionId = options.sessionId ?? process.env.PRAXIS_DIRECT_SESSION_ID ?? `direct-${Date.now()}`;
  const stateRoot = defaultStateRoot(cwd);
  const permissionProfile = normalizePermissionProfile(
    process.env.RAXODE_APPLICATION_PERMISSION_PROFILE
      ?? process.env.PRAXIS_PERMISSION_PROFILE,
  );
  const reportsDir = path.resolve(options.stateRoot ?? stateRoot, "live-reports");
  await mkdir(reportsDir, { recursive: true });
  const logPath = path.join(reportsDir, `legacy-direct-application-${sessionId.replace(/[^\w.-]+/gu, "_")}-${Date.now()}.jsonl`);
  output.write(`log file: ${logPath}\n`);
  output.write(`direct ready: ${sessionId}\n`);
  let runtimeEventLogQueue = Promise.resolve();
  const enqueueRuntimeEventLog = (record: Record<string, unknown>) => {
    runtimeEventLogQueue = runtimeEventLogQueue.then(() => writeLog(logPath, record)).catch((error: unknown) => {
      errorOutput.write(`legacy direct application backend runtime event log failed: ${error instanceof Error ? error.message : String(error)}\n`);
    });
    return runtimeEventLogQueue;
  };
  const pendingRuntimeApprovals = new Map<string, PendingRuntimeApproval>();
  const sessionApprovedFeatures = new Set<string>();
  const emitRuntimeApprovalPanelSnapshot = () => enqueueRuntimeEventLog({
    ts: options.now?.() ?? new Date().toISOString(),
    event: "panel_snapshot",
    sessionId,
    panel: "capabilities",
    snapshot: buildRuntimeApprovalPanelSnapshot(
      pendingRuntimeApprovals,
      () => options.now?.() ?? new Date().toISOString(),
    ),
  });
  const resolveHumanGateDecisionPayload = (decision: LegacyHumanGateDecisionEnvelope): boolean => {
    const pending = pendingRuntimeApprovals.get(decision.gateId);
    if (!pending) return false;
    pendingRuntimeApprovals.delete(decision.gateId);
    if (decision.action === "approve_always") {
      sessionApprovedFeatures.add(pending.featureKey);
    }
    void enqueueRuntimeEventLog({
      ts: options.now?.() ?? new Date().toISOString(),
      event: "approval_decision",
      sessionId,
      approvalId: decision.gateId,
      featureKey: pending.featureKey,
      action: decision.action,
      note: decision.note,
    });
    void emitRuntimeApprovalPanelSnapshot();
    pending.resolve(approvalDecisionToRuntimeResolution({ decision, pending }));
    return true;
  };
  const approvalResolver: RuntimeApprovalResolver = async (envelope) => {
    const feature = inferRuntimeApprovalFeature(envelope);
    if (sessionApprovedFeatures.has(feature.featureKey)) {
      return {
        status: "approved",
        resolvedBy: "raxode.tui.session_approval_cache",
        reason: `${feature.featureDisplay} was already approved for this session.`,
        metadata: {
          approvalId: envelope.approvalId,
          featureKey: feature.featureKey,
          featureDisplay: feature.featureDisplay,
          ...(feature.toolId ? { toolId: feature.toolId } : {}),
        },
      };
    }
    const resolution = new Promise<RuntimeApprovalResolution>((resolve) => {
      pendingRuntimeApprovals.set(envelope.approvalId, {
        envelope,
        featureKey: feature.featureKey,
        featureDisplay: feature.featureDisplay,
        resolve,
        ...(feature.toolId ? { toolId: feature.toolId } : {}),
      });
    });
    await enqueueRuntimeEventLog({
      ts: options.now?.() ?? new Date().toISOString(),
      event: "approval_requested",
      sessionId,
      approvalId: envelope.approvalId,
      featureKey: feature.featureKey,
      featureDisplay: feature.featureDisplay,
      toolId: feature.toolId,
      reason: envelope.reason,
      riskLevel: envelope.riskLevel,
    });
    await emitRuntimeApprovalPanelSnapshot();
    return resolution;
  };

  const inputClosed = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    input.on("end", finish);
    input.on("close", finish);
  });
  let buffer = "";
  let payloadQueue = Promise.resolve();
  const pendingPayloads: string[] = [];
  let handlePayloadImpl: ((rawPayload: string) => Promise<void>) | null = null;
  const enqueuePayload = (rawPayload: string) => {
    if (!handlePayloadImpl) {
      pendingPayloads.push(rawPayload);
      return;
    }
    const handler = handlePayloadImpl;
    payloadQueue = payloadQueue.then(() => handler(rawPayload)).catch((error: unknown) => {
      errorOutput.write(`legacy direct application backend payload failed: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  };

  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split("\u0000");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const decision = parseLegacyHumanGateDecision(part);
      if (decision && resolveHumanGateDecisionPayload(decision)) {
        continue;
      }
      enqueuePayload(part);
    }
  });

  const [
    applicationLayer,
    liveProviderModule,
    applicationModule,
  ] = await Promise.all([
    import("@praxis-ai/praxis/application-layer"),
    import("./authentication/liveProvider.js"),
    import("./application/raxodeApplication.js"),
  ]);
  const modelOptions = liveProviderModule.resolveRaxodeConfiguredModelOptions({
    roleId: "core.main",
    startDir: cwd,
  });

  const created = await applicationLayer.createApplicationProjectRuntime(options.projectRoot ?? defaultProjectRoot(), {
    applicationId: applicationModule.raxodeApplication.id,
    mode: options.mode ?? (process.env.RAXODE_LEGACY_APPLICATION_MODE === "dry-run" ? "dry-run" : "live"),
    provider: modelOptions.provider,
    endpointShape: modelOptions.endpointShape,
    baseURL: modelOptions.baseURL,
    providerRoute: modelOptions.providerRoute,
    model: modelOptions.model,
    reasoningEffort: modelOptions.reasoningEffort,
    maxOutputTokens: modelOptions.maxOutputTokens,
    permissionProfile,
    now: options.now,
    liveProviderResolver: options.liveProviderResolver ?? (async (manifest, context) => liveProviderModule.createRaxodeLiveProvider(manifest, {
      startDir: cwd,
      sessionId: context?.sessionId,
      runtimeId: context?.runtimeId,
      turnId: context?.turnId,
      onTextDelta: context?.onTextDelta,
      onProviderStreamEvent: context?.onProviderStreamEvent,
    })),
    approvalResolver,
  });
  if (!created.ok) {
    await writeLog(logPath, {
      ts: options.now?.() ?? new Date().toISOString(),
      event: "stage_end",
      sessionId,
      turnIndex: 0,
      stage: "application/start",
      status: "failed",
      text: created.error.message,
    });
    errorOutput.write(`legacy direct application backend failed: ${created.error.message}\n`);
    return;
  }

  const transport = applicationLayer.createLocalApplicationTransport(created.runtime);
  const streamedTextByTurn = new Map<number, string>();
  const legacyTurnIndexByApplicationTurnId = new Map<string, number>();
  const initialTurnIndex = normalizeInitialTurnIndex(
    options.initialTurnIndex ?? process.env.PRAXIS_DIRECT_INITIAL_TURN_INDEX,
  );
  let turnIndex = initialTurnIndex;
  let activeLegacyTurnIndex: number | undefined;
  let lastProviderContext: LegacyDirectContextSnapshot | undefined;
  transport.subscribe((applicationEvent) => {
    const legacyTurnIndex = (() => {
      const applicationTurnId = applicationEvent.turnId;
      if (applicationTurnId) {
        const existing = legacyTurnIndexByApplicationTurnId.get(applicationTurnId);
        if (existing !== undefined) {
          return existing;
        }
        if (activeLegacyTurnIndex !== undefined) {
          legacyTurnIndexByApplicationTurnId.set(applicationTurnId, activeLegacyTurnIndex);
          return activeLegacyTurnIndex;
        }
      }
      return parseApplicationTurnIndex(applicationTurnId, turnIndex || 1);
    })();
    const modelStageRecord = legacyModelStageRecord({
      applicationEvent,
      sessionId,
      turnIndex: legacyTurnIndex,
    });
    if (modelStageRecord) {
      const modelContext = recordMetadata(modelStageRecord, "context") as LegacyDirectContextSnapshot | undefined;
      if (isProviderBackedContext(modelContext)) {
        lastProviderContext = modelContext;
      }
      void enqueueRuntimeEventLog(modelStageRecord);
      return;
    }
    const toolStageRecord = legacyToolStageRecord({
      applicationEvent,
      sessionId,
      turnIndex: legacyTurnIndex,
    });
    if (toolStageRecord) {
      void enqueueRuntimeEventLog(toolStageRecord);
      return;
    }
    const toolCallPreviewRecord = legacyToolCallPreviewRecord({
      applicationEvent,
      sessionId,
      turnIndex: legacyTurnIndex,
    });
    if (toolCallPreviewRecord) {
      void enqueueRuntimeEventLog(toolCallPreviewRecord);
      return;
    }
    if (applicationEvent.kind !== "stream" || applicationEvent.message.length === 0) {
      return;
    }
    streamedTextByTurn.set(legacyTurnIndex, `${streamedTextByTurn.get(legacyTurnIndex) ?? ""}${applicationEvent.message}`);
    void enqueueRuntimeEventLog({
      ts: applicationEvent.createdAt,
      event: "assistant_delta",
      sessionId,
      turnIndex: legacyTurnIndex,
      label: "core/model.infer",
      text: applicationEvent.message,
      done: false,
    });
  });
  const start = await transport.dispatch({
    type: "application.start",
    sessionId,
    cwd,
    mode: options.mode ?? (process.env.RAXODE_LEGACY_APPLICATION_MODE === "dry-run" ? "dry-run" : "live"),
  });
  await writeLog(logPath, {
    ts: options.now?.() ?? new Date().toISOString(),
    event: "session_start",
    sessionId,
    initialTurnIndex,
    context: contextFor(start, { lastProviderContext }),
  });

  const handlePayload = async (rawPayload: string) => {
    const payload = rawPayload.trim();
    if (!payload) return;
    await writeLog(logPath, {
      ts: options.now?.() ?? new Date().toISOString(),
      event: "stdin_payload_received",
      sessionId,
      byteLength: Buffer.byteLength(rawPayload, "utf8"),
      preview: payload.slice(0, 120),
    });
    if (payload === "/exit" || payload === "/quit") {
      await transport.dispatch({ type: "application.close", sessionId });
      if ("destroy" in input && typeof input.destroy === "function") {
        input.destroy();
      }
      return;
    }
    if (payload.startsWith("/rewind")) {
      await transport.dispatch({ type: "application.rewind", sessionId, turnIndex: Math.max(0, turnIndex - 1) });
      legacyTurnIndexByApplicationTurnId.clear();
      await writeLog(logPath, {
        ts: options.now?.() ?? new Date().toISOString(),
        event: "rewind_applied",
        sessionId,
        targetTurnId: String(Math.max(0, turnIndex - 1)),
      });
      return;
    }

    const normalized = normalizeDirectPayload(payload);
    turnIndex += 1;
    const turnStartedAt = options.now?.() ?? new Date().toISOString();
    await writeLog(logPath, {
      ts: turnStartedAt,
      event: "turn_start",
      sessionId,
      turnIndex,
      userMessage: normalized.text,
      inputSource: normalized.inputSource,
      context: contextFor(start, { lastProviderContext }),
    });
    await writeLog(logPath, {
      ts: turnStartedAt,
      event: "stage_start",
      sessionId,
      turnIndex,
      stage: "core/run",
      status: "running",
      text: "Raxode application backend is running.",
    });

    const dispatchStartedAtMs = Date.now();
    activeLegacyTurnIndex = turnIndex;
    const result = await (async () => {
      try {
        return await transport.dispatch({
          type: "application.submitTurn",
          sessionId,
          mode: options.mode ?? (process.env.RAXODE_LEGACY_APPLICATION_MODE === "dry-run" ? "dry-run" : "live"),
          input: {
            type: "application.input",
            text: normalized.text,
            attachments: normalized.attachments,
            cwd,
          },
        });
      } finally {
        activeLegacyTurnIndex = undefined;
      }
    })();
    const dispatchElapsedMs = Math.max(0, Date.now() - dispatchStartedAtMs);
    await runtimeEventLogQueue;
    const finalText = result.view.finalOutput ?? result.view.error?.message ?? "";
    if (finalText.length > 0 && (streamedTextByTurn.get(turnIndex) ?? "").length === 0) {
      for (const chunk of chunkStreamText(finalText)) {
        await writeLog(logPath, {
          ts: options.now?.() ?? new Date().toISOString(),
          event: "assistant_delta",
          sessionId,
          turnIndex,
          label: "core/model.infer",
          text: chunk,
          done: false,
        });
        await waitFrame(legacyStreamFrameMs());
      }
    }
    const completedAt = options.now?.() ?? new Date().toISOString();
    await writeLog(logPath, {
      ts: completedAt,
      event: "stage_end",
      sessionId,
      turnIndex,
      stage: "core/run",
      status: result.ok ? "completed" : "failed",
      text: result.ok ? "Raxode application backend completed." : result.view.error?.message ?? "Raxode application backend failed.",
    });
    const finalContext = contextFor(result, { lastProviderContext });
    if (isProviderBackedContext(finalContext)) {
      lastProviderContext = finalContext;
    }
    const resultMetadata = result.ok
      ? undefined
      : {
          errorCode: legacyResultErrorCode(result.view.error ?? result.error),
          errorMessage: result.view.error?.message ?? result.error.message,
        };
    await writeLog(logPath, {
      ts: completedAt,
      event: "turn_result",
      sessionId,
      turnIndex,
      elapsedMs: dispatchElapsedMs,
      core: {
        answer: finalText,
        dispatchStatus: result.ok ? "completed" : "failed",
        taskStatus: result.ok ? "completed" : "failed",
        context: finalContext,
        usage: usageFor(result),
        elapsedMs: dispatchElapsedMs,
      },
      context: finalContext,
      resultMetadata,
    });
  };
  handlePayloadImpl = handlePayload;
  for (const pendingPayload of pendingPayloads.splice(0)) {
    enqueuePayload(pendingPayload);
  }

  await inputClosed;
  await payloadQueue;
  await writeLog(logPath, {
    ts: options.now?.() ?? new Date().toISOString(),
    event: "session_end",
    sessionId,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await startLegacyDirectApplicationBackend();
}
