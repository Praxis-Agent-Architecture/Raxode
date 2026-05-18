/*
 * 文件定位：raxode-cli / frontend bridge。
 * 核心目的：让 TUI 只依赖 application contract，不直接接触 Raxode backend 实现或 agentCore。
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  PraxisApplicationCommandResult,
  PraxisApplicationEvent,
  PraxisApplicationProtocolMessage,
} from "@praxis-ai/praxis/application-layer";
import type {
  RaxodeApplicationCommand,
  RaxodeApplicationViewModel,
} from "../../contracts.js";

export type RaxodeApplicationClient = {
  ready: Promise<RaxodeApplicationViewModel>;
  getView(): Promise<RaxodeApplicationViewModel>;
  dispatch(command: RaxodeApplicationCommand): Promise<PraxisApplicationCommandResult>;
  subscribe(listener: (event: PraxisApplicationEvent) => void): () => void;
  close(): Promise<void>;
};

type PendingCommand = {
  resolve: (result: PraxisApplicationCommandResult) => void;
  reject: (error: Error) => void;
};

function backendServerEntrypoint(): { path: string; needsTsx: boolean } {
  const sourcePath = fileURLToPath(new URL("../../backend/application/stdioApplicationServer.ts", import.meta.url));
  if (existsSync(sourcePath)) {
    return { path: sourcePath, needsTsx: true };
  }
  return {
    path: fileURLToPath(new URL("../../backend/application/stdioApplicationServer.js", import.meta.url)),
    needsTsx: false,
  };
}

function parseProtocolLine(line: string): PraxisApplicationProtocolMessage | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as PraxisApplicationProtocolMessage;
}

export function createProcessApplicationClient(options: {
  cwd?: string;
  command?: string;
  args?: readonly string[];
  restartOnExit?: boolean;
} = {}): RaxodeApplicationClient {
  if (options.restartOnExit === false) {
    return wrapApplicationProcess(spawnApplicationBackend(options));
  }
  return createRestartingProcessApplicationClient(options);
}

function spawnApplicationBackend(options: {
  cwd?: string;
  command?: string;
  args?: readonly string[];
} = {}): ChildProcessWithoutNullStreams {
  const backendEntrypoint = backendServerEntrypoint();
  return spawn(
    options.command ?? process.execPath,
    options.args ?? (backendEntrypoint.needsTsx
      ? ["--import", "tsx", backendEntrypoint.path]
      : [backendEntrypoint.path]),
    {
      cwd: options.cwd ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function createRestartingProcessApplicationClient(options: {
  cwd?: string;
  command?: string;
  args?: readonly string[];
} = {}): RaxodeApplicationClient {
  const listeners = new Set<(event: PraxisApplicationEvent) => void>();
  let current = wrapApplicationProcess(spawnApplicationBackend(options));
  let closing = false;
  let latestView: RaxodeApplicationViewModel | undefined;
  let readyResolve!: (view: RaxodeApplicationViewModel) => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<RaxodeApplicationViewModel>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  function attach(client: RaxodeApplicationClient): void {
    void client.ready
      .then(async (view) => {
        latestView = view;
        readyResolve(view);
        if (latestView?.sessionId) {
          try {
            const result = await client.dispatch({ type: "application.resume", sessionId: latestView.sessionId });
            latestView = result.view;
          } catch {
            // Recovery is best-effort; the next user command will still run.
          }
        }
      })
      .catch((error: unknown) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (latestView) return;
        readyReject(normalized);
      });
    client.subscribe((event) => {
      for (const listener of listeners) listener(event);
    });
  }

  attach(current);

  async function withRestart<T>(operation: (client: RaxodeApplicationClient) => Promise<T>): Promise<T> {
    try {
      return await operation(current);
    } catch (error) {
      if (closing) throw error;
      current = wrapApplicationProcess(spawnApplicationBackend(options));
      attach(current);
      await current.ready;
      if (latestView?.sessionId) {
        try {
          const result = await current.dispatch({ type: "application.resume", sessionId: latestView.sessionId });
          latestView = result.view;
        } catch {
          // Recovery is best-effort.
        }
      }
      return await operation(current);
    }
  }

  return {
    ready,
    async getView() {
      if (latestView) return latestView;
      return await current.getView();
    },
    async dispatch(command) {
      const result = await withRestart((client) => client.dispatch(command));
      latestView = result.view;
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      closing = true;
      await current.close();
    },
  };
}

export function wrapApplicationProcess(child: ChildProcessWithoutNullStreams): RaxodeApplicationClient {
  const pending = new Map<string, PendingCommand>();
  const listeners = new Set<(event: PraxisApplicationEvent) => void>();
  let latestView: RaxodeApplicationViewModel | undefined;
  let stdoutRemainder = "";
  let readyResolve!: (view: RaxodeApplicationViewModel) => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<RaxodeApplicationViewModel>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  function rejectPending(error: Error): void {
    for (const [, entry] of pending) entry.reject(error);
    pending.clear();
  }

  function handleMessage(message: PraxisApplicationProtocolMessage): void {
    if (message.type === "application.ready") {
      latestView = message.view;
      readyResolve(message.view);
      return;
    }
    if (message.type === "application.view") {
      latestView = message.view;
      return;
    }
    if (message.type === "application.event") {
      for (const listener of listeners) listener(message.event);
      return;
    }
    if (message.type === "application.commandResult") {
      latestView = message.result.view;
      const waiting = pending.get(message.commandId);
      if (waiting) {
        pending.delete(message.commandId);
        waiting.resolve(message.result);
      }
      return;
    }
    if (message.type === "application.error") {
      if (message.view) latestView = message.view;
      const waiting = message.commandId ? pending.get(message.commandId) : undefined;
      const error = new Error(message.error.message);
      if (waiting && message.commandId) {
        pending.delete(message.commandId);
        waiting.reject(error);
      }
    }
  }

  child.stdout.on("data", (chunk: Buffer | string) => {
    const combined = stdoutRemainder + (typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    const lines = combined.split(/\r?\n/u);
    stdoutRemainder = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const message = parseProtocolLine(line);
        if (message) handleMessage(message);
      } catch {
        // Ignore non-protocol stdout. The backend contract should not emit it,
        // but this keeps the frontend resilient during development.
      }
    }
  });

  child.once("error", (error) => {
    readyReject(error);
    rejectPending(error);
  });
  child.once("close", (code, signal) => {
    const error = new Error(`application backend closed code=${code ?? "null"} signal=${signal ?? "null"}`);
    readyReject(error);
    rejectPending(error);
  });

  return {
    ready,
    async getView() {
      if (latestView) return latestView;
      return await ready;
    },
    async dispatch(command) {
      await ready;
      if (child.exitCode !== null || child.signalCode !== null || child.killed || child.stdin.destroyed || child.stdin.writableEnded) {
        throw new Error("application backend process is not writable");
      }
      const commandId = randomUUID();
      const payload = JSON.stringify({
        type: "application.command",
        commandId,
        command,
      });
      const result = new Promise<PraxisApplicationCommandResult>((resolve, reject) => {
        pending.set(commandId, { resolve, reject });
      });
      const written = child.stdin.write(`${payload}\n`, (error: Error | null | undefined) => {
        if (error) {
          pending.delete(commandId);
          rejectPending(error);
        }
      });
      if (!written && (child.stdin.destroyed || child.stdin.writableEnded)) {
        pending.delete(commandId);
        throw new Error("application backend stdin rejected command");
      }
      return await result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      if (!child.killed) {
        try {
          const commandId = randomUUID();
          child.stdin.write(`${JSON.stringify({
            type: "application.command",
            commandId,
            command: { type: "application.close" },
          })}\n`);
        } catch {
          // ignore shutdown races
        }
        child.kill("SIGTERM");
      }
    },
  };
}
