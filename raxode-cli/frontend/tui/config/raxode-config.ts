import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  resolveAuthJsonPath,
  resolveCacheDir,
  resolveConfigJsonPath,
  resolveConfigRoot,
  resolveLogsDir,
  resolveRaxodeHome,
  resolveSessionsDir,
  resolveStateRoot,
  resolveWorkspaceRoot,
} from "../runtime/runtime-paths.js";
import type { RaxodeUrlMode } from "@praxis-ai/praxis/provider/authProfileLayer/providerConfiguration";

export const RAXODE_SCHEMA_VERSION = 3;

export type RaxodeProviderKind = "openai" | "anthropic" | "deepmind";
export type RaxodeProviderSlot = "openai" | "anthropic" | "anthropicAlt" | "deepmind";
export type RaxodeReasoningEffort = "low" | "medium" | "high" | "xhigh" | "none" | "minimal";
export type RaxodeBootstrapSource = "manual" | "import" | "oauth";
export type RaxodeAuthMode = "api_key" | "chatgpt_oauth";
export type RaxodeAnimationMode = "fresh" | "resume" | "off";
export type RaxodePermissionMode = "bapr" | "yolo" | "permissive" | "standard" | "restricted" | "strict" | "balanced";
export type RaxodeAutomationDepth = "default" | "prefer_auto" | "prefer_human";
export type RaxodeExplanationStyle = "default" | "plain_language";

export interface RaxodeCapabilityPolicyOverride {
  capabilitySelector: string;
  policy: "allow" | "review_only" | "deny" | "human_gate";
  reason?: string;
}

export interface RaxodePermissionMatrixCell {
  [key: string]: unknown;
}

export type RaxodeRoleId =
  | "core.main"
  | "tui.main";

export const RAXODE_ROLE_IDS: RaxodeRoleId[] = [
  "core.main",
  "tui.main",
];

export interface RaxodeRoutePlan {
  model: string;
  reasoning: RaxodeReasoningEffort;
  serviceTier?: "fast";
  maxOutputTokens?: number;
  contextWindowTokens?: number;
}

export interface RaxodeLiveChatModelPlan {
  core: {
    main: RaxodeRoutePlan;
  };
  tui: {
    main: RaxodeRoutePlan;
  };
}

export interface RaxodeAuthProfile {
  id: string;
  provider: RaxodeProviderKind;
  label: string;
  authMode: RaxodeAuthMode;
  credentials: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    accountId?: string;
  };
  meta: {
    source: RaxodeBootstrapSource;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    orgId?: string;
    projectId?: string;
    accountId?: string;
    email?: string;
    chatgptPlanType?: string;
    chatgptUserId?: string;
    chatgptAccountId?: string;
    lastRefreshAt?: string;
    accessTokenExpiresAt?: string;
    idTokenExpiresAt?: string;
  };
}

export interface RaxodeAuthFile {
  schemaVersion: number;
  activeAuthProfileIdBySlot: Partial<Record<RaxodeProviderSlot, string>>;
  authProfiles: RaxodeAuthProfile[];
}

export interface RaxodeProviderProfile {
  id: string;
  provider: RaxodeProviderKind;
  label: string;
  authProfileId: string;
  route: {
    baseURL: string;
    apiStyle?: string;
    urlMode?: RaxodeUrlMode;
    finalRequestURL?: string;
  };
  model: string;
  reasoningEffort?: RaxodeReasoningEffort;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  enabled: boolean;
}

export interface RaxodeRoleBinding {
  profileId: string;
  enabled: boolean;
  overrides?: Partial<RaxodeRoutePlan>;
}

export interface RaxodeUiConfig {
  language: string;
  animationMode: RaxodeAnimationMode;
  startupView: string;
  defaultAgentsView: string;
  slashMenuStyle: string;
  toolSummaryStyle: string;
}

export interface RaxodePermissionsConfig {
  requestedMode: RaxodePermissionMode;
  automationDepth: RaxodeAutomationDepth;
  explanationStyle: RaxodeExplanationStyle;
  requireHumanOnRiskLevels: string[];
  capabilityOverrides: RaxodeCapabilityPolicyOverride[];
  shared15ViewMatrix: RaxodePermissionMatrixCell[];
  persistedAllowRules: RaxodePersistedPermissionRule[];
}

export interface RaxodePersistedPermissionRule {
  ruleId: string;
  agentId: string;
  capabilityFamily: "read";
  pathPrefix: string;
  createdAt: string;
  updatedAt: string;
}

export interface RaxodeWorkspaceConfig {
  defaultPath: string;
}

export interface RaxodeEmbeddingConfig {
  lanceDbModel: "text-embedding-3-large" | "text-embedding-3-small";
  provider?: "openai";
  baseURL?: string;
  authProfileId?: string;
  dimensions?: number;
}

export interface RaxodeConfigFile {
  schemaVersion: number;
  providerSlots: Partial<Record<RaxodeProviderSlot, string>>;
  profiles: RaxodeProviderProfile[];
  roleBindings: Record<RaxodeRoleId, RaxodeRoleBinding>;
  embedding: RaxodeEmbeddingConfig;
  workspace: RaxodeWorkspaceConfig;
  ui: RaxodeUiConfig;
  permissions: RaxodePermissionsConfig;
}

export interface RaxodeRuntimeConfigSnapshot {
  modelPlan: RaxodeLiveChatModelPlan;
  ui: RaxodeUiConfig;
  permissions: RaxodePermissionsConfig;
  embedding: RaxodeEmbeddingConfig;
  workspace: RaxodeWorkspaceConfig;
}

export interface RaxodeResolvedProfile {
  slot: RaxodeProviderSlot;
  profile: RaxodeProviderProfile;
  authProfile: RaxodeAuthProfile;
}

export interface RaxodeResolvedRoleConfig {
  roleId: RaxodeRoleId;
  binding: RaxodeRoleBinding;
  profile: RaxodeProviderProfile;
  authProfile: RaxodeAuthProfile;
}

export interface RaxodeResolvedEmbeddingConfig {
  provider: "openai";
  model: RaxodeEmbeddingConfig["lanceDbModel"];
  baseURL: string;
  apiKey: string;
  dimensions?: number;
  authProfileId: string;
}

export class RaxodeConfigError extends Error {
  readonly filePath?: string;
  readonly fieldPath?: string;

  constructor(message: string, options: { filePath?: string; fieldPath?: string } = {}) {
    super(message);
    this.name = "RaxodeConfigError";
    this.filePath = options.filePath;
    this.fieldPath = options.fieldPath;
  }
}

export function isRaxodeRoleId(value: string): value is RaxodeRoleId {
  return (RAXODE_ROLE_IDS as readonly string[]).includes(value);
}

const DEFAULT_UI_CONFIG: RaxodeUiConfig = {
  language: "zh-CN",
  animationMode: "off",
  startupView: "chat",
  defaultAgentsView: "list",
  slashMenuStyle: "ordered",
  toolSummaryStyle: "animated",
};

export const DEFAULT_RAXODE_UI_CONFIG: RaxodeUiConfig = {
  ...DEFAULT_UI_CONFIG,
};

export const DEFAULT_RAXODE_LIVE_CHAT_MODEL_PLAN: RaxodeLiveChatModelPlan = {
  core: {
    main: {
      model: "gpt-5.5",
      reasoning: "low",
      contextWindowTokens: 400_000,
    },
  },
  tui: {
    main: {
      model: "gpt-5.4-mini",
      reasoning: "low",
      contextWindowTokens: 1_050_000,
    },
  },
};

function timestamp(): string {
  return new Date().toISOString();
}

export function createDefaultRaxodePermissionsConfig(): RaxodePermissionsConfig {
  return {
    requestedMode: "bapr",
    automationDepth: "prefer_auto",
    explanationStyle: "plain_language",
    requireHumanOnRiskLevels: [],
    capabilityOverrides: [],
    shared15ViewMatrix: [],
    persistedAllowRules: [],
  };
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeJsonIfMissing(filePath: string, payload: unknown): boolean {
  if (existsSync(filePath)) {
    return false;
  }
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best-effort only.
  }
  return true;
}

function parseJsonFile<T extends Record<string, unknown>>(filePath: string): T {
  let raw = "";
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new RaxodeConfigError(
      `无法读取 Raxode 配置文件: ${filePath}`,
      { filePath },
    );
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("root must be an object");
    }
    return parsed as T;
  } catch (error) {
    throw new RaxodeConfigError(
      `Raxode 配置文件不是合法 JSON: ${filePath}${error instanceof Error ? ` (${error.message})` : ""}`,
      { filePath },
    );
  }
}

function makeAuthProfile(
  id: string,
  provider: RaxodeProviderKind,
  label: string,
  stamp: string,
): RaxodeAuthProfile {
  return {
    id,
    provider,
    label,
    authMode: "api_key",
    credentials: {
      apiKey: "",
    },
    meta: {
      source: "manual",
      createdAt: stamp,
      updatedAt: stamp,
    },
  };
}

function routePlanForRole(roleId: RaxodeRoleId): RaxodeRoutePlan {
  switch (roleId) {
    case "core.main":
      return { ...DEFAULT_RAXODE_LIVE_CHAT_MODEL_PLAN.core.main };
    case "tui.main":
      return { ...DEFAULT_RAXODE_LIVE_CHAT_MODEL_PLAN.tui.main };
  }
}

function roleLabel(roleId: RaxodeRoleId): string {
  return roleId
    .split(".")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function makeRoleProfile(roleId: RaxodeRoleId): RaxodeProviderProfile {
  const plan = routePlanForRole(roleId);
  return {
    id: `profile.${roleId}`,
    provider: "openai",
    label: `${roleLabel(roleId)} Default`,
    authProfileId: "auth.openai.default",
    route: {
      baseURL: "https://api.openai.com/v1",
      apiStyle: "responses",
      urlMode: "auto_append_endpoint",
      finalRequestURL: "https://api.openai.com/v1/responses",
    },
    model: plan.model,
    reasoningEffort: plan.reasoning,
    contextWindowTokens: plan.contextWindowTokens,
    maxOutputTokens: plan.maxOutputTokens,
    enabled: true,
  };
}

function createDefaultAuthFile(): RaxodeAuthFile {
  const stamp = timestamp();
  return {
    schemaVersion: RAXODE_SCHEMA_VERSION,
    activeAuthProfileIdBySlot: {
      openai: "auth.openai.default",
      anthropic: "auth.anthropic.default",
      anthropicAlt: "auth.anthropic.alt",
      deepmind: "auth.deepmind.default",
    },
    authProfiles: [
      makeAuthProfile("auth.openai.default", "openai", "OpenAI Default", stamp),
      makeAuthProfile("auth.anthropic.default", "anthropic", "Anthropic Default", stamp),
      makeAuthProfile("auth.anthropic.alt", "anthropic", "Anthropic Alt", stamp),
      makeAuthProfile("auth.deepmind.default", "deepmind", "DeepMind Default", stamp),
    ],
  };
}

function createDefaultConfigFile(fallbackDir = process.cwd()): RaxodeConfigFile {
  const roleProfiles = RAXODE_ROLE_IDS.map((roleId) => makeRoleProfile(roleId));
  return {
    schemaVersion: RAXODE_SCHEMA_VERSION,
    providerSlots: {
      openai: "profile.core.main",
      anthropic: "profile.provider.anthropic.default",
      anthropicAlt: "profile.provider.anthropic.alt",
      deepmind: "profile.provider.deepmind.default",
    },
    profiles: [
      ...roleProfiles,
      {
        id: "profile.provider.anthropic.default",
        provider: "anthropic",
        label: "Anthropic Default",
        authProfileId: "auth.anthropic.default",
        route: {
          baseURL: "https://api.anthropic.com",
          apiStyle: "messages",
          urlMode: "auto_append_endpoint",
          finalRequestURL: "https://api.anthropic.com/v1/messages",
        },
        model: "claude-opus-4-6-thinking",
        contextWindowTokens: 200_000,
        enabled: true,
      },
      {
        id: "profile.provider.anthropic.alt",
        provider: "anthropic",
        label: "Anthropic Alt",
        authProfileId: "auth.anthropic.alt",
        route: {
          baseURL: "https://api.anthropic.com",
          apiStyle: "messages",
          urlMode: "auto_append_endpoint",
          finalRequestURL: "https://api.anthropic.com/v1/messages",
        },
        model: "claude-opus-4-6-thinking",
        contextWindowTokens: 200_000,
        enabled: true,
      },
      {
        id: "profile.provider.deepmind.default",
        provider: "deepmind",
        label: "DeepMind Default",
        authProfileId: "auth.deepmind.default",
        route: {
          baseURL: "https://generativelanguage.googleapis.com/v1beta/models",
          apiStyle: "generateContent",
        },
        model: "gemini-3.1-pro-preview",
        contextWindowTokens: 1_000_000,
        enabled: true,
      },
    ],
    roleBindings: Object.fromEntries(
      RAXODE_ROLE_IDS.map((roleId) => [roleId, {
        profileId: `profile.${roleId}`,
        enabled: true,
      } satisfies RaxodeRoleBinding]),
    ) as Record<RaxodeRoleId, RaxodeRoleBinding>,
    embedding: {
      lanceDbModel: "text-embedding-3-large",
      provider: "openai",
    },
    workspace: {
      defaultPath: resolveWorkspaceRoot(fallbackDir),
    },
    ui: {
      ...DEFAULT_UI_CONFIG,
    },
    permissions: {
      ...createDefaultRaxodePermissionsConfig(),
    },
  };
}

export function ensureRaxodeHomeScaffold(fallbackDir = process.cwd()): {
  home: string;
  authPath: string;
  configPath: string;
  createdPaths: string[];
} {
  const home = resolveRaxodeHome(fallbackDir);
  const configRoot = resolveConfigRoot(fallbackDir);
  const stateRoot = resolveStateRoot(fallbackDir);
  const authPath = resolveAuthJsonPath(fallbackDir);
  const configPath = resolveConfigJsonPath(fallbackDir);

  const createdPaths: string[] = [];
  for (const dir of [
    home,
    configRoot,
    stateRoot,
    resolveLogsDir(fallbackDir),
    resolveSessionsDir(fallbackDir),
    resolveCacheDir(fallbackDir),
  ]) {
    const already = existsSync(dir);
    ensureDirectory(dir);
    if (!already) {
      createdPaths.push(dir);
    }
  }
  if (writeJsonIfMissing(authPath, createDefaultAuthFile())) {
    createdPaths.push(authPath);
  }
  if (writeJsonIfMissing(configPath, createDefaultConfigFile(fallbackDir))) {
    createdPaths.push(configPath);
  }
  return {
    home,
    authPath,
    configPath,
    createdPaths,
  };
}

function asRecord(value: unknown, filePath: string, fieldPath: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RaxodeConfigError(
      `Raxode 配置字段无效: ${fieldPath}`,
      { filePath, fieldPath },
    );
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, filePath: string, fieldPath: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RaxodeConfigError(
      `Raxode 配置缺少必填字段: ${fieldPath}`,
      { filePath, fieldPath },
    );
  }
  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asBoolean(value: unknown, defaultValue = true): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function asPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function loadAuthProfiles(filePath: string): RaxodeAuthFile {
  const parsed = parseJsonFile<Record<string, unknown>>(filePath);
  const authProfilesRaw = parsed.authProfiles;
  if (!Array.isArray(authProfilesRaw)) {
    throw new RaxodeConfigError("Raxode auth.json 缺少 authProfiles 数组。", {
      filePath,
      fieldPath: "authProfiles",
    });
  }

  const authProfiles = authProfilesRaw.map((entry, index) => {
    const record = asRecord(entry, filePath, `authProfiles[${index}]`);
    const credentials = asRecord(record.credentials, filePath, `authProfiles[${index}].credentials`);
    const metaRecord = asRecord(record.meta ?? {}, filePath, `authProfiles[${index}].meta`);
    const authMode =
      asOptionalString(record.authMode) === "chatgpt_oauth"
      || (
        typeof credentials.accessToken === "string"
        && credentials.accessToken.trim().length > 0
      )
        ? "chatgpt_oauth"
        : "api_key";
    return {
      id: asString(record.id, filePath, `authProfiles[${index}].id`),
      provider: asString(record.provider, filePath, `authProfiles[${index}].provider`) as RaxodeProviderKind,
      label: asString(record.label, filePath, `authProfiles[${index}].label`),
      authMode,
      credentials: {
        apiKey: typeof credentials.apiKey === "string" ? credentials.apiKey : undefined,
        accessToken: typeof credentials.accessToken === "string" ? credentials.accessToken : undefined,
        refreshToken: typeof credentials.refreshToken === "string" ? credentials.refreshToken : undefined,
        idToken: typeof credentials.idToken === "string" ? credentials.idToken : undefined,
        accountId: typeof credentials.accountId === "string" ? credentials.accountId : undefined,
      },
      meta: {
        source: (asOptionalString(metaRecord.source) ?? "manual") as RaxodeBootstrapSource,
        createdAt: asOptionalString(metaRecord.createdAt) ?? timestamp(),
        updatedAt: asOptionalString(metaRecord.updatedAt) ?? timestamp(),
        lastUsedAt: asOptionalString(metaRecord.lastUsedAt),
        orgId: asOptionalString(metaRecord.orgId),
        projectId: asOptionalString(metaRecord.projectId),
        accountId: asOptionalString(metaRecord.accountId),
        email: asOptionalString(metaRecord.email),
        chatgptPlanType: asOptionalString(metaRecord.chatgptPlanType),
        chatgptUserId: asOptionalString(metaRecord.chatgptUserId),
        chatgptAccountId: asOptionalString(metaRecord.chatgptAccountId),
        lastRefreshAt: asOptionalString(metaRecord.lastRefreshAt),
        accessTokenExpiresAt: asOptionalString(metaRecord.accessTokenExpiresAt),
        idTokenExpiresAt: asOptionalString(metaRecord.idTokenExpiresAt),
      },
    } satisfies RaxodeAuthProfile;
  });

  const activeAuthProfileIdBySlot = asRecord(
    parsed.activeAuthProfileIdBySlot ?? {},
    filePath,
    "activeAuthProfileIdBySlot",
  );

  return {
    schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : RAXODE_SCHEMA_VERSION,
    activeAuthProfileIdBySlot: Object.fromEntries(
      Object.entries(activeAuthProfileIdBySlot)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0),
    ) as Partial<Record<RaxodeProviderSlot, string>>,
    authProfiles,
  };
}

function loadConfigFile(filePath: string): RaxodeConfigFile {
  const parsed = parseJsonFile<Record<string, unknown>>(filePath);
  const profilesRaw = parsed.profiles;
  if (!Array.isArray(profilesRaw)) {
    throw new RaxodeConfigError("Raxode config.json 缺少 profiles 数组。", {
      filePath,
      fieldPath: "profiles",
    });
  }

  const profiles = profilesRaw.map((entry, index) => {
    const record = asRecord(entry, filePath, `profiles[${index}]`);
    const route = asRecord(record.route, filePath, `profiles[${index}].route`);
    return {
      id: asString(record.id, filePath, `profiles[${index}].id`),
      provider: asString(record.provider, filePath, `profiles[${index}].provider`) as RaxodeProviderKind,
      label: asString(record.label, filePath, `profiles[${index}].label`),
      authProfileId: asString(record.authProfileId, filePath, `profiles[${index}].authProfileId`),
      route: {
        baseURL: asString(route.baseURL, filePath, `profiles[${index}].route.baseURL`),
        apiStyle: asOptionalString(route.apiStyle),
        urlMode: asOptionalString(route.urlMode) as RaxodeUrlMode | undefined,
        finalRequestURL: asOptionalString(route.finalRequestURL),
      },
      model: asString(record.model, filePath, `profiles[${index}].model`),
      reasoningEffort: asOptionalString(record.reasoningEffort) as RaxodeReasoningEffort | undefined,
      contextWindowTokens: asPositiveInteger(record.contextWindowTokens),
      maxOutputTokens: asPositiveInteger(record.maxOutputTokens),
      enabled: asBoolean(record.enabled, true),
    } satisfies RaxodeProviderProfile;
  });

  const roleBindingsRaw = asRecord(parsed.roleBindings, filePath, "roleBindings");
  const roleBindings = Object.fromEntries(
    RAXODE_ROLE_IDS.map((roleId) => {
      const rawBinding = asRecord(roleBindingsRaw[roleId], filePath, `roleBindings.${roleId}`);
      const overrides = rawBinding.overrides
        ? asRecord(rawBinding.overrides, filePath, `roleBindings.${roleId}.overrides`)
        : undefined;
      return [roleId, {
        profileId: asString(rawBinding.profileId, filePath, `roleBindings.${roleId}.profileId`),
        enabled: asBoolean(rawBinding.enabled, true),
        overrides: overrides
          ? {
              model: asOptionalString(overrides.model),
              reasoning: asOptionalString(overrides.reasoning) as RaxodeReasoningEffort | undefined,
              serviceTier: (
                asOptionalString(overrides.serviceTier)
                ?? (asOptionalBoolean(overrides.fastMode) ? "fast" : undefined)
              ) as "fast" | undefined,
              contextWindowTokens: asPositiveInteger(overrides.contextWindowTokens),
              maxOutputTokens: asPositiveInteger(overrides.maxOutputTokens),
            }
          : undefined,
      } satisfies RaxodeRoleBinding];
    }),
  ) as Record<RaxodeRoleId, RaxodeRoleBinding>;

  const workspace = asRecord(parsed.workspace ?? {}, filePath, "workspace");
  const embedding = asRecord(parsed.embedding ?? {}, filePath, "embedding");
  const ui = asRecord(parsed.ui ?? {}, filePath, "ui");
  const permissions = asRecord(parsed.permissions ?? {}, filePath, "permissions");
  const providerSlots = asRecord(parsed.providerSlots ?? {}, filePath, "providerSlots");
  const matrix = Array.isArray(permissions.shared15ViewMatrix)
    ? permissions.shared15ViewMatrix.map((entry, index) => ({
        ...asRecord(entry, filePath, `permissions.shared15ViewMatrix[${index}]`),
      })) as RaxodePermissionMatrixCell[]
    : [];
  const capabilityOverrides = Array.isArray(permissions.capabilityOverrides)
    ? permissions.capabilityOverrides.map((entry, index) => {
        const record = asRecord(entry, filePath, `permissions.capabilityOverrides[${index}]`);
        return {
          capabilitySelector: asString(
            record.capabilitySelector,
            filePath,
            `permissions.capabilityOverrides[${index}].capabilitySelector`,
          ),
          policy: asString(record.policy, filePath, `permissions.capabilityOverrides[${index}].policy`) as RaxodeCapabilityPolicyOverride["policy"],
          reason: asOptionalString(record.reason),
        } satisfies RaxodeCapabilityPolicyOverride;
      })
    : [];
  const persistedAllowRules = Array.isArray(permissions.persistedAllowRules)
    ? permissions.persistedAllowRules.map((entry, index) => {
        const record = asRecord(entry, filePath, `permissions.persistedAllowRules[${index}]`);
        return {
          ruleId: asString(
            record.ruleId,
            filePath,
            `permissions.persistedAllowRules[${index}].ruleId`,
          ),
          agentId: asString(
            record.agentId,
            filePath,
            `permissions.persistedAllowRules[${index}].agentId`,
          ),
          capabilityFamily: "read",
          pathPrefix: asString(
            record.pathPrefix,
            filePath,
            `permissions.persistedAllowRules[${index}].pathPrefix`,
          ),
          createdAt: asString(
            record.createdAt,
            filePath,
            `permissions.persistedAllowRules[${index}].createdAt`,
          ),
          updatedAt: asString(
            record.updatedAt,
            filePath,
            `permissions.persistedAllowRules[${index}].updatedAt`,
          ),
        } satisfies RaxodePersistedPermissionRule;
      })
    : [];

  return {
    schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : RAXODE_SCHEMA_VERSION,
    providerSlots: Object.fromEntries(
      Object.entries(providerSlots)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0),
    ) as Partial<Record<RaxodeProviderSlot, string>>,
    profiles,
    roleBindings,
    embedding: {
      lanceDbModel: (asOptionalString(embedding.lanceDbModel) ?? "text-embedding-3-large") as RaxodeEmbeddingConfig["lanceDbModel"],
      provider: (asOptionalString(embedding.provider) ?? "openai") as RaxodeEmbeddingConfig["provider"],
      baseURL: asOptionalString(embedding.baseURL),
      authProfileId: asOptionalString(embedding.authProfileId),
      dimensions: asPositiveInteger(embedding.dimensions),
    },
    workspace: {
      defaultPath: asOptionalString(workspace.defaultPath) ?? resolveWorkspaceRoot(),
    },
    ui: {
      language: asOptionalString(ui.language) ?? DEFAULT_UI_CONFIG.language,
      animationMode: (asOptionalString(ui.animationMode) ?? DEFAULT_UI_CONFIG.animationMode) as RaxodeAnimationMode,
      startupView: asOptionalString(ui.startupView) ?? DEFAULT_UI_CONFIG.startupView,
      defaultAgentsView: asOptionalString(ui.defaultAgentsView) ?? DEFAULT_UI_CONFIG.defaultAgentsView,
      slashMenuStyle: asOptionalString(ui.slashMenuStyle) ?? DEFAULT_UI_CONFIG.slashMenuStyle,
      toolSummaryStyle: asOptionalString(ui.toolSummaryStyle) ?? DEFAULT_UI_CONFIG.toolSummaryStyle,
    },
    permissions: {
      ...createDefaultRaxodePermissionsConfig(),
      requestedMode: (asOptionalString(permissions.requestedMode) ?? "bapr") as RaxodePermissionMode,
      automationDepth: (asOptionalString(permissions.automationDepth) ?? "prefer_auto") as RaxodeAutomationDepth,
      explanationStyle: (asOptionalString(permissions.explanationStyle) ?? "plain_language") as RaxodeExplanationStyle,
      requireHumanOnRiskLevels: Array.isArray(permissions.requireHumanOnRiskLevels)
        ? permissions.requireHumanOnRiskLevels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      capabilityOverrides,
      shared15ViewMatrix: matrix,
      persistedAllowRules,
    },
  };
}

function migrateRaxodeConfigFile(config: RaxodeConfigFile): {
  changed: boolean;
  config: RaxodeConfigFile;
} {
  if (config.schemaVersion >= RAXODE_SCHEMA_VERSION) {
    return { changed: false, config };
  }
  let changed = false;
  const next: RaxodeConfigFile = {
    ...config,
    profiles: config.profiles.map((profile) => ({ ...profile, route: { ...profile.route } })),
    roleBindings: Object.fromEntries(
      Object.entries(config.roleBindings).map(([roleId, binding]) => [roleId, {
        ...binding,
        overrides: binding.overrides ? { ...binding.overrides } : undefined,
      }]),
    ) as Record<RaxodeRoleId, RaxodeRoleBinding>,
    embedding: { ...config.embedding },
    workspace: { ...config.workspace },
    ui: { ...config.ui },
    permissions: {
      ...config.permissions,
      requireHumanOnRiskLevels: [...config.permissions.requireHumanOnRiskLevels],
      capabilityOverrides: config.permissions.capabilityOverrides.map((entry) => ({ ...entry })),
      shared15ViewMatrix: config.permissions.shared15ViewMatrix.map((entry) => ({ ...entry })),
      persistedAllowRules: config.permissions.persistedAllowRules.map((entry) => ({ ...entry })),
    },
  };

  const coreBinding = next.roleBindings["core.main"];
  const coreProfile = next.profiles.find((profile) => profile.id === coreBinding?.profileId);
  if (coreProfile?.model === "gpt-5.4" && coreProfile.reasoningEffort === "high") {
    coreProfile.model = "gpt-5.5";
    coreProfile.reasoningEffort = "low";
    changed = true;
  }
  if (coreProfile?.model === "gpt-5.5" && coreProfile.contextWindowTokens === 1_050_000) {
    coreProfile.contextWindowTokens = 400_000;
    changed = true;
  }
  if (
    coreBinding?.overrides
    && coreBinding.overrides.model === undefined
    && coreBinding.overrides.reasoning === "high"
    && coreBinding.overrides.serviceTier === undefined
    && coreBinding.overrides.contextWindowTokens === undefined
    && coreBinding.overrides.maxOutputTokens === undefined
  ) {
    coreBinding.overrides = undefined;
    changed = true;
  }

  if (next.schemaVersion !== RAXODE_SCHEMA_VERSION) {
    next.schemaVersion = RAXODE_SCHEMA_VERSION;
    changed = true;
  }
  return { changed, config: next };
}

export function loadRaxodeAuthFile(fallbackDir = process.cwd()): RaxodeAuthFile {
  ensureRaxodeHomeScaffold(fallbackDir);
  return loadAuthProfiles(resolveAuthJsonPath(fallbackDir));
}

export function writeRaxodeAuthFile(
  authFile: RaxodeAuthFile,
  fallbackDir = process.cwd(),
): void {
  ensureRaxodeHomeScaffold(fallbackDir);
  const filePath = resolveAuthJsonPath(fallbackDir);
  writeFileSync(filePath, `${JSON.stringify(authFile, null, 2)}\n`, "utf8");
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best-effort only.
  }
}

export function loadRaxodeConfigFile(fallbackDir = process.cwd()): RaxodeConfigFile {
  ensureRaxodeHomeScaffold(fallbackDir);
  const filePath = resolveConfigJsonPath(fallbackDir);
  const config = loadConfigFile(filePath);
  const migrated = migrateRaxodeConfigFile(config);
  if (migrated.changed) {
    writeFileSync(filePath, `${JSON.stringify(migrated.config, null, 2)}\n`, "utf8");
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // Best-effort only.
    }
  }
  return migrated.config;
}

export function writeRaxodeConfigFile(
  configFile: RaxodeConfigFile,
  fallbackDir = process.cwd(),
): void {
  ensureRaxodeHomeScaffold(fallbackDir);
  const filePath = resolveConfigJsonPath(fallbackDir);
  writeFileSync(filePath, `${JSON.stringify(configFile, null, 2)}\n`, "utf8");
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best-effort only.
  }
}

export function resolveConfiguredWorkspaceRoot(fallbackDir = process.cwd()): string {
  return resolveWorkspaceRoot(fallbackDir);
}

function resolveRoleBindingProfile(
  config: RaxodeConfigFile,
  roleId: RaxodeRoleId,
): RaxodeProviderProfile {
  const binding = config.roleBindings[roleId];
  if (!binding) {
    throw new RaxodeConfigError(`Raxode config.json 缺少角色绑定: ${roleId}`);
  }
  const profile = config.profiles.find((entry) => entry.id === binding.profileId);
  if (!profile) {
    throw new RaxodeConfigError(`Raxode config.json 找不到角色 ${roleId} 绑定的 profile: ${binding.profileId}`);
  }
  return profile;
}

export function loadResolvedRoleConfig(
  roleId: RaxodeRoleId,
  fallbackDir = process.cwd(),
): RaxodeResolvedRoleConfig {
  const authFile = loadRaxodeAuthFile(fallbackDir);
  const configFile = loadRaxodeConfigFile(fallbackDir);
  const binding = configFile.roleBindings[roleId];
  if (!binding) {
    throw new RaxodeConfigError(`Raxode config.json 缺少角色绑定: ${roleId}`);
  }
  const profile = resolveRoleBindingProfile(configFile, roleId);
  const authProfile = authFile.authProfiles.find((entry) => entry.id === profile.authProfileId);
  if (!authProfile) {
    throw new RaxodeConfigError(`Raxode auth.json 找不到角色 ${roleId} 绑定 profile 使用的 auth profile: ${profile.authProfileId}`);
  }
  if (authProfile.provider !== profile.provider) {
    throw new RaxodeConfigError(
      `Raxode role/auth 不匹配: ${roleId} 使用了 ${profile.provider} profile，但 auth profile 属于 ${authProfile.provider}`,
    );
  }
  return {
    roleId,
    binding,
    profile,
    authProfile,
  };
}

function resolveRolePlan(
  config: RaxodeConfigFile,
  roleId: RaxodeRoleId,
): RaxodeRoutePlan {
  const binding = config.roleBindings[roleId];
  const profile = resolveRoleBindingProfile(config, roleId);
  return {
    model: binding.overrides?.model ?? profile.model,
    reasoning: binding.overrides?.reasoning ?? profile.reasoningEffort ?? "none",
    serviceTier: binding.overrides?.serviceTier,
    contextWindowTokens: binding.overrides?.contextWindowTokens ?? profile.contextWindowTokens,
    maxOutputTokens: binding.overrides?.maxOutputTokens ?? profile.maxOutputTokens,
  };
}

export function loadRaxodeRolePlan(
  roleId: RaxodeRoleId,
  fallbackDir = process.cwd(),
): RaxodeRoutePlan {
  const config = loadRaxodeConfigFile(fallbackDir);
  return resolveRolePlan(config, roleId);
}

export function loadRaxodeLiveChatModelPlan(fallbackDir = process.cwd()): RaxodeLiveChatModelPlan {
  const config = loadRaxodeConfigFile(fallbackDir);
  return {
    core: {
      main: resolveRolePlan(config, "core.main"),
    },
    tui: {
      main: resolveRolePlan(config, "tui.main"),
    },
  };
}

export function loadRaxodeUiConfig(fallbackDir = process.cwd()): RaxodeUiConfig {
  return loadRaxodeConfigFile(fallbackDir).ui;
}

export function loadRaxodePermissionsConfig(fallbackDir = process.cwd()): RaxodePermissionsConfig {
  return loadRaxodeConfigFile(fallbackDir).permissions;
}

export function loadRaxodeRuntimeConfigSnapshot(
  fallbackDir = process.cwd(),
): RaxodeRuntimeConfigSnapshot {
  const config = loadRaxodeConfigFile(fallbackDir);
  return {
    modelPlan: loadRaxodeLiveChatModelPlan(fallbackDir),
    ui: config.ui,
    permissions: config.permissions,
    embedding: config.embedding,
    workspace: config.workspace,
  };
}

export function loadResolvedProviderSlotConfig(
  slot: RaxodeProviderSlot,
  fallbackDir = process.cwd(),
): RaxodeResolvedProfile {
  const authFile = loadRaxodeAuthFile(fallbackDir);
  const configFile = loadRaxodeConfigFile(fallbackDir);
  const profileId = configFile.providerSlots[slot];
  if (!profileId) {
    throw new RaxodeConfigError(`Raxode config.json 未配置 providerSlots.${slot}`);
  }
  const profile = configFile.profiles.find((entry) => entry.id === profileId);
  if (!profile) {
    throw new RaxodeConfigError(`Raxode config.json 找不到 providerSlots.${slot} 指向的 profile: ${profileId}`);
  }
  const authId = authFile.activeAuthProfileIdBySlot[slot] ?? profile.authProfileId;
  const authProfile = authFile.authProfiles.find((entry) => entry.id === authId);
  if (!authProfile) {
    throw new RaxodeConfigError(`Raxode auth.json 找不到 provider slot ${slot} 使用的 auth profile: ${authId}`);
  }
  if (authProfile.provider !== profile.provider) {
    throw new RaxodeConfigError(
      `Raxode provider/auth 不匹配: ${slot} 使用了 ${profile.provider} profile，但 auth profile 属于 ${authProfile.provider}`,
    );
  }
  return {
    slot,
    profile,
    authProfile,
  };
}

export function loadResolvedProviderSlotConfigs(fallbackDir = process.cwd()): {
  openai: RaxodeResolvedProfile;
  anthropic: RaxodeResolvedProfile;
  anthropicAlt?: RaxodeResolvedProfile;
  deepmind: RaxodeResolvedProfile;
} {
  const config = loadRaxodeConfigFile(fallbackDir);
  const anthropicAlt = config.providerSlots.anthropicAlt
    ? loadResolvedProviderSlotConfig("anthropicAlt", fallbackDir)
    : undefined;
  return {
    openai: loadResolvedProviderSlotConfig("openai", fallbackDir),
    anthropic: loadResolvedProviderSlotConfig("anthropic", fallbackDir),
    anthropicAlt,
    deepmind: loadResolvedProviderSlotConfig("deepmind", fallbackDir),
  };
}

function normalizeEmbeddingBaseURL(input: string): string {
  const trimmed = input.trim().replace(/\/$/u, "");
  return trimmed.endsWith("/embeddings")
    ? trimmed.slice(0, -"/embeddings".length)
    : trimmed;
}

export function loadResolvedEmbeddingConfig(
  fallbackDir = process.cwd(),
): RaxodeResolvedEmbeddingConfig | null {
  const configFile = loadRaxodeConfigFile(fallbackDir);
  const authFile = loadRaxodeAuthFile(fallbackDir);
  const provider = configFile.embedding.provider ?? "openai";
  const baseURL = configFile.embedding.baseURL?.trim();
  const authProfileId = configFile.embedding.authProfileId?.trim();
  if (provider !== "openai" || !baseURL || !authProfileId) {
    return null;
  }
  const authProfile = authFile.authProfiles.find((entry) => entry.id === authProfileId);
  if (!authProfile) {
    throw new RaxodeConfigError(`Raxode auth.json 找不到 embedding 使用的 auth profile: ${authProfileId}`);
  }
  if (authProfile.provider !== "openai") {
    throw new RaxodeConfigError(`Embedding auth profile 必须属于 openai provider: ${authProfileId}`);
  }
  const apiKey = authProfile.credentials.apiKey?.trim();
  if (!apiKey) {
    throw new RaxodeConfigError(`Embedding auth profile 缺少 apiKey: ${authProfileId}`);
  }
  return {
    provider: "openai",
    model: configFile.embedding.lanceDbModel,
    baseURL: normalizeEmbeddingBaseURL(baseURL),
    apiKey,
    dimensions: configFile.embedding.dimensions,
    authProfileId,
  };
}
