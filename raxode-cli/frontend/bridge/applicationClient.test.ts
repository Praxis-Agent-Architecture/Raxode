import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createProcessApplicationClient } from "./applicationClient.js";

test("process application client submits a turn through the stdio backend", async () => {
  const client = createProcessApplicationClient();
  const ready = await client.ready;
  assert.equal(ready.applicationId, "application.raxode.coding");

  const events: string[] = [];
  const unsubscribe = client.subscribe((event) => events.push(event.kind));
  const result = await client.dispatch({
    type: "application.submitTurn",
    mode: "dry-run",
    input: {
      type: "application.input",
      text: "dry-run process client test",
      cwd: process.cwd(),
    },
  });
  unsubscribe();
  await client.close();

  assert.equal(result.ok, true);
  assert.equal(result.view.agentId, "agent.raxode.coding");
  assert.equal(result.view.tools.mounted, 175);
  assert.equal(events.includes("conversation"), true);
  assert.equal(events.includes("final"), true);
});

test("process application client restarts backend after a crash before the next dispatch", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "raxode-client-restart-"));
  const markerPath = path.join(tempDir, "runs.txt");
  const view = {
    applicationId: "application.raxode.coding",
    projectId: "raxode",
    runtimeId: "runtime.test",
    sessionId: "session.test",
    agentId: "agent.raxode.coding",
    status: "ready",
    workspaceRoot: tempDir,
    mode: "dry-run",
    model: { model: "gpt-5.5", reasoningEffort: "low" },
    permissionProfile: "standard",
    tools: { total: 0, mounted: 0, byFamily: {}, byRiskLevel: {}, byReadiness: {}, mountedToolIds: [] },
    counters: { turns: 0, events: 0, modelCalls: 0, toolCalls: 0, mainLoopSteps: 0 },
    lines: [],
    events: [],
  };
  const backendScript = `
    const fs = require("node:fs");
    const marker = ${JSON.stringify(markerPath)};
    const view = ${JSON.stringify(view)};
    const runs = fs.existsSync(marker) ? Number(fs.readFileSync(marker, "utf8")) + 1 : 1;
    fs.writeFileSync(marker, String(runs));
    process.stdout.write(JSON.stringify({ type: "application.ready", view }) + "\\n");
    if (runs === 1) setTimeout(() => process.exit(77), 25);
    process.stdin.on("data", (chunk) => {
      for (const line of String(chunk).trim().split(/\\r?\\n/u).filter(Boolean)) {
        const parsed = JSON.parse(line);
        process.stdout.write(JSON.stringify({
          type: "application.commandResult",
          commandId: parsed.commandId,
          result: { ok: true, view: { ...view, status: "completed" }, events: [] },
        }) + "\\n");
      }
    });
  `;
  const encodedScript = Buffer.from(backendScript, "utf8").toString("base64");
  const client = createProcessApplicationClient({
    command: process.execPath,
    args: ["-e", `eval(Buffer.from(${JSON.stringify(encodedScript)}, "base64").toString("utf8"))`],
  });
  await client.ready;
  await new Promise((resolve) => setTimeout(resolve, 80));
  const result = await client.dispatch({ type: "application.start" });
  await client.close();
  rmSync(tempDir, { recursive: true, force: true });

  assert.equal(result.ok, true);
  assert.equal(result.view.status, "completed");
});
