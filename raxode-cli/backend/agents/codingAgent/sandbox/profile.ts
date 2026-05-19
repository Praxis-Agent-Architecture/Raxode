import { praxis } from "@praxis-ai/praxis";
import type { SandboxSpec } from "@praxis-ai/praxis";

import type { NormalizedRaxodeOptions } from "../config/raxodeOptions.js";

export function createRaxodeSandbox(options: NormalizedRaxodeOptions): SandboxSpec {
  const resourceLimits = {
    timeoutMs: 120_000,
    maxOutputBytes: 512_000,
  };

  if (options.sandboxProfile === "linuxBubblewrap") {
    return praxis.sandbox.linuxBubblewrap({
      filesystem: "workspace-only",
      network: "deny-by-default",
      shell: "approval-for-write",
      resourceLimits,
    });
  }

  if (options.sandboxProfile === "workspaceOnly") {
    return praxis.sandbox.workspaceOnly({ resourceLimits });
  }

  return praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
    resourceLimits,
  });
}

