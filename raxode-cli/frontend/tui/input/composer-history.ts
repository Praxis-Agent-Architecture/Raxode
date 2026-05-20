export interface ComposerHistoryNavigationParams<T> {
  entries: readonly T[];
  activeIndex: number | null;
  draftBeforeNavigation: T | null;
  currentDraft: T;
  direction: -1 | 1;
}

export interface ComposerHistoryNavigationResult<T> {
  changed: boolean;
  nextActiveIndex: number | null;
  nextDraftBeforeNavigation: T | null;
  draftToApply: T | null;
}

export function recordSubmittedComposerHistory<T>(
  entries: readonly T[],
  entry: T,
): T[] {
  return [...entries, entry];
}

export function resolveComposerHistoryNavigation<T>(
  params: ComposerHistoryNavigationParams<T>,
): ComposerHistoryNavigationResult<T> {
  if (params.entries.length === 0) {
    return {
      changed: false,
      nextActiveIndex: params.activeIndex,
      nextDraftBeforeNavigation: params.draftBeforeNavigation,
      draftToApply: null,
    };
  }

  if (params.activeIndex === null) {
    if (params.direction === 1) {
      return {
        changed: false,
        nextActiveIndex: null,
        nextDraftBeforeNavigation: params.draftBeforeNavigation,
        draftToApply: null,
      };
    }
    const nextActiveIndex = params.entries.length - 1;
    return {
      changed: true,
      nextActiveIndex,
      nextDraftBeforeNavigation: params.currentDraft,
      draftToApply: params.entries[nextActiveIndex] ?? null,
    };
  }

  const nextIndex = params.activeIndex + params.direction;
  if (nextIndex < 0) {
    return {
      changed: false,
      nextActiveIndex: params.activeIndex,
      nextDraftBeforeNavigation: params.draftBeforeNavigation,
      draftToApply: null,
    };
  }

  if (nextIndex >= params.entries.length) {
    if (params.draftBeforeNavigation === null) {
      return {
        changed: false,
        nextActiveIndex: params.activeIndex,
        nextDraftBeforeNavigation: params.draftBeforeNavigation,
        draftToApply: null,
      };
    }
    return {
      changed: true,
      nextActiveIndex: null,
      nextDraftBeforeNavigation: null,
      draftToApply: params.draftBeforeNavigation,
    };
  }

  return {
    changed: true,
    nextActiveIndex: nextIndex,
    nextDraftBeforeNavigation: params.draftBeforeNavigation,
    draftToApply: params.entries[nextIndex] ?? null,
  };
}
