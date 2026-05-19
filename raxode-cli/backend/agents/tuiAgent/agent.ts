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

import { createRaxodeTuiIdentity } from "./config/identity.js";
import { createRaxodeTuiModel, createRaxodeTuiModelFleet } from "./config/modelFleet.js";
import type { RaxodeTuiOptions } from "./config/options.js";
import { normalizeRaxodeTuiOptions } from "./config/options.js";
import { RaxodeTuiPrompt } from "./prompts/tuiPrompt.js";

export default class RaxodeTuiAgent extends praxis.AgentArchetype {
  identity: AgentIdentity;
  model: ModelSpec;
  modelFleet: ModelFleetSpec;
  promptPack: RaxodeTuiPrompt;
  mainLoop: MainLoopSpec;
  sandbox: SandboxSpec;
  toolPolicy: BaseToolPolicyMatrixSpec;
  storage: StorageSpec;
  session: SessionSpec;
  statePlane: StatePlaneSpec;
  harness: HarnessSpec;

  constructor(options: RaxodeTuiOptions = {}) {
    super();
    const normalized = normalizeRaxodeTuiOptions(options);
    this.identity = createRaxodeTuiIdentity();
    this.model = createRaxodeTuiModel(normalized);
    this.modelFleet = createRaxodeTuiModelFleet(normalized);
    this.promptPack = new RaxodeTuiPrompt();
    this.mainLoop = praxis.mainLoop.standard({
      hooks: {
        buildPrompt: { strategyRef: "raxode.tui.prompt.structured" },
        chooseModel: { strategyRef: "raxode.tui.model.primaryResponses" },
        shouldContinue: { strategyRef: "raxode.tui.loop.singleStructuredOutput" },
      },
      metadata: {
        mode: "tui-structured-auxiliary",
        product: "raxode",
        toolExecution: false,
      },
    });
    this.sandbox = praxis.sandbox.hostObserved({
      sandboxId: "sandbox.raxode.tui.hostObserved",
      filesystem: "read-only",
      network: "deny-by-default",
      shell: "deny",
    });
    this.toolPolicy = praxis.toolPolicies.custom({
      matrixId: "toolPolicy.raxode.tui.noTools",
      defaultDecision: "deny",
      eventLogLevel: "summary",
      metadata: {
        purpose: "TUI auxiliary agent does not execute tools",
      },
    });
    this.storage = praxis.storage.memory({
      metadata: {
        persistence: "none",
      },
    });
    this.session = praxis.session({
      persistence: "memory",
      resume: "manual",
      thread: "ephemeral",
      logs: "summary",
    });
    this.statePlane = praxis.statePlane({
      expose: ["phase", "errors"],
      control: [],
      audit: "summary",
    });
    this.harness = praxis.harness({
      modelRef: "model.raxode.tui.primary",
      modelFleetRef: "modelFleet.raxode.tui",
      promptPackRef: "prompt.raxode.tui",
      toolPolicyRef: "toolPolicy.raxode.tui.noTools",
      mainLoopRef: "mainLoop.raxode.tui",
      sandboxRef: "sandbox.raxode.tui.hostObserved",
      storageRef: "storage.raxode.tui.memory",
      sessionRef: "session.raxode.tui.ephemeral",
      statePlaneRef: "statePlane.raxode.tui",
      interfaceRefs: ["interface.raxode.tui"],
      contextRefs: ["context.raxode.uiTask"],
      memoryRefs: [],
      tools: praxis.tools([]),
      policy: praxis.policy({
        allowProviderCall: true,
        allowToolExecution: false,
        scopes: [
          "agent.invoke",
          "manifest.inspect",
          "promptPack.define",
          "application.control",
        ],
      }),
      loop: praxis.loop.single({
        maxModelTurns: 1,
        maxToolCalls: 0,
      }),
    });
  }
}
