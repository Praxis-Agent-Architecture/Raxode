import type { AgentIdentity } from "@praxis-ai/praxis";

import RaxodeCodingAgent from "../codingAgent/agent.js";

export default class RaxodeTuiSidecarAgent extends RaxodeCodingAgent {
  constructor() {
    super();
    this.identity = createRaxodeTuiSidecarIdentity();
  }
}

function createRaxodeTuiSidecarIdentity(): AgentIdentity {
  return {
    id: "agent.raxode.tui.sidecar",
    name: "Raxode TUI Sidecar Agent",
    version: "0.1.0",
    description: "Auxiliary Raxode agent entry for bounded TUI and sidecar tasks.",
  };
}
