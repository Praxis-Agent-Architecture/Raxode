import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import { render } from "ink";
import React from "react";

import type { RaxodeApplicationViewModel } from "../../contracts.js";
import { RaxodeShell } from "./Shell.js";

class CollectingTty extends Writable {
  columns = 120;
  rows = 40;
  isTTY = true;
  output = "";

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.output += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    callback();
  }
}

const view: RaxodeApplicationViewModel = {
  applicationId: "application.raxode.coding",
  projectId: "raxode",
  runtimeId: "runtime.application.raxode.coding",
  sessionId: "session.application.raxode.coding.default",
  agentId: "agent.raxode.coding",
  agentEntries: [
    { key: "primary", agentId: "agent.raxode.coding", role: "primary" },
    { key: "tui", agentId: "agent.raxode.tui", role: "sidecar" },
  ],
  status: "ready",
  workspaceRoot: "/home/proview/Desktop/Praxis_series/Praxis_org",
  mode: "dry-run",
  model: { model: "gpt-5.5", reasoningEffort: "low" },
  permissionProfile: "standard",
  sessions: [],
  approvals: [],
  tools: {
    total: 175,
    mounted: 175,
    byFamily: { shellBase: 32, gitBase: 35 },
    byRiskLevel: {},
    byReadiness: {},
    mountedToolIds: [],
  },
  counters: { turns: 1, events: 2, modelCalls: 0, toolCalls: 0, mainLoopSteps: 0 },
  finalOutput: "ready",
  lines: [],
  events: [],
};

test("RaxodeShell render keeps visual anchor text", async () => {
  const stdout = new CollectingTty();
  const stderr = new CollectingTty();
  const instance = render(React.createElement(RaxodeShell, { view }), {
    stdout: stdout as never,
    stderr: stderr as never,
    debug: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  instance.unmount();

  assert.match(stdout.output, /Raxode/u);
  assert.match(stdout.output, /powered by Praxis/u);
  assert.match(stdout.output, /v0\.1\.0/u);
  assert.match(stdout.output, /\/model/u);
  assert.match(stdout.output, /\/workspace/u);
  assert.match(stdout.output, /WorkSpace|Workspace/u);
  assert.match(stdout.output, /gpt-5\.5\/low/u);
  assert.match(stdout.output, /standard/u);
});
