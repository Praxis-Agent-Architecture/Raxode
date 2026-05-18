/*
 * 文件定位：raxode-cli / CLI 装配入口。
 * 核心目的：把 Raxode TUI/CLI 接到 framework applicationLayer 后端。
 */

import { pathToFileURL } from "node:url";

import {
  createRaxodeBackend,
  createRaxodeBackendRestServer,
  createRaxodeBackendWebSocketServer,
} from "./backend/raxodeBackend.js";
import type {
  RaxodeApplicationPermissionProfile,
  RaxodeApplicationReasoningEffort,
} from "./contracts.js";
import { createProcessApplicationClient } from "./frontend/bridge/applicationClient.js";
import { renderRaxodeApplicationTui, renderRaxodeInteractiveTui } from "./frontend/tuiShell.js";

export { createRaxodeBackend } from "./backend/raxodeBackend.js";
export type {
  RaxodeApplicationBackendResult,
  RaxodeApplicationCommand,
  RaxodeApplicationEvent,
  RaxodeApplicationPermissionProfile,
  RaxodeApplicationReasoningEffort,
  RaxodeApplicationRunMode,
  RaxodeApplicationStatus,
  RaxodeApplicationViewModel,
} from "./contracts.js";
export { RaxodeApplicationTui, renderRaxodeApplicationTui, renderRaxodeInteractiveTui } from "./frontend/tuiShell.js";

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function flagValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

export function canStartInteractiveRaxodeTui(input: Pick<NodeJS.ReadStream, "isTTY"> = process.stdin): boolean {
  return input.isTTY === true;
}

export async function runRaxodeCli(argv = process.argv.slice(2)): Promise<number> {
  if (hasFlag(argv, "--help")) {
    process.stdout.write("Usage: raxode-cli [task...] [--json] [--live] [--process] [--model MODEL] [--reasoning EFFORT] [--permission PROFILE] [--serve-rest|--serve-ws] [--host HOST] [--port PORT]\n");
    return 0;
  }

  const host = flagValue(argv, "--host");
  const portText = flagValue(argv, "--port");
  const port = portText ? Number(portText) : undefined;
  const model = flagValue(argv, "--model");
  const reasoningEffort = flagValue(argv, "--reasoning") as RaxodeApplicationReasoningEffort | undefined;
  const permissionProfile = flagValue(argv, "--permission") as RaxodeApplicationPermissionProfile | undefined;
  if (hasFlag(argv, "--serve-rest")) {
    const server = await createRaxodeBackendRestServer({ host, port });
    process.stdout.write(`${JSON.stringify({ transport: server.descriptor, url: server.url })}\n`);
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
    await server.close();
    return 0;
  }
  if (hasFlag(argv, "--serve-ws")) {
    const server = await createRaxodeBackendWebSocketServer({ host, port });
    process.stdout.write(`${JSON.stringify({ transport: server.descriptor, url: server.url })}\n`);
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
    await server.close();
    return 0;
  }

  const task = argv
    .filter((value, index) =>
      !value.startsWith("--")
      && argv[index - 1] !== "--host"
      && argv[index - 1] !== "--port"
      && argv[index - 1] !== "--model"
      && argv[index - 1] !== "--reasoning"
      && argv[index - 1] !== "--permission")
    .join(" ")
    .trim();
  if (!hasFlag(argv, "--json") && task.length === 0) {
    if (!canStartInteractiveRaxodeTui()) {
      process.stderr.write("Raxode TUI requires an interactive TTY. Use `npm run raxode:tui` from a real terminal, or pass a task with `--json`/`--process` for non-interactive execution.\n");
      return 2;
    }
    const instance = renderRaxodeInteractiveTui();
    await instance.waitUntilExit();
    return 0;
  }
  const mode = hasFlag(argv, "--live") ? "live" : "dry-run";
  const result = hasFlag(argv, "--process")
      ? await (async () => {
        const client = createProcessApplicationClient();
        const ready = await client.ready;
        if (model || reasoningEffort) {
          await client.dispatch({
            type: "application.changeModel",
            model: model ?? ready.model.model,
            reasoningEffort: reasoningEffort ?? ready.model.reasoningEffort,
          });
        }
        if (permissionProfile) {
          await client.dispatch({
            type: "application.changePermissionProfile",
            profile: permissionProfile,
          });
        }
        const output = await client.dispatch({
          type: "application.submitTurn",
          mode,
          input: {
            type: "application.input",
            text: task || "Describe the Raxode application backend readiness.",
            cwd: process.cwd(),
          },
        });
        await client.close();
        return output;
      })()
    : await (async () => {
        const backend = await createRaxodeBackend();
        return await backend.run({ task, mode, model, reasoningEffort, permissionProfile });
      })();
  if (hasFlag(argv, "--json")) {
    process.stdout.write(`${JSON.stringify(result.view, null, 2)}\n`);
  } else {
    renderRaxodeApplicationTui(result.view);
  }
  return result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runRaxodeCli();
}
