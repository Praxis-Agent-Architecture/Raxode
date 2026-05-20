import { praxis } from "@praxis-ai/praxis";
import type { MainLoopSpec } from "@praxis-ai/praxis";

import type { NormalizedRaxodeOptions } from "../config/raxodeOptions.js";

export function createRaxodeMainLoop(options: NormalizedRaxodeOptions): MainLoopSpec {
  return praxis.mainLoop.standard({
    hooks: {
      buildPrompt: { strategyRef: "raxode.prompt.coding" },
      chooseModel: { strategyRef: "raxode.model.primaryResponses" },
      beforeTool: { policyRef: `raxode.toolPolicy.${options.policyProfile}` },
      afterTool: { strategyRef: "raxode.observation.integrateAndPersist" },
      shouldContinue: { strategyRef: "raxode.loop.coding" },
    },
    metadata: {
      mode: "coding",
      product: "raxode",
      arbitraryUserJs: false,
      applicationLayerOnly: true,
    },
  });
}

