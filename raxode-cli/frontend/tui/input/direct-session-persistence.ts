export type DirectTuiSessionPersistenceScheduler<TSnapshot> = {
  schedule(snapshot: TSnapshot): void;
  flushNow(): void;
  cancel(): void;
};

export function createDirectTuiSessionPersistenceScheduler<TSnapshot>(options: {
  delayMs: number;
  save: (snapshot: TSnapshot) => void;
}): DirectTuiSessionPersistenceScheduler<TSnapshot> {
  const delayMs = Math.max(0, options.delayMs);
  let pendingSnapshot: TSnapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimer = () => {
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timer = null;
  };

  const flushNow = () => {
    clearPendingTimer();
    if (pendingSnapshot === null) {
      return;
    }
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    options.save(snapshot);
  };

  return {
    schedule(snapshot) {
      pendingSnapshot = snapshot;
      clearPendingTimer();
      timer = setTimeout(flushNow, delayMs);
    },
    flushNow,
    cancel() {
      clearPendingTimer();
      pendingSnapshot = null;
    },
  };
}
