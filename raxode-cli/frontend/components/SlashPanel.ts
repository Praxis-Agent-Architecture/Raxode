import { Box, Text } from "ink";
import React from "react";

import type { RaxodeSlashPanel as RaxodeSlashPanelModel } from "../state/slashPanels.js";
import { RAXODE_TUI_THEME, compactTuiText } from "./theme.js";

const h = React.createElement;

export function RaxodeSlashPanel(props: {
  panel: RaxodeSlashPanelModel;
  scrollOffset?: number;
  selectedActionIndex?: number;
}): React.ReactElement {
  const scrollOffset = props.scrollOffset ?? 0;
  const rows = [
    ...props.panel.lines.map((line) => ({ line, selectable: false, actionIndex: -1 })),
    ...(props.panel.actions ?? []).map((action, actionIndex) => ({
      line: action.line,
      selectable: true,
      actionIndex,
    })),
  ];
  const visibleLines = rows.slice(scrollOffset, scrollOffset + 10);
  return h(
    Box,
    { borderStyle: "single", borderColor: RAXODE_TUI_THEME.accent, flexDirection: "column", paddingX: 1 },
    h(Text, { color: RAXODE_TUI_THEME.accent, bold: true }, props.panel.title),
    ...visibleLines.map((row, index) => {
      const selected = row.selectable && row.actionIndex === (props.selectedActionIndex ?? -1);
      return h(Text, {
        key: `${props.panel.id}-${scrollOffset + index}`,
        color: selected ? RAXODE_TUI_THEME.accent : index === 0 ? RAXODE_TUI_THEME.text : RAXODE_TUI_THEME.muted,
        inverse: selected,
      },
        compactTuiText(`${row.selectable ? "› " : ""}${row.line}`),
      );
    }),
  );
}
