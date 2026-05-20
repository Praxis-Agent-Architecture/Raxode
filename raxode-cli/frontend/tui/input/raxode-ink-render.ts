import process from "node:process";
import { Stream } from "node:stream";

import type { ReactNode } from "react";
import { render, type Instance, type RenderOptions } from "../runtime/ink/index.js";

function getOptions(stdout: NodeJS.WriteStream | RenderOptions = {}): RenderOptions {
  if (stdout instanceof Stream) {
    return {
      stdout,
      stdin: process.stdin,
    };
  }
  return stdout;
}

function resolveRenderFps(): number {
  const value = Number.parseFloat(process.env.RAXODE_RENDER_FPS ?? "120");
  return Number.isFinite(value) && value > 0 ? value : 120;
}

export function renderRaxodeInk(
  node: ReactNode,
  options?: NodeJS.WriteStream | RenderOptions,
): Instance {
  return render(node, {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    debug: false,
    exitOnCtrlC: true,
    patchConsole: true,
    maxFps: resolveRenderFps(),
    incrementalRendering: true,
    ...getOptions(options),
  });
}
