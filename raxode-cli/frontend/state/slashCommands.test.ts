import assert from "node:assert/strict";
import test from "node:test";

import { renderSlashCommandLine } from "../components/SlashMenu.js";
import { raxodeSlashCommands, resolveRaxodeSlashCommand, visibleRaxodeSlashCommands } from "./slashCommands.js";
import type { WorkspaceIndexSnapshot } from "./workspaceIndex.js";

test("raxode slash command registry keeps visible commands renumberable and advanced commands hidden", () => {
  assert.deepEqual(visibleRaxodeSlashCommands().map((command) => command.command), [
    "/model",
    "/status",
    "/exit",
    "/init",
    "/resume",
    "/permissions",
    "/workspace",
  ]);
  for (const command of ["/rush", "/cmp", "/mp", "/capabilities", "/agents"]) {
    assert.equal(raxodeSlashCommands.find((entry) => entry.command === command)?.visible, false);
  }
});

test("raxode slash commands resolve to application-layer commands", () => {
  assert.deepEqual(resolveRaxodeSlashCommand("/status"), { type: "application.start" });
  assert.deepEqual(resolveRaxodeSlashCommand("/resume"), { type: "application.resume" });
  assert.deepEqual(resolveRaxodeSlashCommand("/resume session.other"), {
    type: "application.resume",
    sessionId: "session.other",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/resume create Spike Session"), {
    type: "application.createSession",
    name: "Spike Session",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/resume rename session.other Better Name"), {
    type: "application.renameSession",
    sessionId: "session.other",
    name: "Better Name",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/workspace /tmp/raxode"), {
    type: "application.switchWorkspace",
    cwd: "/tmp/raxode",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/model gpt-5.5 low"), {
    type: "application.changeModel",
    model: "gpt-5.5",
    reasoningEffort: "low",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/permissions bapr"), {
    type: "application.changePermissionProfile",
    profile: "bapr",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/permissions approve approval-1 looks good"), {
    type: "application.approvalDecision",
    approvalId: "approval-1",
    decision: "approve",
    note: "looks good",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/permissions request approval-3 needs review"), {
    type: "application.requestApproval",
    approvalId: "approval-3",
    reason: "needs review",
  });
  assert.deepEqual(resolveRaxodeSlashCommand("/permissions always approval-2"), {
    type: "application.approvalDecision",
    approvalId: "approval-2",
    decision: "approve_always",
    note: undefined,
  });
  assert.equal(resolveRaxodeSlashCommand("hello"), undefined);
});

test("workspace slash command can resolve indexed relative directories", () => {
  const workspaceIndex: WorkspaceIndexSnapshot = {
    root: "/repo",
    files: [],
    directories: [".", "src", "src/applicationLayer", "raxode-cli"],
    fileStatus: "ready",
    directoryStatus: "ready",
    fileError: null,
  };

  assert.deepEqual(resolveRaxodeSlashCommand("/workspace appLayer", {
    cwd: "/repo",
    workspaceIndex,
  }), {
    type: "application.switchWorkspace",
    cwd: "/repo/src/applicationLayer",
  });
});

test("raxode slash command lines are renumbered from visible commands only", () => {
  const lines = visibleRaxodeSlashCommands().map((command, index) => renderSlashCommandLine(command, index));
  assert.equal(lines[0], "01 /model         Choose model and reasoning settings");
  assert.equal(lines[2], "03 /exit          Exit the current session");
  assert.equal(lines.at(-1), "07 /workspace     Switch current workspace directory");
});
