import stringWidth from "string-width";

export type PendingComposerSubmissionMode = "waiting" | "queue";
export type PendingComposerSummaryState = "idle" | "summarizing" | "ready" | "failed";

export interface PendingComposerSubmissionLike {
  sequence: number;
  mode: PendingComposerSubmissionMode;
  text: string;
}

export interface PendingComposerTextMetrics {
  wideCount: number;
  narrowCount: number;
}

export interface PendingComposerVisibleWindow<T> {
  visibleItems: T[];
  hiddenCount: number;
  offset: number;
  maxOffset: number;
}

export interface PendingComposerWaitlistWindowItem<T> {
  item: T;
  sourceIndex: number;
  ordinal: number;
}

export interface PendingComposerWaitlistWindow<T> {
  visibleItems: PendingComposerWaitlistWindowItem<T>[];
  selectedIndex: number;
  selectedOrdinal: number;
  hiddenAboveCount: number;
  startIndex: number;
  endIndex: number;
}

export interface PendingComposerWaitlistSelectionResult {
  nextIndex: number | null;
  boundary: "top" | null;
}

export const PENDING_COMPOSER_MAX_VISIBLE = 6;
export const PENDING_COMPOSER_MAX_WIDE = 20;
export const PENDING_COMPOSER_MAX_NARROW = 34;

function countTextMetrics(text: string): PendingComposerTextMetrics {
  let wideCount = 0;
  let narrowCount = 0;
  for (const grapheme of [...text]) {
    if (stringWidth(grapheme) > 1) {
      wideCount += 1;
      continue;
    }
    narrowCount += 1;
  }
  return {
    wideCount,
    narrowCount,
  };
}

function canAppendWithinLimit(
  metrics: PendingComposerTextMetrics,
  addition: PendingComposerTextMetrics,
): boolean {
  return metrics.wideCount + addition.wideCount <= PENDING_COMPOSER_MAX_WIDE
    && metrics.narrowCount + addition.narrowCount <= PENDING_COMPOSER_MAX_NARROW;
}

export function measurePendingComposerText(text: string): PendingComposerTextMetrics {
  return countTextMetrics(text);
}

export function shouldSummarizePendingComposerText(text: string): boolean {
  const metrics = countTextMetrics(text.trim());
  return metrics.wideCount > PENDING_COMPOSER_MAX_WIDE
    || metrics.narrowCount > PENDING_COMPOSER_MAX_NARROW;
}

export function compactPendingComposerText(text: string): string {
  const trimmed = text.trim().replace(/\s+/gu, " ");
  if (!trimmed) {
    return "";
  }
  if (!shouldSummarizePendingComposerText(trimmed)) {
    return trimmed;
  }
  const ellipsis = "...";
  const ellipsisMetrics = countTextMetrics(ellipsis);
  let output = "";
  let outputMetrics: PendingComposerTextMetrics = { wideCount: 0, narrowCount: 0 };
  for (const grapheme of [...trimmed]) {
    const graphemeMetrics = countTextMetrics(grapheme);
    if (!canAppendWithinLimit(outputMetrics, {
      wideCount: graphemeMetrics.wideCount + ellipsisMetrics.wideCount,
      narrowCount: graphemeMetrics.narrowCount + ellipsisMetrics.narrowCount,
    })) {
      break;
    }
    output += grapheme;
    outputMetrics = {
      wideCount: outputMetrics.wideCount + graphemeMetrics.wideCount,
      narrowCount: outputMetrics.narrowCount + graphemeMetrics.narrowCount,
    };
  }
  return output.length > 0 ? `${output}${ellipsis}` : ellipsis;
}

export function takeNextPendingComposerDispatchBatch<T extends { mode: PendingComposerSubmissionMode }>(
  entries: readonly T[],
): T[] {
  if (entries.length === 0) {
    return [];
  }
  const batch: T[] = [entries[0]!];
  for (let index = 1; index < entries.length; index += 1) {
    const candidate = entries[index];
    if (!candidate || candidate.mode !== "waiting") {
      break;
    }
    batch.push(candidate);
  }
  return batch;
}

export function formatPendingComposerOrdinal(
  sequence: number,
  totalCount: number,
): string {
  return String(sequence).padStart(totalCount >= 100 ? 3 : 2, "0");
}

export function resolvePendingComposerPreviewOrdinal(sourceIndex: number): number {
  return Math.max(1, sourceIndex + 1);
}

export function clampPendingComposerSelectionIndex(
  requestedIndex: number,
  totalCount: number,
): number {
  if (totalCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(requestedIndex, totalCount - 1));
}

export function buildPendingComposerWaitlistWindow<T>(
  entries: readonly T[],
  requestedSelectionIndex: number,
  maxVisible = PENDING_COMPOSER_MAX_VISIBLE,
): PendingComposerWaitlistWindow<T> {
  if (entries.length === 0) {
    return {
      visibleItems: [],
      selectedIndex: 0,
      selectedOrdinal: 0,
      hiddenAboveCount: 0,
      startIndex: 0,
      endIndex: 0,
    };
  }
  const selectedIndex = clampPendingComposerSelectionIndex(requestedSelectionIndex, entries.length);
  const clampedMaxVisible = Math.max(1, maxVisible);
  const maxStartIndex = Math.max(0, entries.length - clampedMaxVisible);
  const startIndex = Math.max(0, Math.min(selectedIndex - clampedMaxVisible + 1, maxStartIndex));
  const endIndex = Math.min(entries.length, startIndex + clampedMaxVisible);
  const visibleItems = entries
    .slice(startIndex, endIndex)
    .map((item, offset) => {
      const sourceIndex = startIndex + offset;
      return {
        item,
        sourceIndex,
        ordinal: resolvePendingComposerPreviewOrdinal(sourceIndex),
      };
    })
    .reverse();
  return {
    visibleItems,
    selectedIndex,
    selectedOrdinal: resolvePendingComposerPreviewOrdinal(selectedIndex),
    hiddenAboveCount: Math.max(0, entries.length - endIndex),
    startIndex,
    endIndex,
  };
}

export function resolvePendingComposerWaitlistSelectionMove(input: {
  currentIndex: number | null;
  direction: -1 | 1;
  totalCount: number;
}): PendingComposerWaitlistSelectionResult {
  const { currentIndex, direction, totalCount } = input;
  if (totalCount <= 0) {
    return {
      nextIndex: null,
      boundary: null,
    };
  }
  if (currentIndex === null) {
    return {
      nextIndex: direction > 0 ? 0 : null,
      boundary: null,
    };
  }
  if (direction < 0) {
    if (currentIndex <= 0) {
      return {
        nextIndex: null,
        boundary: null,
      };
    }
    return {
      nextIndex: currentIndex - 1,
      boundary: null,
    };
  }
  const nextIndex = currentIndex + 1;
  if (nextIndex >= totalCount) {
    return {
      nextIndex: currentIndex,
      boundary: "top",
    };
  }
  return {
    nextIndex,
    boundary: null,
  };
}

export function buildPendingComposerVisibleWindow<T>(
  entries: readonly T[],
  requestedOffset: number,
  maxVisible = PENDING_COMPOSER_MAX_VISIBLE,
): PendingComposerVisibleWindow<T> {
  if (entries.length === 0) {
    return {
      visibleItems: [],
      hiddenCount: 0,
      offset: 0,
      maxOffset: 0,
    };
  }
  const maxOffset = Math.max(0, entries.length - maxVisible);
  const offset = Math.max(0, Math.min(requestedOffset, maxOffset));
  const end = Math.max(0, entries.length - offset);
  const start = Math.max(0, end - maxVisible);
  return {
    visibleItems: [...entries.slice(start, end)].reverse(),
    hiddenCount: start,
    offset,
    maxOffset,
  };
}
