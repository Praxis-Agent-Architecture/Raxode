import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureRaxodeHomeScaffold,
  loadRaxodeConfigFile,
  loadRaxodeLiveChatModelPlan,
  loadRaxodePermissionsConfig,
  loadResolvedEmbeddingConfig,
  loadResolvedProviderSlotConfig,
  resolveConfiguredWorkspaceRoot,
} from "../config/raxode-config.js";

test("ensureRaxodeHomeScaffold creates auth/config templates and state directories", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-home-"));
  const workspaceDir = path.join(rootDir, "workspace");
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  process.env.PRAXIS_WORKSPACE_ROOT = workspaceDir;

  const result = ensureRaxodeHomeScaffold(workspaceDir);

  assert.ok(result.createdPaths.some((entry) => entry.endsWith("auth.json")));
  assert.ok(result.createdPaths.some((entry) => entry.endsWith("config.json")));
  const authRaw = await readFile(result.authPath, "utf8");
  const configRaw = await readFile(result.configPath, "utf8");
  const auth = JSON.parse(authRaw) as { authProfiles: unknown[] };
  const config = JSON.parse(configRaw) as { roleBindings: Record<string, unknown> };
  const parsedConfig = JSON.parse(configRaw) as { ui?: { animationMode?: string } };
  assert.equal(auth.authProfiles.length, 4);
  assert.equal(Object.keys(config.roleBindings).length, 2);
  assert.equal(parsedConfig.ui?.animationMode, "off");

  delete process.env.RAXODE_HOME;
  delete process.env.PRAXIS_WORKSPACE_ROOT;
});

test("loadRaxodeLiveChatModelPlan resolves the active core and tui role plans from config", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-plan-"));
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  ensureRaxodeHomeScaffold(rootDir);

  const configPath = path.join(process.env.RAXODE_HOME!, "config.json");
  const config = loadRaxodeConfigFile(rootDir);
  config.roleBindings["tui.main"].overrides = {
    model: "gpt-5.4",
    reasoning: "medium",
    maxOutputTokens: 321_000,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const plan = loadRaxodeLiveChatModelPlan(rootDir);

  assert.equal(plan.core.main.model, "gpt-5.5");
  assert.equal(plan.core.main.reasoning, "low");
  assert.equal(plan.tui.main.model, "gpt-5.4");
  assert.equal(plan.tui.main.reasoning, "medium");
  assert.equal(plan.tui.main.maxOutputTokens, 321_000);

  delete process.env.RAXODE_HOME;
});

test("loadRaxodeConfigFile migrates previous default core model to gpt-5.5 low", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-migrate-"));
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  ensureRaxodeHomeScaffold(rootDir);

  const configPath = path.join(process.env.RAXODE_HOME!, "config.json");
  const config = loadRaxodeConfigFile(rootDir);
  config.schemaVersion = 1;
  const coreProfile = config.profiles.find((entry) => entry.id === "profile.core.main");
  assert.ok(coreProfile);
  coreProfile.model = "gpt-5.4";
  coreProfile.reasoningEffort = "high";
  config.roleBindings["core.main"].overrides = {
    reasoning: "high",
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const migrated = loadRaxodeConfigFile(rootDir);
  const migratedRaw = JSON.parse(await readFile(configPath, "utf8")) as { schemaVersion?: number };

  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migratedRaw.schemaVersion, 3);
  assert.equal(migrated.profiles.find((entry) => entry.id === "profile.core.main")?.model, "gpt-5.5");
  assert.equal(migrated.profiles.find((entry) => entry.id === "profile.core.main")?.reasoningEffort, "low");
  assert.equal(migrated.roleBindings["core.main"].overrides, undefined);

  delete process.env.RAXODE_HOME;
});

test("loadResolvedProviderSlotConfig binds provider profile and auth profile through slots", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-provider-"));
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  ensureRaxodeHomeScaffold(rootDir);

  const authPath = path.join(process.env.RAXODE_HOME!, "auth.json");
  const auth = JSON.parse(await readFile(authPath, "utf8")) as {
    authProfiles: Array<{ id: string; authMode?: string; credentials: { apiKey?: string } }>;
  };
  assert.equal(auth.authProfiles[0]?.authMode, "api_key");
  auth.authProfiles[0]!.credentials.apiKey = "test-openai";
  await writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");

  const resolved = loadResolvedProviderSlotConfig("openai", rootDir);

  assert.equal(resolved.profile.id, "profile.core.main");
  assert.equal(resolved.authProfile.id, "auth.openai.default");
  assert.equal(resolved.authProfile.credentials.apiKey, "test-openai");

  delete process.env.RAXODE_HOME;
});

test("loadRaxodePermissionsConfig reads persistent capability overrides without compatibility matrix generation", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-permissions-"));
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  ensureRaxodeHomeScaffold(rootDir);

  const configPath = path.join(process.env.RAXODE_HOME!, "config.json");
  const config = loadRaxodeConfigFile(rootDir);
  config.permissions.capabilityOverrides = [
    {
      capabilitySelector: "git.push",
      policy: "human_gate",
      reason: "Always confirm before push",
    },
  ];
  config.permissions.requestedMode = "standard";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const permissions = loadRaxodePermissionsConfig(rootDir);

  assert.equal(permissions.requestedMode, "standard");
  assert.equal(permissions.capabilityOverrides[0]?.capabilitySelector, "git.push");
  assert.equal(permissions.shared15ViewMatrix.length, 0);

  delete process.env.RAXODE_HOME;
});

test("loadRaxodeConfigFile resolves ui.animationMode from config", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-ui-animation-"));
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  ensureRaxodeHomeScaffold(rootDir);

  const configPath = path.join(process.env.RAXODE_HOME!, "config.json");
  const config = loadRaxodeConfigFile(rootDir);
  config.ui.animationMode = "off";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const reloaded = loadRaxodeConfigFile(rootDir);
  assert.equal(reloaded.ui.animationMode, "off");

  delete process.env.RAXODE_HOME;
});

test("resolveConfiguredWorkspaceRoot prefers launch cwd over persisted default workspace", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-workspace-"));
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  ensureRaxodeHomeScaffold(rootDir);

  const configPath = path.join(process.env.RAXODE_HOME!, "config.json");
  const config = loadRaxodeConfigFile(rootDir);
  config.workspace.defaultPath = "/tmp/praxis-default-workspace";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  delete process.env.PRAXIS_WORKSPACE_ROOT;
  process.env.INIT_CWD = "/tmp/launch-workspace";
  assert.equal(resolveConfiguredWorkspaceRoot(rootDir), "/tmp/launch-workspace");

  process.env.PRAXIS_WORKSPACE_ROOT = "/tmp/runtime-override";
  assert.equal(resolveConfiguredWorkspaceRoot(rootDir), "/tmp/runtime-override");

  delete process.env.PRAXIS_WORKSPACE_ROOT;
  delete process.env.INIT_CWD;
  assert.equal(resolveConfiguredWorkspaceRoot(rootDir), rootDir);

  delete process.env.RAXODE_HOME;
});

test("loadResolvedEmbeddingConfig resolves dedicated embedding upstream config", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-embedding-"));
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  ensureRaxodeHomeScaffold(rootDir);

  const authPath = path.join(process.env.RAXODE_HOME!, "auth.json");
  const configPath = path.join(process.env.RAXODE_HOME!, "config.json");
  const auth = JSON.parse(await readFile(authPath, "utf8")) as {
    authProfiles: Array<{ id: string; provider: string; authMode?: string; credentials: { apiKey?: string } }>;
  };
  auth.authProfiles.push({
    id: "auth.openai.embedding.default",
    provider: "openai",
    label: "Embedding Upstream",
    authMode: "api_key",
    credentials: {
      apiKey: "test-embedding-key",
    },
    meta: {
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  } as never);
  await writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");

  const config = loadRaxodeConfigFile(rootDir);
  config.embedding.baseURL = "https://viewpro.top/v1/embeddings";
  config.embedding.authProfileId = "auth.openai.embedding.default";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const resolved = loadResolvedEmbeddingConfig(rootDir);

  assert.equal(resolved?.model, "text-embedding-3-large");
  assert.equal(resolved?.apiKey, "test-embedding-key");
  assert.equal(resolved?.baseURL, "https://viewpro.top/v1");

  delete process.env.RAXODE_HOME;
});
