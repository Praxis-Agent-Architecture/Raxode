import type { OpenAILiveConfig } from "../../rax/live-config.js";
import type { ProviderId } from "../../rax/index.js";
import type { RaxcodeReasoningEffort } from "../../raxcode-config.js";
import { isDeepSeekV4Model } from "@praxis-ai/praxis/provider/providerAccessLayer/modelMetadataRegistry";

type ProviderGenerationVariant =
  | "responses"
  | "chat_completions_compat"
  | "messages"
  | "generateContent";

function isChatgptCodexBackendBaseURL(baseURL: string): boolean {
  return /chatgpt\.com\/backend-api\/codex\/?$/iu.test(baseURL.trim());
}

function resolveOpenAIGenerationVariant(
  config: Pick<OpenAILiveConfig, "baseURL"> & { apiStyle?: string },
): ProviderGenerationVariant {
  const apiStyle = config.apiStyle?.trim().toLowerCase();
  if (apiStyle === "responses") {
    return "responses";
  }
  if (
    apiStyle === "chat_completions"
    || apiStyle === "chat/completions"
    || apiStyle === "chat_completions_compat"
    || apiStyle === "chat-completions"
  ) {
    return "chat_completions_compat";
  }
  return isChatgptCodexBackendBaseURL(config.baseURL)
    ? "responses"
    : "chat_completions_compat";
}

function resolveProviderGenerationVariant(input: {
  provider: ProviderId;
  baseURL: string;
  apiStyle?: string;
}): ProviderGenerationVariant {
  if (input.provider === "openai") {
    return resolveOpenAIGenerationVariant({
      baseURL: input.baseURL,
      apiStyle: input.apiStyle,
    });
  }
  if (input.provider === "anthropic") {
    return "messages";
  }
  return "generateContent";
}

export type ProviderRouteKind =
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages"
  | "deepmind_generateContent";

export interface ParsedProviderModelSelectionValue {
  model: string;
  reasoning?: RaxcodeReasoningEffort;
  serviceTierFastEnabled: boolean;
}

export function resolveProviderRouteKind(input: {
  provider: ProviderId;
  baseURL: string;
  apiStyle?: string;
  variant?: string;
}): ProviderRouteKind {
  const variant = (input.variant as ProviderGenerationVariant | undefined)
    ?? resolveProviderGenerationVariant({
      provider: input.provider,
      baseURL: input.baseURL,
      apiStyle: input.apiStyle,
    });
  if (input.provider === "anthropic" || variant === "messages") {
    return "anthropic_messages";
  }
  if (input.provider === "deepmind" || variant === "generateContent") {
    return "deepmind_generateContent";
  }
  if (variant === "chat_completions_compat") {
    return "openai_chat_completions";
  }
  return "openai_responses";
}

export function providerRouteSupportsFast(kind: ProviderRouteKind): boolean {
  return kind === "openai_responses";
}

export function providerRouteSupportsReasoning(kind: ProviderRouteKind): boolean {
  return kind === "openai_responses" || kind === "anthropic_messages";
}

export function providerRouteSupportsReasoningForModel(input: {
  routeKind: ProviderRouteKind;
  model?: string;
}): boolean {
  if (providerRouteSupportsReasoning(input.routeKind)) {
    return true;
  }
  return input.routeKind === "openai_chat_completions" && isDeepSeekV4Model(input.model);
}

export function providerRouteReasoningLabel(kind: ProviderRouteKind): "Reasoning" | "Thinking" | null {
  if (kind === "openai_responses") {
    return "Reasoning";
  }
  if (kind === "anthropic_messages") {
    return "Thinking";
  }
  return null;
}

export function providerRouteReasoningLabelForModel(input: {
  routeKind: ProviderRouteKind;
  model?: string;
}): "Reasoning" | "Thinking" | null {
  if (input.routeKind === "openai_chat_completions" && isDeepSeekV4Model(input.model)) {
    return "Thinking";
  }
  return providerRouteReasoningLabel(input.routeKind);
}

export function providerRouteDisplayName(kind: ProviderRouteKind): string {
  switch (kind) {
    case "openai_responses":
      return "OpenAI Compatible (Responses API)";
    case "openai_chat_completions":
      return "OpenAI Compatible (Chat Completions API)";
    case "anthropic_messages":
      return "Anthropic Compatible (Messages API)";
    case "deepmind_generateContent":
      return "DeepMind Compatible (GenerateContent API)";
  }
}

export function formatProviderModelSelectionValue(input: {
  routeKind: ProviderRouteKind;
  model: string;
  reasoning?: RaxcodeReasoningEffort;
  serviceTierFastEnabled?: boolean;
}): string {
  const reasoning = input.reasoning ?? "none";
  switch (input.routeKind) {
    case "openai_responses":
      return `${input.model} with ${reasoning} effort${input.serviceTierFastEnabled ? " [FAST]" : ""}`;
    case "anthropic_messages":
      return `${input.model} with ${reasoning} thinking`;
    case "openai_chat_completions":
      return isDeepSeekV4Model(input.model)
        ? `${input.model} with ${reasoning} thinking`
        : input.model;
    case "deepmind_generateContent":
      return input.model;
  }
}

export function parseProviderModelSelectionValue(
  routeKind: ProviderRouteKind,
  value: string,
): ParsedProviderModelSelectionValue | null {
  if (routeKind === "openai_responses") {
    const match = value.match(/^(.*) with (minimal|none|low|medium|high|xhigh) effort(?: \[FAST\])?$/u);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    return {
      model: match[1].trim(),
      reasoning: match[2].trim() as RaxcodeReasoningEffort,
      serviceTierFastEnabled: /\s\[FAST\]$/u.test(value),
    };
  }
  if (routeKind === "anthropic_messages") {
    const match = value.match(/^(.*) with (none|low|medium|high|xhigh) thinking$/u);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    return {
      model: match[1].trim(),
      reasoning: match[2].trim() as RaxcodeReasoningEffort,
      serviceTierFastEnabled: false,
    };
  }
  if (routeKind === "openai_chat_completions") {
    const match = value.match(/^(.*) with (none|low|medium|high|xhigh) thinking$/u);
    if (match?.[1] && match[2] && isDeepSeekV4Model(match[1].trim())) {
      return {
        model: match[1].trim(),
        reasoning: match[2].trim() as RaxcodeReasoningEffort,
        serviceTierFastEnabled: false,
      };
    }
  }
  const model = value.trim();
  if (!model) {
    return null;
  }
  return {
    model,
    serviceTierFastEnabled: false,
  };
}

export function sanitizeProviderRouteFeatureOptions(
  routeKind: ProviderRouteKind,
  input: {
    model?: string;
    reasoningEffort?: string;
    serviceTier?: "fast";
  },
): {
  reasoningEffort?: string;
  serviceTier?: "fast";
} {
  return {
    reasoningEffort: providerRouteSupportsReasoningForModel({
      routeKind,
      model: input.model,
    })
      ? input.reasoningEffort
      : undefined,
    serviceTier: providerRouteSupportsFast(routeKind)
      ? input.serviceTier
      : undefined,
  };
}
