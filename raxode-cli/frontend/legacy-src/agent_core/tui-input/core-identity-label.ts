import type { ProviderRouteKind } from "../integrations/model-route-features.js";
import type { PraxisSlashPanelFieldTone } from "./slash-panels.js";

export interface CoreIdentityValueSegment {
  text: string;
  tone?: PraxisSlashPanelFieldTone;
}

export interface CoreIdentityLabelPresentation {
  kind: "subscription" | "route";
  text: string;
  valueSegments: CoreIdentityValueSegment[];
}

export interface OpenAIStatusAuthSnapshot {
  authMode: "api_key" | "chatgpt_oauth" | "none";
  activeAuthProfileId?: string;
  activeProviderProfileId?: string;
  email?: string;
  planType?: string;
  accountId?: string;
  accessTokenExpiresAt?: string;
  refreshTokenPresent: boolean;
}

export interface OpenAIStatusIdentityRow {
  label: string;
  text: string;
  segments?: CoreIdentityValueSegment[];
}

function humanizeUnknownPlanLabel(planType: string): string {
  return planType
    .trim()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatApiRouteIdentityText(routeKind: ProviderRouteKind): string {
  switch (routeKind) {
    case "openai_responses":
      return "GPT Endpoint (Responses API)";
    case "openai_chat_completions":
      return "GPT Compatible (Completions API)";
    case "anthropic_messages":
      return "Anthropic Endpoint (Messages API)";
    case "deepmind_generateContent":
      return "DeepMind Endpoint (GenerateContent API)";
  }
}

export function formatChatGPTPlanLabel(planType?: string): string {
  const normalized = planType?.trim().toLowerCase();
  switch (normalized) {
    case "pro20x":
    case "pro-20x":
    case "pro_20x":
      return "Pro20x";
    case "pro5x":
    case "pro-5x":
    case "pro_5x":
      return "Pro5x";
    case "pro":
      return "Pro";
    case "plus":
      return "Plus";
    case "go":
      return "Go";
    case "free":
      return "Free";
    default:
      return planType && planType.trim().length > 0
        ? humanizeUnknownPlanLabel(planType)
        : "Unknown";
  }
}

export function resolveChatGPTPlanTone(planType?: string): PraxisSlashPanelFieldTone | undefined {
  const normalized = planType?.trim().toLowerCase();
  switch (normalized) {
    case "pro20x":
    case "pro-20x":
    case "pro_20x":
    case "pro":
      return "success";
    case "pro5x":
    case "pro-5x":
    case "pro_5x":
      return "fast";
    case "plus":
      return "info";
    case "go":
      return "warning";
    case "free":
      return "default";
    default:
      return undefined;
  }
}

export function buildCoreIdentityLabelPresentation(input: {
  authMode?: string;
  planType?: string;
  routeKind: ProviderRouteKind;
}): CoreIdentityLabelPresentation {
  if (input.authMode === "chatgpt_oauth") {
    const planLabel = formatChatGPTPlanLabel(input.planType);
    return {
      kind: "subscription",
      text: `ChatGPT Account with ${planLabel} Subscription`,
      valueSegments: [
        { text: "ChatGPT Account with " },
        { text: planLabel, tone: resolveChatGPTPlanTone(input.planType) },
        { text: " Subscription" },
      ],
    };
  }
  const routeText = formatApiRouteIdentityText(input.routeKind);
  return {
    kind: "route",
    text: routeText,
    valueSegments: [{ text: routeText }],
  };
}

export function buildOpenAIStatusIdentityRows(input: {
  authStatus: OpenAIStatusAuthSnapshot;
  routeKind: ProviderRouteKind;
  baseURL?: string | null;
}): OpenAIStatusIdentityRow[] {
  const rows: OpenAIStatusIdentityRow[] = [];
  const identity = buildCoreIdentityLabelPresentation({
    authMode: input.authStatus.authMode,
    planType: input.authStatus.planType,
    routeKind: input.routeKind,
  });
  if (input.authStatus.authMode === "chatgpt_oauth") {
    const planLabel = formatChatGPTPlanLabel(input.authStatus.planType);
    rows.push(
      { label: "Provider auth path:", text: "ChatGPT subscription" },
      {
        label: "Provider identity:",
        text: identity.text,
        segments: identity.valueSegments,
      },
      {
        label: "ChatGPT plan:",
        text: planLabel,
        segments: [{ text: planLabel, tone: resolveChatGPTPlanTone(input.authStatus.planType) }],
      },
    );
    if (input.authStatus.accountId) {
      rows.push({ label: "ChatGPT account:", text: input.authStatus.accountId });
    }
    if (input.authStatus.email) {
      rows.push({ label: "ChatGPT email:", text: input.authStatus.email });
    }
  } else if (input.authStatus.authMode === "api_key") {
    rows.push(
      { label: "Provider auth path:", text: "API key" },
      {
        label: "Provider identity:",
        text: identity.text,
        segments: identity.valueSegments,
      },
    );
  } else {
    rows.push(
      { label: "Provider auth path:", text: "Unconfigured" },
      { label: "Provider identity:", text: "No provider credentials configured" },
    );
  }

  if (input.authStatus.activeAuthProfileId) {
    rows.push({ label: "Provider auth profile:", text: input.authStatus.activeAuthProfileId });
  }
  if (input.authStatus.activeProviderProfileId) {
    rows.push({ label: "Provider profile:", text: input.authStatus.activeProviderProfileId });
  }
  rows.push({ label: "Provider route:", text: formatApiRouteIdentityText(input.routeKind) });
  if (input.baseURL) {
    rows.push({ label: "Provider base URL:", text: input.baseURL });
  }
  if (input.authStatus.authMode === "chatgpt_oauth") {
    rows.push({
      label: "OAuth refresh token:",
      text: input.authStatus.refreshTokenPresent ? "present" : "missing",
    });
    if (input.authStatus.accessTokenExpiresAt) {
      rows.push({ label: "Access token expires:", text: input.authStatus.accessTokenExpiresAt });
    }
  }
  return rows;
}
