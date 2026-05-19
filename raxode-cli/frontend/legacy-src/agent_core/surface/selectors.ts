import type {
  SurfaceAppState,
  SurfaceComposerState,
  SurfaceMessage,
  SurfacePanelKind,
  SurfacePanelSnapshot,
  SurfaceTask,
  SurfaceTurn,
} from "./types.js";

export type SurfaceState = SurfaceAppState;

export interface SurfaceComposerSubmitState {
  canSubmit: boolean;
  reason?: string;
}

type SurfacePanelSnapshotForKind<TKind extends SurfacePanelKind> =
  Extract<SurfacePanelSnapshot, { kind: TKind }>;

function parseTurnIndexFromId(turnId: string | undefined): number | undefined {
  if (!turnId) {
    return undefined;
  }
  const parsed = Number.parseInt(turnId.replace(/^(turn-|turn\.)/u, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sortTranscriptMessagesByTurn(
  state: SurfaceState,
  messages: readonly SurfaceMessage[],
): SurfaceMessage[] {
  const sourceOrder = new Map<string, number>();
  state.messages.forEach((message, index) => {
    sourceOrder.set(message.id, index);
  });
  const turnIndexes = new Map<string, number>();
  state.turns.forEach((turn) => {
    const index = turn.turnIndex ?? parseTurnIndexFromId(turn.turnId ?? turn.id);
    if (Number.isFinite(index)) {
      turnIndexes.set(turn.id, index);
      if (turn.turnId) {
        turnIndexes.set(turn.turnId, index);
      }
    }
  });

  return [...messages].sort((left, right) => {
    const leftTurnIndex = left.turnId
      ? (turnIndexes.get(left.turnId) ?? parseTurnIndexFromId(left.turnId))
      : undefined;
    const rightTurnIndex = right.turnId
      ? (turnIndexes.get(right.turnId) ?? parseTurnIndexFromId(right.turnId))
      : undefined;
    if (
      leftTurnIndex !== undefined
      && rightTurnIndex !== undefined
      && leftTurnIndex !== rightTurnIndex
    ) {
      return leftTurnIndex - rightTurnIndex;
    }
    return (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0);
  });
}

function toolSummaryFamilyKey(message: SurfaceMessage): string | undefined {
  const value = message.metadata?.familyKey;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().toLowerCase()
    : undefined;
}

function isToolPreviewMessage(message: SurfaceMessage): boolean {
  return message.kind === "status"
    && message.metadata?.source === "tool_summary"
    && message.metadata?.summaryRole === "tool_preview";
}

function isFinalToolSummaryMessage(message: SurfaceMessage): boolean {
  return message.kind === "status"
    && message.metadata?.source === "tool_summary"
    && message.metadata?.summaryRole !== "tool_preview";
}

function toolSummaryVisibilityKey(message: SurfaceMessage): string | undefined {
  const turnId = message.turnId?.trim();
  const familyKey = toolSummaryFamilyKey(message);
  return turnId && familyKey ? `${turnId}:${familyKey}` : undefined;
}

function toolSummaryTurnVisibilityKey(message: SurfaceMessage): string | undefined {
  const turnId = message.turnId?.trim();
  return turnId ? `${turnId}:*` : undefined;
}

function filterSupersededToolPreviewMessages(messages: readonly SurfaceMessage[]): SurfaceMessage[] {
  const laterFinalSummaryKeys = new Set<string>();
  const visible: SurfaceMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const visibilityKey = toolSummaryVisibilityKey(message);
    const turnVisibilityKey = toolSummaryTurnVisibilityKey(message);
    const familyKey = toolSummaryFamilyKey(message);
    if (
      isToolPreviewMessage(message)
      && (
        (visibilityKey !== undefined && laterFinalSummaryKeys.has(visibilityKey))
        || ((familyKey === undefined || familyKey === "tool") && turnVisibilityKey !== undefined && laterFinalSummaryKeys.has(turnVisibilityKey))
      )
    ) {
      continue;
    }
    visible.push(message);
    if (isFinalToolSummaryMessage(message) && visibilityKey) {
      laterFinalSummaryKeys.add(visibilityKey);
      const finalTurnVisibilityKey = toolSummaryTurnVisibilityKey(message);
      if (finalTurnVisibilityKey) {
        laterFinalSummaryKeys.add(finalTurnVisibilityKey);
      }
    }
  }
  return visible.reverse();
}

export function selectTranscriptMessages(
  state: SurfaceState,
  options: {
    limit?: number;
    turnId?: string;
  } = {},
): SurfaceMessage[] {
  const scoped = options.turnId
    ? state.messages.filter((message) => message.turnId === options.turnId)
    : state.messages;
  const ordered = filterSupersededToolPreviewMessages(sortTranscriptMessagesByTurn(state, scoped));
  if (!options.limit || options.limit <= 0 || ordered.length <= options.limit) {
    return ordered;
  }
  return ordered.slice(ordered.length - options.limit);
}

export function selectStatusMessages(state: SurfaceState): SurfaceMessage[] {
  return state.messages.filter((message) =>
    message.kind === "status"
    || message.kind === "notice"
    || message.kind === "error");
}

export function selectCurrentTurn(state: SurfaceState): SurfaceTurn | undefined {
  const preferredTurnId = state.selectedTurnId ?? state.currentTurnId ?? state.session?.activeTurnId;
  if (preferredTurnId) {
    return state.turns.find((turn) => turn.turnId === preferredTurnId || turn.id === preferredTurnId);
  }
  return state.turns.length > 0 ? state.turns[state.turns.length - 1] : undefined;
}

export function selectTaskById(state: SurfaceState, taskId: string): SurfaceTask | undefined {
  return state.tasks.find((task) => task.taskId === taskId || task.id === taskId);
}

export function selectActiveTasks(state: SurfaceState): SurfaceTask[] {
  return state.tasks
    .filter((task) =>
      task.status === "queued"
      || task.status === "running"
      || task.status === "waiting"
      || task.status === "blocked")
    .sort((left, right) => {
      const foregroundDelta = Number(right.foregroundable === true) - Number(left.foregroundable === true);
      if (foregroundDelta !== 0) {
        return foregroundDelta;
      }
      const updatedDelta = right.updatedAt.localeCompare(left.updatedAt);
      return updatedDelta !== 0 ? updatedDelta : left.id.localeCompare(right.id);
    });
}

export function selectInterruptibleTasks(state: SurfaceState): SurfaceTask[] {
  return state.tasks
    .filter((task) =>
      task.status === "queued"
      || task.status === "running"
      || task.status === "waiting")
    .sort((left, right) => {
      const foregroundDelta = Number(right.foregroundable === true) - Number(left.foregroundable === true);
      if (foregroundDelta !== 0) {
        return foregroundDelta;
      }
      const updatedDelta = right.updatedAt.localeCompare(left.updatedAt);
      return updatedDelta !== 0 ? updatedDelta : left.id.localeCompare(right.id);
    });
}

export function selectForegroundTasks(state: SurfaceState): SurfaceTask[] {
  return selectActiveTasks(state).filter((task) => task.foregroundable !== false);
}

export function selectLatestAssistantMessage(state: SurfaceState): SurfaceMessage | undefined {
  return [...state.messages].reverse().find((message) => message.kind === "assistant");
}

export function selectOpenOverlays(state: SurfaceState) {
  return state.overlays.filter((overlay) => overlay.open);
}

export function selectActiveOverlay(state: SurfaceState) {
  if (state.activeOverlayId) {
    return state.overlays.find((overlay) => (
      (overlay.overlayId === state.activeOverlayId || overlay.id === state.activeOverlayId) && overlay.open
    ));
  }
  const overlays = selectOpenOverlays(state);
  return overlays.length > 0 ? overlays[overlays.length - 1] : undefined;
}

export function selectComposerState(state: SurfaceState): SurfaceComposerState {
  return state.composer;
}

export function selectComposerSubmitState(state: SurfaceState): SurfaceComposerSubmitState {
  if (state.composer.blockedByOverlayId || selectActiveOverlay(state)) {
    return {
      canSubmit: false,
      reason: "overlay_active",
    };
  }
  if (!state.composer.submitEnabled || state.composer.disabled) {
    return {
      canSubmit: false,
      reason: "submit_disabled",
    };
  }
  if (state.composer.buffer.trim().length === 0) {
    return {
      canSubmit: false,
      reason: "empty_buffer",
    };
  }
  return {
    canSubmit: true,
  };
}

export function selectPanelSnapshots(state: SurfaceState): SurfacePanelSnapshot[] {
  return Object.values(state.panels).filter((panel): panel is SurfacePanelSnapshot => Boolean(panel));
}

export function selectPanelSnapshot(
  state: SurfaceState,
  kind: "run_status",
): Extract<SurfacePanelSnapshot, { kind: "run_status" }>;
export function selectPanelSnapshot<TKind extends SurfacePanelKind>(
  state: SurfaceState,
  kind: TKind,
): SurfacePanelSnapshotForKind<TKind>;
export function selectPanelSnapshot(
  state: SurfaceState,
  kind: SurfacePanelKind,
): SurfacePanelSnapshot {
  const panel = state.panels[kind];
  if (!panel) {
    throw new Error(`Missing surface panel snapshot for ${kind}.`);
  }
  return panel;
}

export function selectPanel<TKind extends SurfacePanelKind>(
  state: SurfaceState,
  kind: TKind,
): SurfacePanelSnapshotForKind<TKind> {
  return selectPanelSnapshot(state, kind);
}

export function selectSurfaceSummary(state: SurfaceState): string {
  const turn = selectCurrentTurn(state);
  const overlay = selectActiveOverlay(state);
  return [
    `turn=${turn?.turnId ?? turn?.id ?? "none"}`,
    `messages=${state.messages.length}`,
    `foreground_tasks=${selectForegroundTasks(state).length}`,
    `overlay=${overlay?.kind ?? "none"}`,
  ].join(", ");
}
