import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  resolveWorkspaceGitCheckpointRunnerPath,
  restoreWorkspaceGitCheckpointInSubprocess,
} from "./workspace-git-checkpoint-subprocess.js";
import { writeWorkspaceGitCheckpoint } from "./workspace-git-checkpoint.js";

const appRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("workspace restore subprocess resolves runner from packaged app root layout", () => {
  const appRoot = mkdtempSync(join(tmpdir(), "praxis-workspace-restore-package-root-"));
  try {
    const runnerPath = join(
      appRoot,
      "raxode-cli",
      "frontend",
      "legacy-src",
      "agent_core",
      "tui-input",
      "workspace-git-checkpoint-runner.ts",
    );
    mkdirSync(dirname(runnerPath), { recursive: true });
    writeFileSync(runnerPath, "", "utf8");

    assert.equal(resolveWorkspaceGitCheckpointRunnerPath(appRoot, dirname(runnerPath)), runnerPath);
  } finally {
    rmSync(appRoot, { recursive: true, force: true });
  }
});

test("workspace restore subprocess restores checkpointed files without mutating the caller thread", async () => {
  const home = mkdtempSync(join(tmpdir(), "praxis-workspace-restore-subprocess-home-"));
  const workspace = mkdtempSync(join(tmpdir(), "praxis-workspace-restore-subprocess-workspace-"));
  const oldHome = process.env.RAXODE_HOME;
  process.env.RAXODE_HOME = home;

  try {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "main.ts"), "export const value = 1;\n", "utf8");
    writeFileSync(join(workspace, "README.md"), "# first\n", "utf8");

    const checkpoint = await writeWorkspaceGitCheckpoint({
      sessionId: "session-restore-subprocess",
      turnId: "1",
      workspaceRoot: workspace,
      agentId: "agent.core:main",
    });

    writeFileSync(join(workspace, "src", "main.ts"), "export const value = 2;\n", "utf8");
    writeFileSync(join(workspace, "notes.txt"), "scratch\n", "utf8");

    const restored = await restoreWorkspaceGitCheckpointInSubprocess({
      appRoot,
      sessionId: "session-restore-subprocess",
      workspaceRoot: workspace,
      checkpointRef: checkpoint.checkpointRef,
      agentId: "agent.core:main",
    });

    assert.equal(restored.commitSha, checkpoint.commitSha);
    assert.equal(readFileSync(join(workspace, "src", "main.ts"), "utf8"), "export const value = 1;\n");
    assert.equal(readFileSync(join(workspace, "README.md"), "utf8"), "# first\n");
    assert.equal(existsSync(join(workspace, "notes.txt")), false);
  } finally {
    if (oldHome === undefined) {
      delete process.env.RAXODE_HOME;
    } else {
      process.env.RAXODE_HOME = oldHome;
    }
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});
