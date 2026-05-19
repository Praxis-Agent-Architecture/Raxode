export const topology = {
  topologyId: "topology.raxode.dualAgent",
  status: "primary-plus-tui-auxiliary",
  agents: ["agent.raxode.coding", "agent.raxode.tui"],
  primaryAgent: "agent.raxode.coding",
  auxiliaryAgents: {
    tui: "agent.raxode.tui",
  },
  futureAgents: [],
} as const;
