export interface PendingOutboundTurnIdentity {
  turnId: string;
  turnIndex: number;
  messageId: string;
  userText: string;
}

export function resolveCommittedUserMessageId(params: {
  turnId: string;
  pendingOutboundTurn?: Pick<PendingOutboundTurnIdentity, "messageId"> | null;
}): string {
  return params.pendingOutboundTurn?.messageId ?? `user:${params.turnId}`;
}

function normalizePendingOutboundUserText(text?: string | null): string {
  return typeof text === "string"
    ? text.trim()
    : "";
}

export function consumePendingOutboundTurnEntry<T extends PendingOutboundTurnIdentity>(params: {
  entries: readonly T[];
  turnId: string;
  turnIndex?: number;
  userText?: string | null;
}): {
  matched: T | null;
  remaining: T[];
} {
  const nextEntries = [...params.entries];
  const exactTurnIdIndex = nextEntries.findIndex((entry) => entry.turnId === params.turnId);
  if (exactTurnIdIndex >= 0) {
    const [matched] = nextEntries.splice(exactTurnIdIndex, 1);
    return {
      matched: matched ?? null,
      remaining: nextEntries,
    };
  }

  if (typeof params.turnIndex === "number" && Number.isFinite(params.turnIndex) && params.turnIndex > 0) {
    const exactTurnIndex = nextEntries.findIndex((entry) => entry.turnIndex === params.turnIndex);
    if (exactTurnIndex >= 0) {
      const [matched] = nextEntries.splice(exactTurnIndex, 1);
      return {
        matched: matched ?? null,
        remaining: nextEntries,
      };
    }
  }

  const normalizedUserText = normalizePendingOutboundUserText(params.userText);
  if (!normalizedUserText) {
    return {
      matched: null,
      remaining: nextEntries,
    };
  }

  const matchingIndices = nextEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => normalizePendingOutboundUserText(entry.userText) === normalizedUserText);
  if (matchingIndices.length !== 1) {
    return {
      matched: null,
      remaining: nextEntries,
    };
  }

  const [{ index }] = matchingIndices;
  const [matched] = nextEntries.splice(index, 1);
  return {
    matched: matched ?? null,
    remaining: nextEntries,
  };
}
