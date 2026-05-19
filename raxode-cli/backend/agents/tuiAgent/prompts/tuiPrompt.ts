import { praxis } from "@praxis-ai/praxis";

const promptRoot = "raxode-cli/backend/agents/tuiAgent/prompts";

function promptFile(name: string, ref: string) {
  return praxis.prompt.markdownFile(`${promptRoot}/${name}`, ref);
}

export class RaxodeTuiPrompt extends praxis.PromptPack {
  promptPackId = "prompt.raxode.tui";

  base = promptFile("main.md", "raxode.tui.main");

  sceneTriggers = [
    "application.tui",
    "structured.output",
    "ui.summary",
  ];

  auditRefs = ["audit.raxode.tui.v1"];

  patches = [
    praxis.prompt.append("raxode.tui.main", promptFile("schemas.md", "raxode.tui.schemas"), {
      patchId: "raxode.tui.patch.schemas.append",
    }),
    praxis.prompt.append("raxode.tui.main", promptFile("rules.md", "raxode.tui.rules"), {
      patchId: "raxode.tui.patch.rules.append",
    }),
  ];

  materials = [
    `promptPackage:${promptRoot}`,
    "raxode.tui.main",
    "raxode.tui.schemas",
    "raxode.tui.rules",
  ];

  metadata = {
    purpose: "raxode-tui-structured-auxiliary-agent",
    promptPackageRoot: promptRoot,
    providerPayloadBuiltHere: false,
  };
}
