import assert from "node:assert/strict";
import test from "node:test";

import type { RaxodeApplicationViewModel } from "../../contracts.js";
import { buildRaxodeSlashPanel } from "./slashPanels.js";
import type { WorkspaceIndexSnapshot } from "./workspaceIndex.js";

const view: RaxodeApplicationViewModel = {
  applicationId: "application.raxode.coding",
  projectId: "raxode",
  runtimeId: "runtime",
  sessionId: "session",
  agentId: "agent.raxode.coding",
  agentEntries: [
    { key: "primary", agentId: "agent.raxode.coding", role: "primary" },
    { key: "tui", agentId: "agent.raxode.tui", role: "sidecar" },
  ],
  status: "ready",
  workspaceRoot: "/repo",
  mode: "dry-run",
  model: { model: "gpt-5.5", reasoningEffort: "low" },
  permissionProfile: "standard",
  sessions: [{
    sessionId: "session",
    name: "session",
    workspaceRoot: "/repo",
    status: "ready",
    lastActiveAt: "2026-05-10T00:00:00.000Z",
    turns: 0,
  }],
  approvals: [{
    approvalId: "approval-pending",
    status: "pending",
    note: "needs review",
    updatedAt: "2026-05-10T00:00:01.000Z",
  }, {
    approvalId: "approval-1",
    decision: "approve",
    status: "decided",
    note: "ok",
    updatedAt: "2026-05-10T00:00:00.000Z",
  }],
  tools: { total: 175, mounted: 175, byFamily: {}, byRiskLevel: {}, byReadiness: {}, mountedToolIds: [] },
  counters: { turns: 0, events: 0, modelCalls: 0, toolCalls: 0, mainLoopSteps: 0 },
  lines: [],
  events: [],
};

test("slash panels describe model and permission commands from current view", () => {
  assert.equal(buildRaxodeSlashPanel("/model", view)?.lines[0], "current gpt-5.5/low");
  assert.equal(buildRaxodeSlashPanel("/permissions", view)?.lines[0], "current standard");
  assert.ok(buildRaxodeSlashPanel("/permissions", view)?.lines.some((line) => line.includes("approval-pending")));
  assert.ok(buildRaxodeSlashPanel("/permissions", view)?.lines.some((line) => line.includes("approval-1")));
  assert.equal(buildRaxodeSlashPanel("/permissions", view)?.actions?.some((action) =>
    action.command?.type === "application.approvalDecision"
    && action.command.approvalId === "approval-pending"
    && action.command.decision === "approve"), true);
  assert.equal(buildRaxodeSlashPanel("/permissions", view)?.actions?.some((action) =>
    action.command?.type === "application.approvalDecision"
    && action.command.approvalId === "approval-pending"
    && action.command.decision === "approve_always"), true);
  assert.equal(buildRaxodeSlashPanel("/workspace", view)?.lines[0], "current /repo");
  assert.equal(buildRaxodeSlashPanel("/resume", view)?.lines[0], "current session");
  assert.ok(buildRaxodeSlashPanel("/resume", view)?.lines.some((line) => line.includes("turns=0")));
  assert.equal(buildRaxodeSlashPanel("/resume", view)?.actions?.[0]?.prefill, "/resume create ");
  assert.equal(buildRaxodeSlashPanel("/resume", view)?.actions?.some((action) =>
    action.command?.type === "application.resume" && action.command.sessionId === "session"), true);
  assert.equal(buildRaxodeSlashPanel("/resume", view)?.actions?.some((action) =>
    action.prefill === "/resume rename session "), true);
  assert.equal(buildRaxodeSlashPanel("/nope", view), undefined);
});

test("workspace slash panel can surface indexed directory hints", () => {
  const index: WorkspaceIndexSnapshot = {
    root: view.workspaceRoot,
    files: [],
    directories: [".", "src", "src/applicationLayer", "raxode-cli", "raxode-cli/frontend"],
    fileStatus: "ready",
    directoryStatus: "ready",
    fileError: null,
  };

  const panel = buildRaxodeSlashPanel("/workspace", view, index);
  assert.ok(panel?.lines.some((line) => line.includes("src/applicationLayer")));
  assert.equal(panel?.actions?.[0]?.command?.type, "application.switchWorkspace");
  assert.equal(panel?.actions?.some((action) =>
    action.command?.type === "application.switchWorkspace" && action.command.cwd === "/repo/src/applicationLayer"), true);
});
