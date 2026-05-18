export type RaxodePolicyProfile = "restricted" | "standard" | "permissive" | "yolo" | "bapr";

export type RaxodeSandboxProfile = "hostObserved" | "workspaceOnly" | "linuxBubblewrap";
export type RaxodeProvider = "openai" | "anthropic";
export type RaxodeEndpointShape = "responses" | "chat_completions" | "messages";
export type RaxodeProviderRoute =
  | "chatgpt_codex_responses"
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages";

export type RaxodeOptions = {
  policyProfile?: RaxodePolicyProfile;
  sandboxProfile?: RaxodeSandboxProfile;
  persistence?: "memory" | "sqlite";
  includeAllCatalogTools?: boolean;
  provider?: RaxodeProvider;
  endpointShape?: RaxodeEndpointShape;
  baseURL?: string;
  providerRoute?: RaxodeProviderRoute;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "none" | "minimal";
  maxOutputTokens?: number;
};

export type NormalizedRaxodeOptions = Required<Omit<RaxodeOptions, "baseURL" | "providerRoute" | "maxOutputTokens">> & {
  baseURL?: string;
  providerRoute?: RaxodeProviderRoute;
  maxOutputTokens?: number;
};

export function normalizeRaxodeOptions(options: RaxodeOptions = {}): NormalizedRaxodeOptions {
  return {
    policyProfile: options.policyProfile ?? "standard",
    sandboxProfile: options.sandboxProfile ?? "hostObserved",
    persistence: options.persistence ?? "sqlite",
    includeAllCatalogTools: options.includeAllCatalogTools ?? true,
    provider: options.provider ?? (options.endpointShape === "messages" ? "anthropic" : "openai"),
    endpointShape: options.endpointShape ?? "responses",
    baseURL: options.baseURL,
    providerRoute: options.providerRoute,
    model: options.model ?? "gpt-5.5",
    reasoningEffort: options.reasoningEffort ?? "low",
    maxOutputTokens: options.maxOutputTokens,
  };
}
