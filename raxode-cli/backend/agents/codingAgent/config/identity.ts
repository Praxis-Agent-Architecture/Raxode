import type { AgentIdentity } from "@praxis-ai/praxis";

export function createRaxodeIdentity(): AgentIdentity {
  return {
    id: "agent.raxode.coding",
    name: "Raxode Coding Agent",
    version: "0.1.0",
    description: "The full-capability coding agent behind the Raxode TUI application.",
  };
}

