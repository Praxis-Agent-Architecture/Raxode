export interface DirectTuiAssistantStreamUpdate<TPayload> {
  turnId: string;
  decodedText: string;
  payload: TPayload;
}

export interface DirectTuiAssistantStreamCoalescer<TPayload> {
  push(update: DirectTuiAssistantStreamUpdate<TPayload>): void;
  flushTurn(turnId: string): void;
  flushAll(): void;
  cancelTurn(turnId: string): void;
  cancelAll(): void;
}

export function createDirectTuiAssistantStreamCoalescer<TPayload>(options: {
  intervalMs: number;
  emit: (update: DirectTuiAssistantStreamUpdate<TPayload>) => void;
  now?: () => number;
}): DirectTuiAssistantStreamCoalescer<TPayload> {
  const intervalMs = Math.max(0, options.intervalMs);
  const now = options.now ?? (() => performance.now());
  const pendingByTurn = new Map<string, DirectTuiAssistantStreamUpdate<TPayload>>();
  const lastEmitAtByTurn = new Map<string, number>();
  const timerByTurn = new Map<string, ReturnType<typeof setTimeout>>();

  const clearTimer = (turnId: string) => {
    const timer = timerByTurn.get(turnId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timerByTurn.delete(turnId);
  };

  const emitNow = (update: DirectTuiAssistantStreamUpdate<TPayload>) => {
    clearTimer(update.turnId);
    pendingByTurn.delete(update.turnId);
    lastEmitAtByTurn.set(update.turnId, now());
    options.emit(update);
  };

  const flushTurn = (turnId: string) => {
    const pending = pendingByTurn.get(turnId);
    if (!pending) {
      clearTimer(turnId);
      return;
    }
    emitNow(pending);
  };

  return {
    push(update) {
      const currentTime = now();
      const lastEmitAt = lastEmitAtByTurn.get(update.turnId);
      if (lastEmitAt === undefined || currentTime - lastEmitAt >= intervalMs) {
        emitNow(update);
        return;
      }

      pendingByTurn.set(update.turnId, update);
      if (timerByTurn.has(update.turnId)) {
        return;
      }
      const delayMs = Math.max(0, intervalMs - (currentTime - lastEmitAt));
      timerByTurn.set(update.turnId, setTimeout(() => {
        flushTurn(update.turnId);
      }, delayMs));
    },
    flushTurn,
    flushAll() {
      for (const turnId of [...pendingByTurn.keys()]) {
        flushTurn(turnId);
      }
    },
    cancelTurn(turnId) {
      clearTimer(turnId);
      pendingByTurn.delete(turnId);
      lastEmitAtByTurn.delete(turnId);
    },
    cancelAll() {
      for (const turnId of [...timerByTurn.keys()]) {
        clearTimer(turnId);
      }
      pendingByTurn.clear();
      lastEmitAtByTurn.clear();
    },
  };
}
