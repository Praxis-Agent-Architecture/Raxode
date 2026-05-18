import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { WorkspaceGitCheckpointRestoreResult } from "./workspace-git-checkpoint.js";

const require = createRequire(import.meta.url);

interface RestoreWorkspaceGitCheckpointInSubprocessParams {
  appRoot: string;
  sessionId: string;
  workspaceRoot: string;
  checkpointRef: string;
  agentId: string;
}

interface RestoreWorkspaceGitCheckpointRunnerOutput {
  ok: true;
  result: WorkspaceGitCheckpointRestoreResult;
}

function parseRunnerStdout(stdout: string): WorkspaceGitCheckpointRestoreResult {
  const payload = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  if (!payload) {
    throw new Error("Workspace restore runner returned no output.");
  }
  const parsed = JSON.parse(payload) as RestoreWorkspaceGitCheckpointRunnerOutput;
  if (!parsed?.ok || !parsed.result) {
    throw new Error("Workspace restore runner returned an invalid payload.");
  }
  return parsed.result;
}

export async function restoreWorkspaceGitCheckpointInSubprocess(
  params: RestoreWorkspaceGitCheckpointInSubprocessParams,
): Promise<WorkspaceGitCheckpointRestoreResult> {
  const tsxCliPath = require.resolve("tsx/cli");
  const sourceRunnerPath = [
    resolve(params.appRoot, "src/agent_core/tui-input/workspace-git-checkpoint-runner.ts"),
    resolve(params.appRoot, "legacy-src/agent_core/tui-input/workspace-git-checkpoint-runner.ts"),
    resolve(params.appRoot, "agent_core/tui-input/workspace-git-checkpoint-runner.ts"),
  ].find((candidate) => existsSync(candidate));
  const distRunnerPath = resolve(params.appRoot, "dist/agent_core/tui-input/workspace-git-checkpoint-runner.js");
  const command = process.execPath;
  const args = sourceRunnerPath ? [tsxCliPath, sourceRunnerPath] : [distRunnerPath];

  return await new Promise<WorkspaceGitCheckpointRestoreResult>((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: params.workspaceRoot,
      env: {
        ...process.env,
        PRAXIS_APP_ROOT: params.appRoot,
        PRAXIS_WORKSPACE_ROOT: params.workspaceRoot,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Workspace restore runner exited with code ${code ?? 1}.`));
        return;
      }
      try {
        resolveResult(parseRunnerStdout(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(`${JSON.stringify({
      sessionId: params.sessionId,
      workspaceRoot: params.workspaceRoot,
      checkpointRef: params.checkpointRef,
      agentId: params.agentId,
    })}\n`);
  });
}
