export interface PendingComposerFlushEntryLike {
  id: string;
  status: string;
}

export function shouldStartPendingComposerDispatchFlush(params: {
  pendingEntry?: PendingComposerFlushEntryLike | null;
  backendReady: boolean;
  hasRunningForegroundWork: boolean;
  activeFlushId?: string | null;
}): boolean {
  return Boolean(
    params.pendingEntry
      && params.pendingEntry.status === "ready"
      && params.backendReady
      && !params.hasRunningForegroundWork
      && params.activeFlushId !== params.pendingEntry.id,
  );
}

export function resolvePendingComposerDispatchesAfterFlush<T extends PendingComposerFlushEntryLike>(params: {
  entries: readonly T[];
  flushedEntryId: string;
  sent: boolean;
}): {
  nextEntries: T[];
  nextChainInterrupt: boolean;
} {
  if (!params.sent) {
    return {
      nextEntries: [...params.entries],
      nextChainInterrupt: false,
    };
  }

  const nextEntries = params.entries.filter((entry) => entry.id !== params.flushedEntryId);
  return {
    nextEntries,
    nextChainInterrupt: nextEntries[0]?.status === "ready",
  };
}
