import stringWidth from "string-width";

export type TextSelectionScope = "transcript" | "composer";

export interface TextSelectionPoint {
  row: number;
  column: number;
}

export interface TextSelectionState {
  active: boolean;
  scope: TextSelectionScope;
  anchor: TextSelectionPoint;
  focus: TextSelectionPoint | null;
}

export interface TextSelectionBounds {
  scope: TextSelectionScope;
  start: TextSelectionPoint;
  end: TextSelectionPoint;
}

export interface SelectionColumnRange {
  startColumn: number;
  endColumnExclusive: number;
}

export interface SelectableRegion {
  scope: TextSelectionScope;
  topRow: number;
  rowCount: number;
  leftColumn: number | ((localRow: number) => number);
}

const graphemeSegmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
const ESC = "\u001B";
const BEL = "\u0007";

function splitGraphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}

function comparePoints(left: TextSelectionPoint, right: TextSelectionPoint): number {
  if (left.row !== right.row) {
    return left.row < right.row ? -1 : 1;
  }
  if (left.column === right.column) {
    return 0;
  }
  return left.column < right.column ? -1 : 1;
}

export function startTextSelection(scope: TextSelectionScope, point: TextSelectionPoint): TextSelectionState {
  return {
    active: true,
    scope,
    anchor: {
      row: Math.max(0, point.row),
      column: Math.max(0, point.column),
    },
    focus: null,
  };
}

export function updateTextSelection(
  selection: TextSelectionState,
  scope: TextSelectionScope,
  point: TextSelectionPoint,
): TextSelectionState {
  if (selection.scope !== scope) {
    return selection;
  }
  const nextPoint = {
    row: Math.max(0, point.row),
    column: Math.max(0, point.column),
  };
  if (
    !selection.focus
    && selection.anchor.row === nextPoint.row
    && selection.anchor.column === nextPoint.column
  ) {
    return selection;
  }
  return {
    ...selection,
    focus: nextPoint,
  };
}

export function finishTextSelection(selection: TextSelectionState): TextSelectionState {
  return {
    ...selection,
    active: false,
  };
}

export function normalizeTextSelectionBounds(selection: TextSelectionState | null): TextSelectionBounds | null {
  if (!selection?.focus) {
    return null;
  }
  const { anchor, focus } = selection;
  return comparePoints(anchor, focus) <= 0
    ? { scope: selection.scope, start: anchor, end: focus }
    : { scope: selection.scope, start: focus, end: anchor };
}

export function getSelectionColumnsForRow(
  selection: TextSelectionState | null,
  row: number,
  lineWidth: number,
): SelectionColumnRange | null {
  const bounds = normalizeTextSelectionBounds(selection);
  if (!bounds || row < bounds.start.row || row > bounds.end.row) {
    return null;
  }
  const safeWidth = Math.max(0, lineWidth);
  if (bounds.start.row === bounds.end.row) {
    return {
      startColumn: Math.min(bounds.start.column, safeWidth),
      endColumnExclusive: Math.min(bounds.end.column + 1, safeWidth),
    };
  }
  if (row === bounds.start.row) {
    return {
      startColumn: Math.min(bounds.start.column, safeWidth),
      endColumnExclusive: safeWidth,
    };
  }
  if (row === bounds.end.row) {
    return {
      startColumn: 0,
      endColumnExclusive: Math.min(bounds.end.column + 1, safeWidth),
    };
  }
  return {
    startColumn: 0,
    endColumnExclusive: safeWidth,
  };
}

function pushSelectionPiece(
  pieces: Array<{ text: string; selected: boolean }>,
  text: string,
  selected: boolean,
): void {
  if (!text) {
    return;
  }
  const previous = pieces[pieces.length - 1];
  if (previous && previous.selected === selected) {
    previous.text += text;
    return;
  }
  pieces.push({ text, selected });
}

export function splitTextBySelectionColumns(
  text: string,
  range: SelectionColumnRange,
  startColumn = 0,
): Array<{ text: string; selected: boolean }> {
  const pieces: Array<{ text: string; selected: boolean }> = [];
  let cursor = startColumn;
  for (const grapheme of splitGraphemes(text)) {
    const width = Math.max(1, stringWidth(grapheme));
    const next = cursor + width;
    const selected = next > range.startColumn && cursor < range.endColumnExclusive;
    pushSelectionPiece(pieces, grapheme, selected);
    cursor = next;
  }
  return pieces.length > 0 ? pieces : [{ text, selected: false }];
}

export function extractSelectedText(lines: readonly string[], selection: TextSelectionState | null): string {
  const bounds = normalizeTextSelectionBounds(selection);
  if (!bounds) {
    return "";
  }
  const output: string[] = [];
  for (let row = bounds.start.row; row <= bounds.end.row; row += 1) {
    const line = lines[row] ?? "";
    const range = getSelectionColumnsForRow(selection, row, Math.max(1, stringWidth(line)));
    if (!range) {
      continue;
    }
    output.push(
      splitTextBySelectionColumns(line, range)
        .filter((piece) => piece.selected)
        .map((piece) => piece.text)
        .join(""),
    );
  }
  return output.join("\n");
}

export function resolveSelectablePoint(
  event: { x: number; y: number },
  regions: readonly SelectableRegion[],
): { scope: TextSelectionScope; point: TextSelectionPoint } | null {
  for (const region of regions) {
    if (event.y < region.topRow || event.y >= region.topRow + region.rowCount) {
      continue;
    }
    const localRow = event.y - region.topRow;
    const leftColumn = typeof region.leftColumn === "function"
      ? region.leftColumn(localRow)
      : region.leftColumn;
    if (event.x < leftColumn) {
      continue;
    }
    return {
      scope: region.scope,
      point: {
        row: localRow,
        column: event.x - leftColumn,
      },
    };
  }
  return null;
}

export function resolveSelectionAutoScrollDelta(input: {
  active: boolean;
  scope: TextSelectionScope;
  pointerRow: number;
  viewportRowCount: number;
  scrollOffset: number;
  maxScrollOffset: number;
  edgeMargin?: number;
  step?: number;
}): number {
  if (!input.active || input.scope !== "transcript" || input.viewportRowCount <= 0) {
    return 0;
  }
  const edgeMargin = input.edgeMargin ?? 2;
  const step = input.step ?? 3;
  if (input.pointerRow <= edgeMargin && input.scrollOffset < input.maxScrollOffset) {
    return step;
  }
  if (input.pointerRow >= input.viewportRowCount - edgeMargin + 1 && input.scrollOffset > 0) {
    return -step;
  }
  return 0;
}

export function resolveTranscriptSelectionPointFromViewport(input: {
  eventX: number;
  eventY: number;
  contentLeftColumn: number;
  transcriptLineCount: number;
  transcriptViewportLineCount: number;
  scrollOffset: number;
}): TextSelectionPoint {
  const viewportLineCount = Math.max(1, input.transcriptViewportLineCount);
  const pointerRow = Math.max(1, Math.min(input.eventY, viewportLineCount));
  const visibleStart = Math.max(
    0,
    input.transcriptLineCount <= viewportLineCount
      ? 0
      : input.transcriptLineCount - viewportLineCount - Math.max(0, input.scrollOffset),
  );
  return {
    row: visibleStart + pointerRow - 1,
    column: Math.max(0, input.eventX - input.contentLeftColumn),
  };
}

export function wrapTerminalPassthroughSequence(
  sequence: string,
  env: Partial<Pick<NodeJS.ProcessEnv, "TMUX" | "STY">> = process.env,
): string {
  if (env.TMUX) {
    return `${ESC}Ptmux;${sequence.replaceAll(ESC, ESC + ESC)}${ESC}\\`;
  }
  if (env.STY) {
    return `${ESC}P${sequence}${ESC}\\`;
  }
  return sequence;
}

export function formatOsc52ClipboardSequence(
  text: string,
  env: Partial<Pick<NodeJS.ProcessEnv, "TMUX" | "STY">> = process.env,
): string {
  const sequence = `${ESC}]52;c;${Buffer.from(text, "utf8").toString("base64")}${BEL}`;
  return wrapTerminalPassthroughSequence(sequence, env);
}

export interface NativeClipboardCommand {
  command: string;
  args: string[];
}

function normalizeTerminalKeySequence(inputText: string): string {
  return inputText.startsWith(ESC) ? inputText.slice(1) : inputText;
}

export function isTerminalTextSelectionCopySequence(inputText: string): boolean {
  const normalized = normalizeTerminalKeySequence(inputText);
  return normalized === "[99;6u"
    || normalized === "[99;5u"
    || normalized === "[67;6u"
    || normalized === "[67;5u";
}

export function isTextSelectionCopyInput(
  inputText: string,
  key: { ctrl?: boolean },
): boolean {
  return isTerminalTextSelectionCopySequence(inputText)
    || inputText === "\u0003"
    || Boolean(key.ctrl && (inputText === "c" || inputText === "C"));
}

export function resolveNativeClipboardCommands(input: {
  platform?: NodeJS.Platform;
  env?: Partial<Pick<NodeJS.ProcessEnv, "SSH_CONNECTION">>;
} = {}): NativeClipboardCommand[] {
  if (input.env?.SSH_CONNECTION ?? process.env.SSH_CONNECTION) {
    return [];
  }
  const platform = input.platform ?? process.platform;
  if (platform === "darwin") {
    return [{ command: "pbcopy", args: [] }];
  }
  if (platform === "linux") {
    return [
      { command: "wl-copy", args: [] },
      { command: "xclip", args: ["-selection", "clipboard"] },
      { command: "xsel", args: ["--clipboard", "--input"] },
    ];
  }
  if (platform === "win32") {
    return [{ command: "clip", args: [] }];
  }
  return [];
}

export function resolveTextSelectionClipboardCommands(input: {
  platform?: NodeJS.Platform;
  env?: Partial<Pick<NodeJS.ProcessEnv, "LC_TERMINAL" | "SSH_CONNECTION" | "TMUX">>;
} = {}): NativeClipboardCommand[] {
  const commands: NativeClipboardCommand[] = [];
  const env = input.env ?? process.env;
  if (env.TMUX) {
    commands.push({
      command: "tmux",
      args: env.LC_TERMINAL === "iTerm2" ? ["load-buffer", "-"] : ["load-buffer", "-w", "-"],
    });
  }
  commands.push(...resolveNativeClipboardCommands({
    platform: input.platform,
    env: { SSH_CONNECTION: env.SSH_CONNECTION },
  }));
  return commands;
}
