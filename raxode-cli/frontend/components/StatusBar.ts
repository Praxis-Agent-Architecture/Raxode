import { Box, Text } from "ink";
import React from "react";

import type { RaxodeApplicationViewModel } from "../../contracts.js";
import { RAXODE_TUI_THEME, shortenHomePath, terminalRule } from "./theme.js";

const h = React.createElement;

function contextPercent(view: RaxodeApplicationViewModel): string {
  const eventLoad = Math.min(99, Math.max(0, view.counters.events));
  if (eventLoad === 0) return "<1%";
  return `${eventLoad}%`;
}

function contextBar(view: RaxodeApplicationViewModel): string {
  const percent = Math.min(10, Math.max(1, Math.ceil(view.counters.events / 10)));
  return `${"█".repeat(percent)}${"░".repeat(10 - percent)}`;
}

export function RaxodeStatusBar(props: { view: RaxodeApplicationViewModel }): React.ReactElement {
  const { view } = props;
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { color: RAXODE_TUI_THEME.line }, terminalRule()),
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, null,
        h(Text, { color: RAXODE_TUI_THEME.muted }, "WorkSpace: "),
        h(Text, { color: RAXODE_TUI_THEME.text, bold: true }, shortenHomePath(view.workspaceRoot)),
      ),
      h(Text, null,
        h(Text, { color: RAXODE_TUI_THEME.muted }, "Context "),
        h(Text, { color: RAXODE_TUI_THEME.text }, contextBar(view)),
        h(Text, { color: RAXODE_TUI_THEME.text, bold: true }, ` ${contextPercent(view)} of 1.05M`),
      ),
    ),
  );
}
