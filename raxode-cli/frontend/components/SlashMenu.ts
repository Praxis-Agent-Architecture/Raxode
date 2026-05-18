import { Box, Text } from "ink";
import React from "react";

import type { RaxodeSlashCommand } from "../state/slashCommands.js";
import { RAXODE_TUI_THEME } from "./theme.js";

const h = React.createElement;

export function renderSlashCommandLine(command: RaxodeSlashCommand, index: number): string {
  return `${String(index + 1).padStart(2, "0")} ${command.command.padEnd(14)} ${command.description}`;
}

export function RaxodeSlashMenu(props: {
  commands: readonly RaxodeSlashCommand[];
  activeCommand?: string;
}): React.ReactElement {
  return h(
    Box,
    { flexDirection: "column" },
    ...props.commands.map((command, index) => {
      const active = props.activeCommand === command.command;
      return h(
        Text,
        { key: command.id },
        h(Text, { color: active ? RAXODE_TUI_THEME.accent : RAXODE_TUI_THEME.muted }, String(index + 1).padStart(2, "0")),
        h(Text, null, " "),
        h(Text, { color: active ? RAXODE_TUI_THEME.accent : RAXODE_TUI_THEME.text, bold: active || index === 0 },
          command.command.padEnd(14),
        ),
        h(Text, { color: index === 0 ? RAXODE_TUI_THEME.accent : RAXODE_TUI_THEME.muted }, command.description),
      );
    }),
  );
}
