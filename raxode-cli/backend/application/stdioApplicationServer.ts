/*
 * 文件定位：raxode-cli/backend application stdio server。
 * 核心目的：把 Raxode applicationLayer runtime 暴露成 JSONL 长会话协议，供 TUI 进程使用。
 */

import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationCommand,
  type PraxisApplicationProtocolMessage,
} from "@praxis-ai/praxis/application-layer";
import { createRaxodeLiveProvider } from "../authentication/liveProvider.js";
import { raxodeApplication } from "./raxodeApplication.js";

type StdioServerOptions = {
  projectRoot?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  now?: () => string;
};

function defaultProjectRoot(): string {
  return new URL("..", import.meta.url).pathname;
}

function writeJsonLine(output: NodeJS.WritableStream, message: PraxisApplicationProtocolMessage): void {
  output.write(`${JSON.stringify(message)}\n`);
}

function parseCommandLine(line: string): { commandId: string; command: PraxisApplicationCommand } | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  if (parsed.type !== "application.command" || typeof parsed.commandId !== "string") {
    throw new Error("expected application.command envelope");
  }
  if (!parsed.command || typeof parsed.command !== "object" || Array.isArray(parsed.command)) {
    throw new Error("application.command envelope requires command object");
  }
  return {
    commandId: parsed.commandId,
    command: parsed.command as PraxisApplicationCommand,
  };
}

export async function startRaxodeStdioApplicationServer(options: StdioServerOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const created = await createApplicationProjectRuntime(options.projectRoot ?? defaultProjectRoot(), {
    applicationId: raxodeApplication.id,
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "standard",
    now: options.now,
    liveProviderResolver: async (manifest, context) => createRaxodeLiveProvider(manifest, {
      sessionId: context?.sessionId,
      runtimeId: context?.runtimeId,
      turnId: context?.turnId,
      onTextDelta: context?.onTextDelta,
      onProviderStreamEvent: context?.onProviderStreamEvent,
    }),
  });
  if (!created.ok) {
    writeJsonLine(output, {
      type: "application.error",
      error: created.error,
    });
    return;
  }

  const transport = createLocalApplicationTransport(created.runtime);
  transport.subscribe((event) => {
    writeJsonLine(output, {
      type: "application.event",
      event,
    });
  });
  const start = await transport.dispatch({
    type: "application.start",
    cwd: process.cwd(),
  });
  writeJsonLine(output, {
    type: "application.ready",
    view: start.view,
  });

  const reader = createInterface({
    input,
    terminal: false,
  });
  const pending = new Set<Promise<void>>();

  for await (const line of reader) {
    let parsed: { commandId: string; command: PraxisApplicationCommand } | undefined;
    try {
      parsed = parseCommandLine(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorOutput.write(`raxode application protocol error: ${message}\n`);
      writeJsonLine(output, {
        type: "application.error",
        commandId: "unknown",
        error: {
          code: "APPLICATION_PROTOCOL_ERROR",
          message,
        },
        view: await transport.getView(),
      });
      continue;
    }
    if (!parsed) continue;
    const task = (async () => {
      try {
        const result = await transport.dispatch(parsed.command);
        writeJsonLine(output, {
          type: "application.commandResult",
          commandId: parsed.commandId,
          result,
        });
        if (parsed.command.type === "application.close") {
          reader.close();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errorOutput.write(`raxode application protocol error: ${message}\n`);
        writeJsonLine(output, {
          type: "application.error",
          commandId: parsed.commandId,
          error: {
            code: "APPLICATION_PROTOCOL_ERROR",
            message,
          },
          view: await transport.getView(),
        });
      }
    })();
    pending.add(task);
    task.finally(() => pending.delete(task)).catch(() => undefined);
  }
  await Promise.allSettled([...pending]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await startRaxodeStdioApplicationServer({
    projectRoot: defaultProjectRoot(),
  });
}

export const raxodeStdioApplicationServerPath = fileURLToPath(import.meta.url);
