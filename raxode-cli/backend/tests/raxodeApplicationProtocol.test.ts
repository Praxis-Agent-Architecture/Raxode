import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { startRaxodeStdioApplicationServer } from "../application/stdioApplicationServer.js";

function collectLines(stream: PassThrough): string[] {
  const lines: string[] = [];
  let remainder = "";
  stream.on("data", (chunk: Buffer | string) => {
    const combined = remainder + (typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    const parts = combined.split(/\r?\n/u);
    remainder = parts.pop() ?? "";
    lines.push(...parts.filter(Boolean));
  });
  return lines;
}

async function waitForLine(
  lines: readonly string[],
  predicate: (line: Record<string, unknown>) => boolean,
  timeoutMs = 4000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (predicate(parsed)) return parsed;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for protocol line; saw ${lines.length} lines`);
}

test("raxode stdio application server speaks application JSONL protocol", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const errors = new PassThrough();
  const lines = collectLines(output);
  const done = startRaxodeStdioApplicationServer({
    input,
    output,
    errorOutput: errors,
    projectRoot: "raxode-cli/backend",
    now: () => "2026-05-10T00:00:00.000Z",
  });

  await waitForLine(lines, (line) => line.type === "application.event");
  const ready = await waitForLine(lines, (line) => line.type === "application.ready") as {
    view?: { tools?: { mounted?: number; total?: number } };
  };
  assert.equal(ready.view?.tools?.mounted, 176);
  assert.equal(ready.view?.tools?.total, 176);

  input.write(`${JSON.stringify({
    type: "application.command",
    commandId: "test-turn",
    command: {
      type: "application.submitTurn",
      mode: "dry-run",
      input: {
        type: "application.input",
        text: "dry-run protocol test",
      },
    },
  })}\n`);

  const resultLine = await waitForLine(
    lines,
    (line) => line.type === "application.commandResult" && line.commandId === "test-turn",
  ) as { result?: { ok?: boolean } };
  assert.equal(resultLine.result?.ok, true);

  input.write(`${JSON.stringify({
    type: "application.command",
    commandId: "close",
    command: { type: "application.close" },
  })}\n`);
  input.end();
  await done;
});
