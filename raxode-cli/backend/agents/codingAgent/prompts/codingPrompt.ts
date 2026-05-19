import { praxis } from "@praxis-ai/praxis";

const promptRoot = "raxode-cli/backend/agents/codingAgent/prompts";

function promptFile(name: string, ref: string) {
  return praxis.prompt.markdownFile(`${promptRoot}/${name}`, ref);
}

export class RaxodeCodingPrompt extends praxis.PromptPack {
  promptPackId = "prompt.raxode.coding";

  base = promptFile("main.md", "raxode.main");

  inherits = ["prompt.praxis.defaultReviewer", "prompt.praxis.runtimeVerifier"];

  sceneTriggers = [
    "coding.work",
    "workspace.inspect",
    "tool.use",
    "application.tui",
  ];

  auditRefs = ["audit.raxode.coding.v1"];

  patches = [
    praxis.prompt.prepend("raxode.main", promptFile("evidence.md", "raxode.evidence"), {
      patchId: "raxode.patch.evidence.prepend",
    }),
    praxis.prompt.append("raxode.main", promptFile("tool-use.md", "raxode.toolUse"), {
      patchId: "raxode.patch.toolUse.append",
    }),
    praxis.prompt.append("raxode.main", promptFile("rules.md", "raxode.rules"), {
      patchId: "raxode.patch.rules.append",
    }),
    praxis.prompt.replaceLastLines("raxode.main", 1, promptFile("output-tail.md", "raxode.outputTail"), {
      patchId: "raxode.patch.outputTail.replaceLastLines",
    }),
  ];

  materials = [
    `promptPackage:${promptRoot}`,
    "raxode.main",
    "raxode.evidence",
    "raxode.toolUse",
    "raxode.rules",
    "raxode.outputTail",
  ];

  metadata = {
    purpose: "raxode-coding-application-backend",
    promptPackageRoot: promptRoot,
    providerPayloadBuiltHere: false,
  };
}

