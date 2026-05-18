import { parseDirectTuiTurnIndex } from "./rewind-state.js";

function coerceTurnIndex(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function coerceTurnId(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }
  const trimmed = value.trim();
  if (!trimmed || !/^turn-\d+$/u.test(trimmed)) {
    return 0;
  }
  return parseDirectTuiTurnIndex(trimmed);
}

function coerceEmbeddedTurnId(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }
  const match = /(?:^|:)turn-(\d+)(?::|$)/u.exec(value.trim());
  if (!match) {
    return 0;
  }
  return parseDirectTuiTurnIndex(`turn-${match[1]}`);
}

export function resolveNextOptimisticTurnIndex(params: {
  existingTurns: Array<{ turnIndex?: number }>;
  transcriptMessages: Array<{ turnId?: string; messageId?: string }>;
  usageLedger: Array<{ turnId?: string }>;
  pendingOutboundTurns: Array<{ turnIndex: number }>;
}): number {
  let maxTurnIndex = 0;

  for (const turn of params.existingTurns) {
    maxTurnIndex = Math.max(maxTurnIndex, coerceTurnIndex(turn.turnIndex));
  }
  for (const message of params.transcriptMessages) {
    maxTurnIndex = Math.max(maxTurnIndex, coerceTurnId(message.turnId));
    maxTurnIndex = Math.max(maxTurnIndex, coerceEmbeddedTurnId(message.messageId));
  }
  for (const usage of params.usageLedger) {
    maxTurnIndex = Math.max(maxTurnIndex, coerceTurnId(usage.turnId));
  }
  for (const pending of params.pendingOutboundTurns) {
    maxTurnIndex = Math.max(maxTurnIndex, coerceTurnIndex(pending.turnIndex));
  }

  return maxTurnIndex + 1;
}

export function resolveLastKnownTurnIndex(params: {
  existingTurns: Array<{ turnIndex?: number }>;
  transcriptMessages: Array<{ turnId?: string; messageId?: string }>;
  usageLedger: Array<{ turnId?: string }>;
  pendingOutboundTurns: Array<{ turnIndex: number }>;
}): number {
  return Math.max(0, resolveNextOptimisticTurnIndex(params) - 1);
}
