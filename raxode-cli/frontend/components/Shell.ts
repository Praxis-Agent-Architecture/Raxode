import { Box, Text } from "ink";
import React from "react";

import type { RaxodeApplicationViewModel } from "../../contracts.js";
import { visibleRaxodeSlashCommands } from "../state/slashCommands.js";
import { RaxodeSlashMenu } from "./SlashMenu.js";
import { RaxodeStatusBar } from "./StatusBar.js";
import { RAXODE_TUI_THEME, compactTuiText, shortenHomePath } from "./theme.js";

const h = React.createElement;

const RAXODE_LOGO_LINES = [
  "██████╗  █████╗ ██╗  ██╗ ██████╗ ██████╗ ███████╗ powered by Praxis",
  "██╔══██╗██╔══██╗╚██╗██╔╝██╔═══██╗██╔══██╗██╔════╝",
  "██████╔╝███████║ ╚███╔╝ ██║   ██║██║  ██║█████╗",
  "██╔══██╗██╔══██║ ██╔██╗ ██║   ██║██║  ██║██╔══╝",
  "██║  ██║██║  ██║██╔╝ ██╗╚██████╔╝██████╔╝███████╗",
  "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝ v0.1.0",
] as const;

function toneForStatus(status: RaxodeApplicationViewModel["status"]): "greenBright" | "yellowBright" | "redBright" | "cyanBright" {
  if (status === "completed" || status === "ready") return "greenBright";
  if (status === "failed") return "redBright";
  if (status === "running") return "cyanBright";
  return "yellowBright";
}

function topMeta(view: RaxodeApplicationViewModel): string {
  return [
    view.projectId,
    view.permissionProfile,
    `${view.model.model}/${view.model.reasoningEffort}`,
    `${view.tools.mounted}/${view.tools.total} tools`,
  ].join(" · ");
}

function runtimeLines(view: RaxodeApplicationViewModel): readonly string[] {
  return [
    `agent   ${view.agentId}`,
    `runtime ${view.runtimeId}`,
    `session ${view.sessionId}`,
    `cwd     ${shortenHomePath(view.workspaceRoot)}`,
  ];
}

function counterLines(view: RaxodeApplicationViewModel): readonly string[] {
  return [
    `turns=${view.counters.turns} events=${view.counters.events} modelCalls=${view.counters.modelCalls} toolCalls=${view.counters.toolCalls}`,
    `steps=${view.counters.mainLoopSteps} mountedTools=${view.tools.mounted}`,
    `families=${Object.keys(view.tools.byFamily).sort().join(", ")}`,
  ];
}

function renderPanel(title: string, lines: readonly string[], color: string = RAXODE_TUI_THEME.border): React.ReactElement {
  return h(
    Box,
    { borderStyle: "single", borderColor: color, flexDirection: "column", paddingX: 1 },
    h(Text, { color, bold: true }, title),
    ...lines.map((line, index) => h(Text, { key: `${title}-${index}`, color: index === lines.length - 1 ? RAXODE_TUI_THEME.muted : undefined }, compactTuiText(line))),
  );
}

export function RaxodeShell(props: { view: RaxodeApplicationViewModel }): React.ReactElement {
  const { view } = props;
  const finalText = view.finalOutput ?? `${view.error?.code ?? "UNKNOWN"} ${view.error?.message ?? ""}`.trim();
  return h(
    Box,
    { flexDirection: "column", paddingX: 1 },
    h(
      Box,
      { flexDirection: "column" },
      ...RAXODE_LOGO_LINES.map((line, index) =>
        h(Text, { key: `logo-${index}`, color: index === 0 ? RAXODE_TUI_THEME.accent : RAXODE_TUI_THEME.text }, line),
      ),
    ),
    h(
      Box,
      { flexDirection: "column", paddingX: 1 },
      h(Box, { justifyContent: "space-between" },
        h(Text, { color: RAXODE_TUI_THEME.accent, bold: true }, "Raxode"),
        h(Text, { color: toneForStatus(view.status) }, view.status),
      ),
      h(Text, { color: RAXODE_TUI_THEME.muted }, topMeta(view)),
    ),
    h(
      Box,
      { marginTop: 1, gap: 1 },
      h(Box, { flexGrow: 1, flexDirection: "column" }, renderPanel("Runtime", runtimeLines(view), RAXODE_TUI_THEME.cyan)),
      h(Box, { flexGrow: 1, flexDirection: "column" }, renderPanel("Counters", counterLines(view), RAXODE_TUI_THEME.border)),
    ),
    h(
      Box,
      { marginTop: 1, flexDirection: "column", paddingX: 1 },
      h(RaxodeSlashMenu, { commands: visibleRaxodeSlashCommands() }),
    ),
    h(
      Box,
      { marginTop: 1, borderStyle: "single", borderColor: view.status === "failed" ? RAXODE_TUI_THEME.danger : RAXODE_TUI_THEME.success, flexDirection: "column", paddingX: 1 },
      h(Text, { color: view.status === "failed" ? RAXODE_TUI_THEME.danger : RAXODE_TUI_THEME.success, bold: true }, view.status === "failed" ? "Error" : "Final Output"),
      h(Text, null, compactTuiText(finalText, 140)),
    ),
    h(Box, { marginTop: 1 }, h(RaxodeStatusBar, { view })),
  );
}
