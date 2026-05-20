/*
 * 文件定位：raxode-cli / backend authentication live provider。
 * 核心目的：把 Raxode live-run 接到本机 Codex ChatGPT 登录态，而不污染 framework applicationLayer。
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { AgentManifest } from "@praxis-ai/praxis/agent-core";
import type { AnthropicV1MessagesProviderCaller } from "@praxis-ai/praxis/provider/actualInvocationLayer/anthropic/v1_messages";
import type { OpenAiV1ChatCompletionsProviderCaller } from "@praxis-ai/praxis/provider/actualInvocationLayer/openai/v1_chat_completions";
import type { OpenAIV1ResponsesProviderCaller } from "@praxis-ai/praxis/provider/actualInvocationLayer/openai/v1_responses";
import type { AuthEnvelope, ProviderAuthMaterial } from "@praxis-ai/praxis/provider/authProfileLayer/authEnvelope";
import { resolveAuthEnvelope } from "@praxis-ai/praxis/provider/authProfileLayer/authResolver";
import { createCredentialRef, type CredentialType } from "@praxis-ai/praxis/provider/authProfileLayer/credentialRef";
import {
  resolveRaxodeProviderRequestUrl,
  type RaxodeUrlMode,
} from "@praxis-ai/praxis/provider/authProfileLayer/providerConfiguration";
import { createProviderCaller, type ProviderCaller } from "@praxis-ai/praxis/provider/providerAccessLayer/providerCaller";
import {
  ANTHROPIC_DEFAULT_MESSAGES_BASE_URL,
  CHATGPT_CODEX_DEFAULT_BASE_URL,
  createAnthropicV1MessagesCarrier,
  createChatGPTCodexResponsesCarrier,
  createOpenAIV1ChatCompletionsCarrier,
  createOpenAIV1ResponsesCarrier,
  OPENAI_DEFAULT_CHAT_COMPLETIONS_BASE_URL,
  OPENAI_DEFAULT_RESPONSES_BASE_URL,
} from "@praxis-ai/praxis/provider/providerAccessLayer/providerCarrier";
import {
  fetchProviderTransport,
  type ProviderTransport,
  type ProviderTransportRequest,
  type ProviderTransportResponse,
} from "@praxis-ai/praxis/provider/providerAccessLayer/transportCaller";
import {
  loadResolvedRoleConfig,
  type RaxodeAuthProfile,
  type RaxodeReasoningEffort,
  type RaxodeResolvedRoleConfig,
  type RaxodeRoleId,
} from "../../frontend/tui/config/raxode-config.js";

export type RaxodeLiveProvider = {
  auth: AuthEnvelope;
  providerCaller?: OpenAIV1ResponsesProviderCaller;
  openaiResponsesCaller?: OpenAIV1ResponsesProviderCaller;
  openaiChatCompletionsCaller?: OpenAiV1ChatCompletionsProviderCaller;
  anthropicMessagesCaller?: AnthropicV1MessagesProviderCaller;
  authSource: string;
  provider?: string;
  endpointShape?: RaxodeEndpointShape;
  providerRoute?: RaxodeProviderRoute;
};

export type RaxodeProviderRoute =
  | "chatgpt_codex_responses"
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages";

export type RaxodeEndpointShape = "responses" | "chat_completions" | "messages";

export type RaxodeConfiguredModelOptions = {
  provider: "openai" | "anthropic";
  model: string;
  reasoningEffort: RaxodeReasoningEffort;
  maxOutputTokens?: number;
  endpointShape: RaxodeEndpointShape;
  baseURL?: string;
  urlMode?: RaxodeUrlMode;
  finalRequestURL?: string;
  providerRoute: RaxodeProviderRoute;
  roleId: RaxodeRoleId;
  authSource: "raxode-config" | "codex-env";
};

export type RaxodeCodexRoutingOptions = {
  sessionId?: string;
  runtimeId?: string;
  turnId?: string;
  installationId?: string;
  windowId?: string;
};

export type RaxodeProviderStreamEvent = {
  channel: "tool_call_preview";
  phase: "started" | "delta" | "done";
  itemId?: string;
  outputIndex?: number;
  callId?: string;
  providerToolName?: string;
  argumentsDelta?: string;
  arguments?: string;
  rawType?: string;
};

export type RaxodeToolCallPreviewState = Map<string, {
  itemId?: string;
  outputIndex?: number;
  callId?: string;
  providerToolName?: string;
  argumentsText?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendQuery(url: string, query: Readonly<Record<string, string>> | undefined): string {
  const entries = Object.entries(query ?? {}).filter(([key, value]) => key.trim().length > 0 && value.trim().length > 0);
  if (entries.length === 0) return url;
  const target = new URL(url);
  for (const [key, value] of entries) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

function cleanHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^[\x20-\x7e]+$/u.test(trimmed) ? trimmed : undefined;
}

function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return cleanHeaderValue(value);
    }
  }
  return undefined;
}

function readCodexInstallationId(codexAuthPath: string): string | undefined {
  const installationPath = path.join(path.dirname(codexAuthPath), "installation_id");
  try {
    return cleanHeaderValue(readFileSync(installationPath, "utf8"));
  } catch {
    return undefined;
  }
}

function codexTurnMetadata(options: RaxodeCodexRoutingOptions): string | undefined {
  const turnId = cleanHeaderValue(options.turnId);
  const sessionId = cleanHeaderValue(options.sessionId);
  const runtimeId = cleanHeaderValue(options.runtimeId);
  if (turnId === undefined && sessionId === undefined && runtimeId === undefined) return undefined;
  return JSON.stringify({
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(turnId ? { turn_id: turnId } : {}),
    ...(runtimeId ? { runtime_id: runtimeId } : {}),
    source: "raxode",
  });
}

function withCodexClientMetadata(body: unknown, options: RaxodeCodexRoutingOptions): unknown {
  if (body === null || typeof body !== "object" || Array.isArray(body) || body instanceof FormData) {
    return body;
  }
  const record = body as Record<string, unknown>;
  const currentMetadata =
    record.client_metadata !== null && typeof record.client_metadata === "object" && !Array.isArray(record.client_metadata)
      ? record.client_metadata as Record<string, unknown>
      : {};
  const installationId = cleanHeaderValue(options.installationId);
  const windowId = cleanHeaderValue(options.windowId ?? options.runtimeId);
  return {
    ...record,
    client_metadata: {
      ...currentMetadata,
      ...(installationId ? { "x-codex-installation-id": installationId } : {}),
      ...(windowId ? { "x-codex-window-id": windowId } : {}),
    },
  };
}

export function createCodexRoutingTransport(
  baseTransport: ProviderTransport,
  options: RaxodeCodexRoutingOptions = {},
): ProviderTransport {
  let turnState: string | undefined;
  return async (request: ProviderTransportRequest): Promise<ProviderTransportResponse> => {
    const sessionId = cleanHeaderValue(options.sessionId);
    const requestId = sessionId;
    const metadata = codexTurnMetadata(options);
    const installationId = cleanHeaderValue(options.installationId);
    const windowId = cleanHeaderValue(options.windowId ?? options.runtimeId);
    const headers: Record<string, string> = {
      ...(request.headers ?? {}),
      ...(requestId ? { "x-client-request-id": requestId, session_id: requestId } : {}),
      ...(metadata ? { "x-codex-turn-metadata": metadata } : {}),
      ...(turnState ? { "x-codex-turn-state": turnState } : {}),
      ...(installationId ? { "x-codex-installation-id": installationId } : {}),
      ...(windowId ? { "x-codex-window-id": windowId } : {}),
    };
    const response = await baseTransport({
      ...request,
      headers,
      body: withCodexClientMetadata(request.body, { ...options, installationId, windowId }),
    });
    turnState = headerValue(response.headers, "x-codex-turn-state") ?? turnState;
    return response;
  };
}

export function readSseTextDelta(payload: string): string {
  if (payload.length === 0 || payload === "[DONE]") return "";
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) return "";
    const type = typeof parsed.type === "string" ? parsed.type : "";
    const delta = parsed.delta;
    if (
      typeof delta === "string"
      && (
        type.includes("output_text")
        || type.includes("summary_text")
        || type.includes("reasoning_summary")
      )
    ) {
      return delta;
    }
    if (isRecord(delta) && typeof delta.text === "string" && type === "content_block_delta") {
      return delta.text;
    }
    const choices = parsed.choices;
    if (Array.isArray(choices)) {
      const firstChoice = choices.find(isRecord);
      const choiceDelta = isRecord(firstChoice?.delta) ? firstChoice.delta : undefined;
      if (typeof choiceDelta?.content === "string") {
        return choiceDelta.content;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBaseURL(value: string | undefined): string | undefined {
  const trimmed = cleanText(value);
  return trimmed?.replace(/\/+$/u, "");
}

function codexEnvCompatibilityRequested(): boolean {
  return hasText(process.env.AGENTCORE_CODEX_MODEL) || hasText(process.env.AGENTCORE_CODEX_REASONING_EFFORT);
}

function shouldUseCodexEnvCompatibility(options: { forceCodexEnvCompatibility?: boolean }): boolean {
  return options.forceCodexEnvCompatibility === true && codexEnvCompatibilityRequested();
}

function roleIdForManifest(manifest: AgentManifest): RaxodeRoleId {
  return manifest.identity.id === "agent.raxode.tui" ? "tui.main" : "core.main";
}

function normalizedApiStyle(value: string | undefined): string {
  return (value ?? "responses").trim().toLowerCase().replace(/[./-]+/gu, "_");
}

function providerRouteForResolvedConfig(config: RaxodeResolvedRoleConfig): RaxodeProviderRoute {
  const provider = config.profile.provider;
  const apiStyle = normalizedApiStyle(config.profile.route.apiStyle);
  if (provider === "anthropic" || apiStyle === "messages") {
    return "anthropic_messages";
  }
  if (
    apiStyle === "chat_completions" ||
    apiStyle === "chat_completions_compat" ||
    apiStyle === "compatible" ||
    apiStyle === "openai_compatible" ||
    apiStyle === "completions"
  ) {
    return "openai_chat_completions";
  }
  if (provider === "openai" && config.authProfile.authMode === "chatgpt_oauth") {
    return "chatgpt_codex_responses";
  }
  return "openai_responses";
}

function endpointShapeForRoute(route: RaxodeProviderRoute): RaxodeEndpointShape {
  if (route === "anthropic_messages") return "messages";
  if (route === "openai_chat_completions") return "chat_completions";
  return "responses";
}

function providerForRoute(route: RaxodeProviderRoute): "openai" | "anthropic" {
  return route === "anthropic_messages" ? "anthropic" : "openai";
}

function defaultBaseURLForRoute(route: RaxodeProviderRoute): string {
  switch (route) {
    case "anthropic_messages":
      return ANTHROPIC_DEFAULT_MESSAGES_BASE_URL;
    case "openai_chat_completions":
      return OPENAI_DEFAULT_CHAT_COMPLETIONS_BASE_URL;
    case "openai_responses":
      return OPENAI_DEFAULT_RESPONSES_BASE_URL;
    case "chatgpt_codex_responses":
      return CHATGPT_CODEX_DEFAULT_BASE_URL;
  }
}

export function resolveRaxodeConfiguredModelOptions(options: {
  roleId?: RaxodeRoleId;
  startDir?: string;
  forceCodexEnvCompatibility?: boolean;
} = {}): RaxodeConfiguredModelOptions {
  const roleId = options.roleId ?? "core.main";
  const resolved = loadResolvedRoleConfig(roleId, options.startDir);
  const providerRoute = providerRouteForResolvedConfig(resolved);
  if (shouldUseCodexEnvCompatibility(options)) {
    return {
      provider: "openai",
      model: cleanText(process.env.AGENTCORE_CODEX_MODEL) ?? "gpt-5.5",
      reasoningEffort: (cleanText(process.env.AGENTCORE_CODEX_REASONING_EFFORT) as RaxodeReasoningEffort | undefined) ?? "low",
      maxOutputTokens: undefined,
      endpointShape: "responses",
      baseURL: CHATGPT_CODEX_DEFAULT_BASE_URL,
      urlMode: "literal",
      finalRequestURL: CHATGPT_CODEX_DEFAULT_BASE_URL,
      providerRoute: "chatgpt_codex_responses",
      roleId,
      authSource: "codex-env",
    };
  }

  const endpointShape = endpointShapeForRoute(providerRoute);
  const configuredBaseURL = cleanText(resolved.profile.route.baseURL);
  if (providerRoute === "chatgpt_codex_responses") {
    return {
      provider: "openai",
      model: resolved.binding.overrides?.model ?? resolved.profile.model,
      reasoningEffort: resolved.binding.overrides?.reasoning ?? resolved.profile.reasoningEffort ?? "low",
      maxOutputTokens: resolved.binding.overrides?.maxOutputTokens ?? resolved.profile.maxOutputTokens,
      endpointShape,
      baseURL: configuredBaseURL ?? CHATGPT_CODEX_DEFAULT_BASE_URL,
      urlMode: resolved.profile.route.urlMode ?? "literal",
      finalRequestURL: cleanText(resolved.profile.route.finalRequestURL) ?? configuredBaseURL ?? CHATGPT_CODEX_DEFAULT_BASE_URL,
      providerRoute,
      roleId,
      authSource: "raxode-config",
    };
  }
  const routePlan = configuredBaseURL === undefined
    ? undefined
    : resolveRaxodeProviderRequestUrl({
        inputBaseURL: configuredBaseURL,
        endpointShape,
      });
  if (routePlan?.ok === false) {
    throw new Error(routePlan.error.message);
  }
  const plannedURL = routePlan?.ok === true ? routePlan.plan.finalRequestURL : undefined;
  const plannedMode = routePlan?.ok === true ? routePlan.plan.urlMode : undefined;
  return {
    provider: providerForRoute(providerRoute),
    model: resolved.binding.overrides?.model ?? resolved.profile.model,
    reasoningEffort: resolved.binding.overrides?.reasoning ?? resolved.profile.reasoningEffort ?? "none",
    maxOutputTokens: resolved.binding.overrides?.maxOutputTokens ?? resolved.profile.maxOutputTokens,
    endpointShape,
    baseURL: configuredBaseURL ?? defaultBaseURLForRoute(providerRoute),
    urlMode: resolved.profile.route.urlMode ?? plannedMode,
    finalRequestURL: cleanText(resolved.profile.route.finalRequestURL) ?? plannedURL,
    providerRoute,
    roleId,
    authSource: "raxode-config",
  };
}

function metadataString(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function providerRouteFromManifest(manifest: AgentManifest): RaxodeProviderRoute | undefined {
  const explicit = metadataString(manifest.model.metadata, "providerRoute");
  if (
    explicit === "chatgpt_codex_responses" ||
    explicit === "openai_responses" ||
    explicit === "openai_chat_completions" ||
    explicit === "anthropic_messages"
  ) {
    return explicit;
  }
  if (manifest.model.provider === "anthropic" || manifest.model.endpointShape === "messages") {
    return "anthropic_messages";
  }
  if (manifest.model.endpointShape === "chat_completions") {
    return "openai_chat_completions";
  }
  return undefined;
}

function resolvedConfigForRoute(options: {
  roleId: RaxodeRoleId;
  startDir?: string;
  authSource: RaxodeConfiguredModelOptions["authSource"];
}): RaxodeResolvedRoleConfig | undefined {
  if (options.authSource === "codex-env") return undefined;
  return loadResolvedRoleConfig(options.roleId, options.startDir);
}

function credentialTypeForRoute(route: RaxodeProviderRoute): CredentialType {
  if (route === "anthropic_messages") return "anthropic_api_key";
  if (route === "chatgpt_codex_responses") return "chatgpt_codex_oauth";
  return "openai_api_key";
}

function createCredentialForRoute(input: {
  manifest: AgentManifest;
  route: RaxodeProviderRoute;
  source: { kind: "injected"; label: string } | { kind: "codex-auth-file"; filePath: string };
}) {
  const credentialRef = createCredentialRef({
    id: `raxode:${input.manifest.identity.id}:${input.route}`,
    provider: providerForRoute(input.route),
    credentialType: credentialTypeForRoute(input.route),
    source: input.source,
  });
  if (!credentialRef.ok) {
    throw new Error(`credentialRef failed: ${JSON.stringify(credentialRef.error)}`);
  }
  return credentialRef.credentialRef;
}

function authMaterialForChatGPTProfile(authProfile: RaxodeAuthProfile | undefined): ProviderAuthMaterial | undefined {
  const accessToken = cleanText(authProfile?.credentials.accessToken);
  if (!accessToken) return undefined;
  const accountId = cleanText(authProfile?.credentials.accountId)
    ?? cleanText(authProfile?.meta.chatgptAccountId)
    ?? cleanText(authProfile?.meta.accountId);
  return {
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(accountId ? { "ChatGPT-Account-ID": accountId } : {}),
    },
    expiresAt: cleanText(authProfile?.meta.accessTokenExpiresAt),
  };
}

function resolveRouteAuth(input: {
  manifest: AgentManifest;
  route: RaxodeProviderRoute;
  codexAuthPath: string;
  resolvedConfig?: RaxodeResolvedRoleConfig;
}): { auth: AuthEnvelope; material?: ProviderAuthMaterial; source: string } {
  if (input.route === "chatgpt_codex_responses") {
    const injected = authMaterialForChatGPTProfile(input.resolvedConfig?.authProfile);
    if (injected !== undefined) {
      const credentialRef = createCredentialForRoute({
        manifest: input.manifest,
        route: input.route,
        source: { kind: "injected", label: input.resolvedConfig?.authProfile.id ?? "raxode-chatgpt-oauth" },
      });
      const auth = resolveAuthEnvelope({
        credentialRef,
        injectedMaterial: injected,
      });
      if (!auth.ok) {
        throw new Error(`auth failed: ${JSON.stringify(auth.error)}`);
      }
      return {
        auth: auth.resolved.envelope,
        material: auth.resolved.privateMaterial,
        source: input.resolvedConfig?.authProfile.id ?? "raxode-chatgpt-oauth",
      };
    }

    const credentialRef = createCredentialForRoute({
      manifest: input.manifest,
      route: input.route,
      source: { kind: "codex-auth-file", filePath: input.codexAuthPath },
    });
    const auth = resolveAuthEnvelope({
      credentialRef,
      readFile: (filePath) => readFileSync(filePath, "utf8"),
    });
    if (!auth.ok) {
      throw new Error(`auth failed: ${JSON.stringify(auth.error)}`);
    }
    return {
      auth: auth.resolved.envelope,
      material: auth.resolved.privateMaterial,
      source: input.codexAuthPath,
    };
  }

  const authProfile = input.resolvedConfig?.authProfile;
  const apiKey = cleanText(authProfile?.credentials.apiKey);
  const credentialRef = createCredentialForRoute({
    manifest: input.manifest,
    route: input.route,
    source: { kind: "injected", label: authProfile?.id ?? input.route },
  });
  const auth = resolveAuthEnvelope({
    credentialRef,
    injectedSecret: apiKey,
  });
  if (!auth.ok) {
    throw new Error(`auth failed: ${JSON.stringify(auth.error)}`);
  }
  return {
    auth: auth.resolved.envelope,
    material: auth.resolved.privateMaterial,
    source: authProfile?.id ?? input.route,
  };
}

function createResponsesCaller(rawCaller: ProviderCaller, finalRequestURL?: string): OpenAIV1ResponsesProviderCaller {
  return async (request) => rawCaller({
    method: request.method,
    url: finalRequestURL ?? request.url,
    headers: request.headers,
    query: request.query,
    body: request.body,
    provider: "openai",
    endpoint: request.endpoint,
  });
}

function createChatCompletionsCaller(rawCaller: ProviderCaller, finalRequestURL?: string): OpenAiV1ChatCompletionsProviderCaller {
  return async (request) => rawCaller({
    method: request.method,
    url: finalRequestURL ?? request.url,
    headers: request.headers,
    body: request.requestBody,
    provider: "openai",
    endpoint: request.endpoint,
  });
}

function createMessagesCaller(rawCaller: ProviderCaller, baseURL: string, finalRequestURL?: string): AnthropicV1MessagesProviderCaller {
  const normalizedBaseURL = normalizeBaseURL(baseURL) ?? ANTHROPIC_DEFAULT_MESSAGES_BASE_URL;
  return async (request) => rawCaller({
    method: request.method,
    url: finalRequestURL ?? `${normalizedBaseURL}${request.urlPath}`,
    headers: request.headers,
    query: request.query,
    body: request.body,
    provider: "anthropic",
    endpoint: request.endpoint,
  });
}

export function readSseToolCallPreviewEvents(payload: string): readonly RaxodeProviderStreamEvent[] {
  if (payload.length === 0 || payload === "[DONE]") return [];
  const events: RaxodeProviderStreamEvent[] = [];
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) return [];
    const type = readString(parsed.type);
    const outputIndex = readNumber(parsed.output_index);
    const itemId = readString(parsed.item_id);
    if ((type === "response.output_item.added" || type === "response.output_item.done") && isRecord(parsed.item)) {
      const item = parsed.item;
      if (item.type !== "function_call") return [];
      events.push({
        channel: "tool_call_preview",
        phase: type === "response.output_item.added" ? "started" : "done",
        itemId: readString(item.id) ?? itemId,
        outputIndex,
        callId: readString(item.call_id),
        providerToolName: readString(item.name),
        arguments: readString(item.arguments),
        rawType: type,
      });
    }
    if (type === "response.function_call_arguments.delta") {
      const delta = readString(parsed.delta);
      if (delta !== undefined) {
        events.push({
          channel: "tool_call_preview",
          phase: "delta",
          itemId,
          outputIndex,
          callId: readString(parsed.call_id),
          argumentsDelta: delta,
          rawType: type,
        });
      }
    }
    if (type === "response.function_call_arguments.done") {
      events.push({
        channel: "tool_call_preview",
        phase: "done",
        itemId,
        outputIndex,
        callId: readString(parsed.call_id),
        arguments: readString(parsed.arguments),
        rawType: type,
      });
    }

    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      const delta = isRecord(choice.delta) ? choice.delta : undefined;
      const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
      for (const toolCall of toolCalls) {
        if (!isRecord(toolCall)) continue;
        const functionRecord = isRecord(toolCall.function) ? toolCall.function : undefined;
        const callId = readString(toolCall.id) ?? readString(toolCall.call_id);
        const index = readNumber(toolCall.index);
        const providerToolName = readString(functionRecord?.name) ?? readString(toolCall.name);
        const argumentsDelta = typeof functionRecord?.arguments === "string"
          ? functionRecord.arguments
          : typeof toolCall.arguments === "string"
            ? toolCall.arguments
            : undefined;
        if (providerToolName !== undefined || callId !== undefined || argumentsDelta !== undefined) {
          events.push({
            channel: "tool_call_preview",
            phase: argumentsDelta !== undefined ? "delta" : "started",
            itemId: callId === undefined ? undefined : `chat:${callId}`,
            outputIndex: index,
            callId,
            providerToolName,
            argumentsDelta,
            rawType: "chat.completion.tool_call.delta",
          });
        }
      }
    }
    if (type === "content_block_start" && isRecord(parsed.content_block)) {
      const block = parsed.content_block;
      if (block.type === "tool_use") {
        const providerToolName = readString(block.name);
        const callId = readString(block.id);
        const blockInput = isRecord(block.input) && Object.keys(block.input).length > 0
          ? JSON.stringify(block.input)
          : undefined;
        if (providerToolName !== undefined || callId !== undefined) {
          events.push({
            channel: "tool_call_preview",
            phase: "started",
            itemId: callId,
            outputIndex: readNumber(parsed.index) ?? outputIndex,
            callId,
            providerToolName,
            arguments: blockInput,
            rawType: type,
          });
        }
      }
    }
    if (type === "content_block_delta" && isRecord(parsed.delta)) {
      const delta = parsed.delta;
      if (delta.type === "input_json_delta") {
        const partialJson = readString(delta.partial_json);
        if (partialJson !== undefined) {
          events.push({
            channel: "tool_call_preview",
            phase: "delta",
            outputIndex: readNumber(parsed.index) ?? outputIndex,
            argumentsDelta: partialJson,
            rawType: type,
          });
        }
      }
    }
    if (type === "content_block_stop") {
      events.push({
        channel: "tool_call_preview",
        phase: "done",
        outputIndex: readNumber(parsed.index) ?? outputIndex,
        rawType: type,
      });
    }
    return events;
  } catch {
    return [];
  }
}

export function readSseToolCallPreviewEvent(payload: string): RaxodeProviderStreamEvent | undefined {
  return readSseToolCallPreviewEvents(payload)[0];
}

function looksLikeSseChunk(value: string): boolean {
  return /(?:^|\n)(?:event|data):\s*/u.test(value);
}

function previewStateKeys(event: RaxodeProviderStreamEvent): string[] {
  return [
    event.itemId ? `item:${event.itemId}` : undefined,
    event.callId ? `call:${event.callId}` : undefined,
    typeof event.outputIndex === "number" ? `output:${event.outputIndex}` : undefined,
  ].filter((key): key is string => key !== undefined);
}

function rememberToolCallPreviewEvent(
  state: RaxodeToolCallPreviewState,
  event: RaxodeProviderStreamEvent,
): RaxodeProviderStreamEvent {
  const known = previewStateKeys(event)
    .map((key) => state.get(key))
    .find((entry) => entry !== undefined);
  const nextArgumentsText = event.arguments
    ?? (event.argumentsDelta === undefined ? known?.argumentsText : `${known?.argumentsText ?? ""}${event.argumentsDelta}`);
  const enriched: RaxodeProviderStreamEvent = {
    ...event,
    itemId: event.itemId ?? known?.itemId,
    outputIndex: event.outputIndex ?? known?.outputIndex,
    callId: event.callId ?? known?.callId,
    providerToolName: event.providerToolName ?? known?.providerToolName,
    arguments: event.arguments ?? (event.phase === "done" ? nextArgumentsText : undefined),
  };
  const shouldRemember = enriched.itemId !== undefined
    || enriched.callId !== undefined
    || enriched.providerToolName !== undefined;
  if (shouldRemember) {
    const snapshot = {
      itemId: enriched.itemId,
      outputIndex: enriched.outputIndex,
      callId: enriched.callId,
      providerToolName: enriched.providerToolName,
      argumentsText: nextArgumentsText,
    };
    for (const key of previewStateKeys(enriched)) {
      state.set(key, snapshot);
    }
  }
  return enriched;
}

export function extractAndPublishSseDeltas(
  buffer: string,
  onTextDelta?: (delta: string) => void,
  onProviderStreamEvent?: (event: RaxodeProviderStreamEvent) => void,
  toolCallPreviewState: RaxodeToolCallPreviewState = new Map(),
): string {
  if (!onTextDelta && !onProviderStreamEvent) return buffer;
  const normalized = buffer.replace(/\r\n/gu, "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";
  for (const frame of frames) {
    const payload = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    const delta = readSseTextDelta(payload);
    if (delta) {
      onTextDelta?.(delta);
    }
    for (const toolCallPreviewEvent of readSseToolCallPreviewEvents(payload)) {
      const enrichedEvent = rememberToolCallPreviewEvent(toolCallPreviewState, toolCallPreviewEvent);
      const isAnonymousAnthropicBlockStop = enrichedEvent.rawType === "content_block_stop"
        && enrichedEvent.callId === undefined
        && enrichedEvent.itemId === undefined
        && enrichedEvent.providerToolName === undefined;
      if (!isAnonymousAnthropicBlockStop) {
        onProviderStreamEvent?.(enrichedEvent);
      }
    }
  }
  return remainder;
}

function createStreamingProviderTransport(
  onTextDelta?: (delta: string) => void,
  onProviderStreamEvent?: (event: RaxodeProviderStreamEvent) => void,
): ProviderTransport {
  if (!onTextDelta && !onProviderStreamEvent) return fetchProviderTransport;
  return async (request: ProviderTransportRequest): Promise<ProviderTransportResponse> => {
    const controller = new AbortController();
    const timeout =
      request.timeoutMs === undefined
        ? undefined
        : setTimeout(() => controller.abort(), request.timeoutMs);
    const signal = request.signal ?? controller.signal;

    try {
      const response = await fetch(appendQuery(request.url, request.query), {
        method: request.method,
        headers: request.headers,
        body:
          request.body === undefined
            ? undefined
            : typeof request.body === "string" || request.body instanceof FormData
              ? request.body
              : JSON.stringify(request.body),
        signal,
      });
      const headers = Object.fromEntries(response.headers.entries());
      const contentType = response.headers.get("content-type") ?? "";
      const reader = response.body?.getReader();
      if (!reader) {
        return await fetchProviderTransport(request);
      }

      const decoder = new TextDecoder();
      let raw = "";
      let pendingSse = "";
      let shouldParseSse = contentType.includes("text/event-stream");
      const toolCallPreviewState: RaxodeToolCallPreviewState = new Map();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true });
        raw += text;
        shouldParseSse ||= looksLikeSseChunk(text);
        if (shouldParseSse) {
          pendingSse = extractAndPublishSseDeltas(
            `${pendingSse}${text}`,
            onTextDelta,
            onProviderStreamEvent,
            toolCallPreviewState,
          );
        }
      }
      const tail = decoder.decode();
      if (tail) {
        raw += tail;
        shouldParseSse ||= looksLikeSseChunk(tail);
        if (shouldParseSse) {
          pendingSse = extractAndPublishSseDeltas(
            `${pendingSse}${tail}`,
            onTextDelta,
            onProviderStreamEvent,
            toolCallPreviewState,
          );
        }
      }
      if (shouldParseSse && pendingSse.trim().length > 0) {
        extractAndPublishSseDeltas(
          `${pendingSse}\n\n`,
          onTextDelta,
          onProviderStreamEvent,
          toolCallPreviewState,
        );
      }

      let body: unknown = raw;
      if (contentType.includes("application/json")) {
        try {
          body = raw.length > 0 ? JSON.parse(raw) : {};
        } catch {
          body = { rawText: raw };
        }
      }
      return {
        status: response.status,
        headers,
        body,
      };
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  };
}

export function createRaxodeLiveProvider(manifest: AgentManifest, options: {
  codexAuthPath?: string;
  startDir?: string;
  roleId?: RaxodeRoleId;
  forceCodexEnvCompatibility?: boolean;
  transport?: ProviderTransport;
  timeoutMs?: number;
  sessionId?: string;
  runtimeId?: string;
  turnId?: string;
  onTextDelta?: (delta: string) => void;
  onProviderStreamEvent?: (event: RaxodeProviderStreamEvent) => void;
} = {}): RaxodeLiveProvider {
  const codexAuthPath = options.codexAuthPath ?? path.join(process.env.HOME ?? "", ".codex", "auth.json");
  const roleId = options.roleId ?? roleIdForManifest(manifest);
  const configured = resolveRaxodeConfiguredModelOptions({
    roleId,
    startDir: options.startDir,
    forceCodexEnvCompatibility: options.forceCodexEnvCompatibility,
  });
  const providerRoute = providerRouteFromManifest(manifest) ?? configured.providerRoute;
  const resolvedConfig = resolvedConfigForRoute({
    roleId,
    startDir: options.startDir,
    authSource: configured.authSource,
  });
  const baseURL = cleanText(manifest.model.baseURL)
    ?? configured.baseURL
    ?? defaultBaseURLForRoute(providerRoute);
  const finalRequestURL = cleanText(configured.finalRequestURL);
  const routeAuth = resolveRouteAuth({
    manifest,
    route: providerRoute,
    codexAuthPath,
    resolvedConfig,
  });
  const credentialRef = routeAuth.auth.credentialRef;
  if (credentialRef === undefined) {
    throw new Error("auth failed: route auth did not include credentialRef");
  }

  const carrier = (() => {
    switch (providerRoute) {
      case "chatgpt_codex_responses":
        return createChatGPTCodexResponsesCarrier({
          carrierId: manifest.model.carrierId,
          model: manifest.model.model,
          reasoning: { effort: manifest.model.reasoning?.effort },
          baseURL,
          credentialRef,
          clientName: manifest.model.clientName ?? "praxis-raxode",
          clientVersion: manifest.model.clientVersion ?? "0.1.0",
        });
      case "openai_responses":
        return createOpenAIV1ResponsesCarrier({
          carrierId: manifest.model.carrierId,
          model: manifest.model.model,
          reasoning: { effort: manifest.model.reasoning?.effort },
          baseURL,
          credentialRef,
        });
      case "openai_chat_completions":
        return createOpenAIV1ChatCompletionsCarrier({
          carrierId: manifest.model.carrierId,
          model: manifest.model.model,
          reasoning: { effort: manifest.model.reasoning?.effort },
          baseURL,
          credentialRef,
        });
      case "anthropic_messages":
        return createAnthropicV1MessagesCarrier({
          carrierId: manifest.model.carrierId,
          model: manifest.model.model,
          reasoning: { effort: manifest.model.reasoning?.effort },
          baseURL,
          credentialRef,
        });
    }
  })();
  if (!carrier.ok) {
    throw new Error(`carrier failed: ${JSON.stringify(carrier.error)}`);
  }

  const installationId = providerRoute === "chatgpt_codex_responses"
    ? readCodexInstallationId(codexAuthPath)
    : undefined;
  const baseTransport = options.transport
    ?? createStreamingProviderTransport(options.onTextDelta, options.onProviderStreamEvent);
  const transport = providerRoute === "chatgpt_codex_responses"
    ? createCodexRoutingTransport(baseTransport, {
        sessionId: options.sessionId,
        runtimeId: options.runtimeId,
        turnId: options.turnId,
        installationId,
        windowId: options.runtimeId,
      })
    : baseTransport;
  const rawCaller = createProviderCaller({
    transport,
    authMaterial: routeAuth.material,
    timeoutMs: options.timeoutMs ?? 600_000,
  });

  if (providerRoute === "openai_chat_completions") {
    const openaiChatCompletionsCaller = createChatCompletionsCaller(rawCaller, finalRequestURL);
    return {
      auth: routeAuth.auth,
      openaiChatCompletionsCaller,
      authSource: routeAuth.source,
      provider: "openai",
      endpointShape: "chat_completions",
      providerRoute,
    };
  }

  if (providerRoute === "anthropic_messages") {
    const anthropicMessagesCaller = createMessagesCaller(rawCaller, carrier.carrier.baseURL ?? baseURL, finalRequestURL);
    return {
      auth: routeAuth.auth,
      anthropicMessagesCaller,
      authSource: routeAuth.source,
      provider: "anthropic",
      endpointShape: "messages",
      providerRoute,
    };
  }

  const openaiResponsesCaller = createResponsesCaller(
    rawCaller,
    providerRoute === "chatgpt_codex_responses" ? undefined : finalRequestURL,
  );
  return {
    auth: routeAuth.auth,
    providerCaller: openaiResponsesCaller,
    openaiResponsesCaller,
    authSource: routeAuth.source,
    provider: "openai",
    endpointShape: "responses",
    providerRoute,
  };
}
