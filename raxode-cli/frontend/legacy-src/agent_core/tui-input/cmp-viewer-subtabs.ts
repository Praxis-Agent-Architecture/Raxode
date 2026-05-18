export type CmpViewerSubtab = "summary" | "records";

export function resolveCmpViewerSubtab(value: string | undefined): CmpViewerSubtab {
  return value === "records" ? "records" : "summary";
}

export function cycleCmpViewerSubtab(current: CmpViewerSubtab): CmpViewerSubtab {
  return current === "summary" ? "records" : "summary";
}

export function buildCmpViewerHints(subtab: CmpViewerSubtab): string[] {
  if (subtab === "records") {
    return [
      "press TAB to switch panel",
      "press ← to previous page • press → to next page",
      "press ENTER to refresh current CMP summary",
      "press ESC to return to previous page",
    ];
  }
  return [
    "press TAB to switch panel",
    "press ← to scroll left • press → to scroll right",
    "press ENTER to refresh current CMP summary",
    "press ESC to return to previous page",
  ];
}
