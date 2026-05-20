import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve("automations/copy-dist-assets.mjs");

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test("copy-dist-assets skips runtime assets while rewriting backend project descriptor", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-copy-assets-"));
  const backend = path.join(workspace, "raxode-cli", "backend");
  const frontend = path.join(workspace, "raxode-cli", "frontend", "tui");
  await mkdir(path.join(backend, ".raxode", "agents"), { recursive: true });
  await mkdir(path.join(frontend, ".raxode", "agents"), { recursive: true });
  await mkdir(path.join(workspace, "raxode-cli", "reports"), { recursive: true });
  await mkdir(path.join(frontend, "memory", "generated"), { recursive: true });
  await mkdir(path.join(workspace, "raxode-cli", "backend", "agents", "codingAgent", "prompts"), { recursive: true });

  await writeFile(path.join(backend, "rax.project.json"), JSON.stringify({
    agents: {
      primary: {
        module: "agents/codingAgent/praxis.agent.ts",
      },
    },
  }), "utf8");
  await writeFile(path.join(backend, ".raxode", "agents", "runtime.json"), "{}", "utf8");
  await writeFile(path.join(frontend, ".raxode", "agents", "agent.core_3Amain.json"), "{}", "utf8");
  await writeFile(path.join(workspace, "raxode-cli", "reports", "skip.md"), "skip", "utf8");
  await writeFile(path.join(frontend, "memory", "generated", "skip.md"), "skip", "utf8");
  await writeFile(path.join(workspace, "raxode-cli", "backend", "agents", "codingAgent", "prompts", "main.md"), "keep", "utf8");

  await execFileAsync(process.execPath, [scriptPath], { cwd: workspace });

  const descriptor = JSON.parse(await readFile(path.join(workspace, "dist", "raxode-cli", "backend", "rax.project.json"), "utf8"));
  assert.equal(descriptor.agents.primary.module, "agents/codingAgent/praxis.agent.js");
  assert.equal(await pathExists(path.join(workspace, "dist", "raxode-cli", "backend", "agents", "codingAgent", "prompts", "main.md")), true);
  assert.equal(await pathExists(path.join(workspace, "dist", "raxode-cli", "backend", ".raxode", "agents", "runtime.json")), false);
  assert.equal(await pathExists(path.join(workspace, "dist", "raxode-cli", "frontend", "tui", ".raxode", "agents", "agent.core_3Amain.json")), false);
  assert.equal(await pathExists(path.join(workspace, "dist", "raxode-cli", "reports", "skip.md")), false);
  assert.equal(await pathExists(path.join(workspace, "dist", "raxode-cli", "frontend", "tui", "memory", "generated", "skip.md")), false);
});
