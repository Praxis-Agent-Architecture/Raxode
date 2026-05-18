import { praxis } from "@praxis-ai/praxis";
import type { ToolSpec } from "@praxis-ai/praxis";

import type { NormalizedRaxodeOptions } from "../config/raxodeOptions.js";

export function createRaxodeToolSet(options: NormalizedRaxodeOptions): ToolSpec[] {
  if (!options.includeAllCatalogTools) {
    return [
      ...praxis.toolSets.coding.readonly({ includeGit: true, includeSearch: true }),
      ...praxis.toolSets.shell.safe(),
      ...praxis.toolSets.skill.authoring(),
    ];
  }

  return praxis.listBaseToolDeveloperCatalog()
    .map((entry) => praxis.tryBaseToolById(entry.toolId))
    .filter((lookup): lookup is Extract<typeof lookup, { ok: true }> => lookup.ok)
    .map((lookup) => lookup.tool);
}

