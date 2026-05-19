import { praxis } from "@praxis-ai/praxis";
import type {
  AgentIdentity,
  BaseToolPolicyMatrixSpec,
  HarnessSpec,
  MainLoopSpec,
  ModelFleetSpec,
  ModelSpec,
  SandboxSpec,
  SessionSpec,
  StatePlaneSpec,
  StorageSpec,
} from "@praxis-ai/praxis";

import { createRaxodeIdentity } from "./config/identity.js";
import { createRaxodeModel, createRaxodeModelFleet } from "./config/modelFleet.js";
import type { RaxodeOptions } from "./config/raxodeOptions.js";
import { normalizeRaxodeOptions } from "./config/raxodeOptions.js";
import { createRaxodeHarness } from "./harness/harness.js";
import { createRaxodeMainLoop } from "./mainLoop/mainLoop.js";
import { createRaxodeToolPolicy } from "./policies/toolPolicy.js";
import { RaxodeCodingPrompt } from "./prompts/codingPrompt.js";
import { createRaxodeSandbox } from "./sandbox/profile.js";
import { createRaxodeStatePlane } from "./state/statePlane.js";
import { createRaxodeSession, createRaxodeStorage } from "./storage/storagePolicy.js";

export default class RaxodeCodingAgent extends praxis.AgentArchetype {
  identity: AgentIdentity;
  model: ModelSpec;
  modelFleet: ModelFleetSpec;
  promptPack: RaxodeCodingPrompt;
  mainLoop: MainLoopSpec;
  sandbox: SandboxSpec;
  toolPolicy: BaseToolPolicyMatrixSpec;
  storage: StorageSpec;
  session: SessionSpec;
  statePlane: StatePlaneSpec;
  harness: HarnessSpec;

  constructor(options: RaxodeOptions = {}) {
    super();
    const normalized = normalizeRaxodeOptions(options);
    this.identity = createRaxodeIdentity();
    this.model = createRaxodeModel(normalized);
    this.modelFleet = createRaxodeModelFleet(normalized);
    this.promptPack = new RaxodeCodingPrompt();
    this.mainLoop = createRaxodeMainLoop(normalized);
    this.sandbox = createRaxodeSandbox(normalized);
    this.toolPolicy = createRaxodeToolPolicy(normalized.policyProfile);
    this.storage = createRaxodeStorage(normalized);
    this.session = createRaxodeSession(normalized);
    this.statePlane = createRaxodeStatePlane();
    this.harness = createRaxodeHarness(normalized);
  }
}

