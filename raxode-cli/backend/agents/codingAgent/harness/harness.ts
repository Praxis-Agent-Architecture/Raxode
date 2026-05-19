import { praxis } from "@praxis-ai/praxis";
import type { HarnessSpec } from "@praxis-ai/praxis";

import type { NormalizedRaxodeOptions } from "../config/raxodeOptions.js";
import { createRaxodeToolSet } from "../tools/toolSet.js";

export function createRaxodeHarness(options: NormalizedRaxodeOptions): HarnessSpec {
  return praxis.harness({
    modelRef: "model.raxode.coding.primary",
    modelFleetRef: "modelFleet.raxode.auto",
    promptPackRef: "prompt.raxode.coding",
    toolPolicyRef: `toolPolicy.raxode.${options.policyProfile}`,
    mainLoopRef: "mainLoop.raxode.coding",
    sandboxRef: options.sandboxProfile === "hostObserved"
      ? "sandbox.hostObserved"
      : options.sandboxProfile === "workspaceOnly"
        ? "sandbox.workspaceOnly"
        : "sandbox.linuxBubblewrap",
    storageRef: options.persistence === "sqlite" ? "storage.raxode.workspace" : "storage.raxode.memory",
    sessionRef: options.persistence === "sqlite" ? "session.raxode.sqlite" : "session.raxode.memory",
    statePlaneRef: "statePlane.raxode.control",
    interfaceRefs: [
      "interface.raxode.tui",
      "interface.raxode.approval",
      "interface.raxode.events",
      "interface.raxode.management",
      "interface.raxode.repair",
    ],
    contextRefs: [
      "context.raxode.cmpBridge.placeholder",
      "context.raxode.workspace",
    ],
    memoryRefs: [
      "memory.raxode.mpBridge.placeholder",
      "memory.raxode.artifactIndex",
    ],
    tools: praxis.tools(createRaxodeToolSet(options)),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: [
        "agent.invoke",
        "manifest.inspect",
        "promptPack.define",
        "tool.execute",
        "dependency.prepare",
        "storage.init",
        "session.persist",
        "state.control",
        "application.control",
      ],
    }),
    loop: praxis.loop.standard({
      maxModelTurns: 4096,
      maxToolCalls: 4096,
    }),
  });
}
