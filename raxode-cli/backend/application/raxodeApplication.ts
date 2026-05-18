export const raxodeApplication = {
  id: "application.raxode.coding",
  displayName: "Raxode Coding Application",
  primaryAgentRef: "agents/codingAgent",
  entrypoints: {
    raxProject: "rax.project.json",
    raxAgentEntry: "agents/codingAgent/praxis.agent.ts",
    localRunner: "application/runRaxodeBackend.ts",
  },
  surfaces: {
    applicationLayer: "src/applicationLayer",
    tui: "raxode-cli/frontend",
    approval: "agents/codingAgent/interfaces/approvalSurface.ts",
    reports: "reports",
    sessions: ".raxode",
  },
} as const;

