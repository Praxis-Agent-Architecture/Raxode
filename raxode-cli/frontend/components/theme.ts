export type RaxodeTuiColor =
  | "black"
  | "blackBright"
  | "gray"
  | "white"
  | "whiteBright"
  | "cyan"
  | "cyanBright"
  | "green"
  | "greenBright"
  | "yellow"
  | "yellowBright"
  | "red"
  | "redBright"
  | "magenta"
  | "magentaBright";

export const RAXODE_TUI_THEME = {
  text: "whiteBright" as RaxodeTuiColor,
  muted: "gray" as RaxodeTuiColor,
  accent: "magentaBright" as RaxodeTuiColor,
  cyan: "cyanBright" as RaxodeTuiColor,
  success: "greenBright" as RaxodeTuiColor,
  warning: "yellowBright" as RaxodeTuiColor,
  danger: "redBright" as RaxodeTuiColor,
  line: "gray" as RaxodeTuiColor,
  border: "gray" as RaxodeTuiColor,
};

export function compactTuiText(value: string, maxLength = 96): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function shortenHomePath(value: string, home = process.env.HOME): string {
  if (!home) return value;
  return value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

export function terminalRule(width = process.stdout.columns ?? 80): string {
  return "─".repeat(Math.max(32, Math.min(width, 120)));
}
