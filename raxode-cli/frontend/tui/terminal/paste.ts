export const ENABLE_TERMINAL_BRACKETED_PASTE = "\u001B[?2004h";
export const DISABLE_TERMINAL_BRACKETED_PASTE = "\u001B[?2004l";

const ESC = "\u001B";
const BRACKETED_PASTE_START = "[200~";
const BRACKETED_PASTE_END = "[201~";

function normalizeTerminalKeySequence(inputText: string): string {
  return inputText.startsWith(ESC) ? inputText.slice(1) : inputText;
}

export function isTerminalPasteShortcutInput(inputText: string, key: { ctrl?: boolean }): boolean {
  const normalized = normalizeTerminalKeySequence(inputText);
  return inputText === "\u0016"
    || Boolean(key.ctrl && (inputText === "v" || inputText === "V"))
    || normalized === "[118;6u"
    || normalized === "[118;5u"
    || normalized === "[86;6u"
    || normalized === "[86;5u";
}

export function enableTerminalBracketedPaste(output: {
  isTTY?: boolean;
  write(chunk: string | Uint8Array): unknown;
} = process.stdout): () => void {
  if (!output.isTTY) {
    return () => {};
  }
  output.write(ENABLE_TERMINAL_BRACKETED_PASTE);
  return () => {
    output.write(DISABLE_TERMINAL_BRACKETED_PASTE);
  };
}

export function consumeBracketedPasteInput(inputText: string, state: { active: boolean }): {
  handled: boolean;
  text: string;
} {
  if (!inputText) {
    return { handled: false, text: "" };
  }
  let handled = false;
  let text = "";
  let index = 0;
  while (index < inputText.length) {
    const startIndex = inputText.indexOf(BRACKETED_PASTE_START, index);
    const endIndex = inputText.indexOf(BRACKETED_PASTE_END, index);
    if (!state.active) {
      if (startIndex === -1) {
        break;
      }
      handled = true;
      index = startIndex + BRACKETED_PASTE_START.length;
      state.active = true;
      continue;
    }
    handled = true;
    const nextEndIndex = endIndex === -1
      ? inputText.length
      : (inputText[endIndex - 1] === ESC ? endIndex - 1 : endIndex);
    text += inputText.slice(index, nextEndIndex);
    if (endIndex === -1) {
      index = inputText.length;
    } else {
      index = endIndex + BRACKETED_PASTE_END.length;
      state.active = false;
    }
  }
  return { handled, text };
}
