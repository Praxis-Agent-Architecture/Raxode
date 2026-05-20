import { createRequire } from "node:module";
import process from "node:process";
import { Stream } from "node:stream";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { ReactNode } from "react";
import type { Instance, RenderOptions } from "ink";

const require = createRequire(import.meta.url);
const inkEntryPath = require.resolve("ink");
const inkBuildDir = dirname(inkEntryPath);
const { default: Ink } = await import(pathToFileURL(join(inkBuildDir, "ink.js")).href);
const { default: instances } = await import(pathToFileURL(join(inkBuildDir, "instances.js")).href);

type InkInternal = {
  render(node: ReactNode): void;
  unmount(error?: Error | number | null): void;
  waitUntilExit(): Promise<void>;
  clear(): void;
  onRender(): void;
  rootNode?: {
    onRender?: () => void;
    onImmediateRender?: () => void;
  };
};

function resolveTargetFrameIntervalMs(): number {
  const raw = Number.parseFloat(process.env.RAXODE_RENDER_FPS ?? "120");
  const fps = Number.isFinite(raw) && raw > 0 ? raw : 120;
  return Math.max(1, 1000 / fps);
}

function createFrameThrottle(callback: () => void, intervalMs: number): () => void {
  let lastRunAt = 0;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    lastRunAt = performance.now();
    trailingTimer = null;
    callback();
  };

  return () => {
    const now = performance.now();
    const elapsed = now - lastRunAt;
    if (elapsed >= intervalMs) {
      if (trailingTimer) {
        clearTimeout(trailingTimer);
        trailingTimer = null;
      }
      run();
      return;
    }
    if (!trailingTimer) {
      trailingTimer = setTimeout(run, Math.max(1, intervalMs - elapsed));
    }
  };
}

function getOptions(stdout: NodeJS.WriteStream | RenderOptions = {}): RenderOptions {
  if (stdout instanceof Stream) {
    return {
      stdout,
      stdin: process.stdin,
    };
  }
  return stdout;
}

function createFastInkInstance(options: Required<Omit<RenderOptions, "stdout" | "stdin" | "stderr">> & {
  stdout: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stderr: NodeJS.WriteStream;
}): InkInternal {
  const ink = new Ink(options) as InkInternal;
  if (!options.debug && ink.rootNode) {
    const throttledRender = createFrameThrottle(ink.onRender.bind(ink), resolveTargetFrameIntervalMs());
    ink.rootNode.onRender = throttledRender;
    ink.rootNode.onImmediateRender = ink.onRender.bind(ink);
  }
  return ink;
}

export function renderFastInk(
  node: ReactNode,
  options?: NodeJS.WriteStream | RenderOptions,
): Instance {
  const inkOptions = {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    debug: false,
    exitOnCtrlC: true,
    patchConsole: true,
    ...getOptions(options),
  };

  let instance = instances.get(inkOptions.stdout) as InkInternal | undefined;
  if (!instance) {
    instance = createFastInkInstance(inkOptions);
    instances.set(inkOptions.stdout, instance);
  }

  instance.render(node);
  return {
    rerender: instance.render.bind(instance),
    unmount: () => {
      instance?.unmount();
    },
    waitUntilExit: instance.waitUntilExit.bind(instance),
    cleanup: () => instances.delete(inkOptions.stdout),
    clear: instance.clear.bind(instance),
  };
}
