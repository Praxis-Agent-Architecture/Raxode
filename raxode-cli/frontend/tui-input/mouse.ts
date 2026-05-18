/*
 * 文件定位：raxode-cli / frontend terminal mouse input helpers。
 * 核心目的：迁移 legacy TUI 的 SGR 鼠标解析，供新前端 panels/list 复用。
 */

export type RaxodeTerminalMouseEvent =
  | {
      kind: "scroll";
      delta: number;
      x: number;
      y: number;
      rawCode: number;
    }
  | {
      kind: "click";
      button: "left" | "middle" | "right";
      pressed: boolean;
      x: number;
      y: number;
      rawCode: number;
    }
  | {
      kind: "drag";
      button: "left" | "middle" | "right";
      x: number;
      y: number;
      rawCode: number;
    };

const sgrMousePattern = /(?:\u001B)?\[?<(\d+);(\d+);(\d+)([mM])/gu;
const singleSgrMousePattern = /^(?:\u001B)?\[?<\d+;\d+;\d+[mM]$/u;
export const ENABLE_TERMINAL_MOUSE_CAPTURE = "\u001B[?1000h\u001B[?1006h";
export const DISABLE_TERMINAL_MOUSE_CAPTURE = "\u001B[?1000l\u001B[?1006l";
export const ENABLE_TERMINAL_MOUSE_SELECTION_CAPTURE = "\u001B[?1000h\u001B[?1002h\u001B[?1006h";
export const DISABLE_TERMINAL_MOUSE_SELECTION_CAPTURE = "\u001B[?1006l\u001B[?1002l\u001B[?1000l";
export const ENABLE_TERMINAL_ALTERNATE_SCROLL = "\u001B[?1049h\u001B[?1007h";
export const DISABLE_TERMINAL_ALTERNATE_SCROLL = "\u001B[?1007l\u001B[?1049l";
export const ENABLE_TERMINAL_MOUSE_REPORTING = ENABLE_TERMINAL_MOUSE_CAPTURE;
export const DISABLE_TERMINAL_MOUSE_REPORTING = DISABLE_TERMINAL_MOUSE_CAPTURE;

export type TerminalMouseReportingMode = "off" | "capture" | "managed-selection" | "alternate-scroll";

type TerminalMouseReportingOptions = {
  defaultEnabled?: boolean;
  defaultMode?: Exclude<TerminalMouseReportingMode, "off">;
};

function normalizeMouseReportingEnv(value: string | undefined): TerminalMouseReportingMode | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "capture"].includes(normalized)) return "capture";
  if (["drag", "drag-capture", "managed-selection", "transcript-selection"].includes(normalized)) return "managed-selection";
  if (["wheel", "scroll", "alternate", "alternate-scroll", "selection"].includes(normalized)) return "alternate-scroll";
  if (["0", "false", "no", "off", "none"].includes(normalized)) return "off";
  return undefined;
}

export function resolveTerminalMouseReportingMode(
  env: NodeJS.ProcessEnv = process.env,
  options: TerminalMouseReportingOptions = {},
): TerminalMouseReportingMode {
  return normalizeMouseReportingEnv(env.RAXODE_ENABLE_MOUSE)
    ?? (options.defaultEnabled ? options.defaultMode ?? "capture" : "off");
}

export function shouldEnableTerminalMouseReporting(
  env: NodeJS.ProcessEnv = process.env,
  options: TerminalMouseReportingOptions = {},
): boolean {
  return resolveTerminalMouseReportingMode(env, options) !== "off";
}

export function enableTerminalMouseReporting(
  output: Pick<NodeJS.WriteStream, "isTTY" | "write">,
  options: TerminalMouseReportingOptions = {},
): () => void {
  const mode = resolveTerminalMouseReportingMode(process.env, options);
  if (!output.isTTY || mode === "off") {
    return () => {};
  }
  const enableSequence = mode === "alternate-scroll"
    ? ENABLE_TERMINAL_ALTERNATE_SCROLL
    : mode === "managed-selection"
      ? ENABLE_TERMINAL_MOUSE_SELECTION_CAPTURE
      : ENABLE_TERMINAL_MOUSE_CAPTURE;
  const disableSequence = mode === "alternate-scroll"
    ? DISABLE_TERMINAL_ALTERNATE_SCROLL
    : mode === "managed-selection"
      ? DISABLE_TERMINAL_MOUSE_SELECTION_CAPTURE
      : DISABLE_TERMINAL_MOUSE_CAPTURE;
  output.write(enableSequence);
  return () => {
    output.write(disableSequence);
  };
}

function buttonForCode(code: number): "left" | "middle" | "right" | undefined {
  const buttonCode = code & 3;
  if (buttonCode === 0) return "left";
  if (buttonCode === 1) return "middle";
  if (buttonCode === 2) return "right";
  return undefined;
}

export function parseTerminalMouseEvents(inputText: string): readonly RaxodeTerminalMouseEvent[] {
  const events: RaxodeTerminalMouseEvent[] = [];
  for (const match of inputText.matchAll(sgrMousePattern)) {
    const code = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    const marker = match[4];
    if (!Number.isFinite(code) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const wheelCode = code & 0x43;
    if (wheelCode === 0x40 || wheelCode === 0x41) {
      events.push({
        kind: "scroll",
        delta: wheelCode === 0x40 ? 3 : -3,
        x,
        y,
        rawCode: code,
      });
      continue;
    }
    const button = buttonForCode(code) ?? (marker === "m" ? "left" : undefined);
    if (!button) continue;
    if ((code & 32) !== 0 && marker === "M") {
      events.push({
        kind: "drag",
        button,
        x,
        y,
        rawCode: code,
      });
      continue;
    }
    events.push({
      kind: "click",
      button,
      pressed: marker === "M",
      x,
      y,
      rawCode: code,
    });
  }
  return events;
}

export function parseMouseScrollDelta(inputText: string): number | null {
  let delta = 0;
  let found = false;
  for (const event of parseTerminalMouseEvents(inputText)) {
    if (event.kind !== "scroll") continue;
    found = true;
    delta += event.delta;
  }
  return found ? delta : null;
}

export function isTerminalMouseInput(inputText: string): boolean {
  return singleSgrMousePattern.test(inputText);
}
