import { Box, Text, useApp, useInput } from "ink";
import React, { useEffect, useMemo, useState } from "react";

import type { RaxodeApplicationAttachment, RaxodeApplicationViewModel } from "../../contracts.js";
import { createProcessApplicationClient, type RaxodeApplicationClient } from "../bridge/applicationClient.js";
import { extractComposerAttachments, extractPastedFileAttachments } from "../state/composerAttachments.js";
import { buildRaxodeSlashPanel, type RaxodeSlashPanel as RaxodeSlashPanelModel } from "../state/slashPanels.js";
import { resolveRaxodeSlashCommand } from "../state/slashCommands.js";
import { loadWorkspaceIndex, type WorkspaceIndexSnapshot } from "../state/workspaceIndex.js";
import { enableTerminalMouseReporting, parseMouseScrollDelta } from "../tui-input/mouse.js";
import { RaxodeComposer } from "./Composer.js";
import { RaxodeShell } from "./Shell.js";
import { RaxodeSlashPanel } from "./SlashPanel.js";

const h = React.createElement;

const APPROVAL_ACTIONS = [
  {
    label: "Approve This Time",
    description: "Approve the use of this feature this time.",
    decision: "approve",
  },
  {
    label: "Always Approve",
    description: "Always approve this feature for this session.",
    decision: "approve_always",
  },
  {
    label: "Continue and Deny",
    description: "Continue and deny the use of this feature this time.",
    decision: "reject",
  },
  {
    label: "Stop and Deny",
    description: "Stop and deny the use of this feature this time.",
    decision: "reject",
  },
] as const;

function RaxodeApprovalPanel(props: {
  approval: RaxodeApplicationViewModel["approvals"][number];
  selectedActionIndex: number;
}): React.ReactElement {
  const feature = props.approval.feature ?? "requested";
  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(Text, null,
      h(Text, { color: "yellowBright", bold: true }, "Approval Needed  "),
      `Raxode now infers: Under the current circumstances, the "${feature}" feature should be used.`,
    ),
    h(Text, null, ""),
    ...APPROVAL_ACTIONS.map((action, index) =>
      h(Text, { key: action.label },
        index === props.selectedActionIndex ? " › " : "   ",
        h(Text, { color: index === props.selectedActionIndex ? "cyanBright" : undefined }, action.label.padEnd(18)),
        action.description,
      )),
    h(Text, null, ""),
    h(Text, { color: "gray" }, " press ↑ to select up • press ↓ to select down • press ENTER to submit approval"),
  );
}

function mergeAttachments(...groups: readonly (readonly RaxodeApplicationAttachment[])[]): readonly RaxodeApplicationAttachment[] {
  const seen = new Set<string>();
  const merged: RaxodeApplicationAttachment[] = [];
  for (const group of groups) {
    for (const attachment of group) {
      const key = attachment.localPath ?? attachment.remoteUrl ?? attachment.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(attachment);
    }
  }
  return merged;
}

export function RaxodeProcessApp(): React.ReactElement {
  const { exit } = useApp();
  const client = useMemo<RaxodeApplicationClient>(() => createProcessApplicationClient(), []);
  const [view, setView] = useState<RaxodeApplicationViewModel | null>(null);
  const [activePanel, setActivePanel] = useState<RaxodeSlashPanelModel | null>(null);
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndexSnapshot | null>(null);
  const [panelScrollOffset, setPanelScrollOffset] = useState(0);
  const [selectedPanelActionIndex, setSelectedPanelActionIndex] = useState(0);
  const [selectedApprovalActionIndex, setSelectedApprovalActionIndex] = useState(1);
  const [composerPrefill, setComposerPrefill] = useState<{ nonce: number; value: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingApproval = view?.approvals.find((approval) => approval.status === "pending") ?? null;

  useEffect(() => {
    let mounted = true;
    void client.ready
      .then((readyView) => {
        if (mounted) setView(readyView);
      })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : String(caught));
      });
    const unsubscribe = client.subscribe(() => {
      void client.getView().then((nextView) => {
        if (mounted) setView(nextView);
      });
    });
    return () => {
      mounted = false;
      unsubscribe();
      void client.close();
    };
  }, [client]);

  useEffect(() => enableTerminalMouseReporting(process.stdout), []);

  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    void loadWorkspaceIndex(view.workspaceRoot)
      .then((snapshot) => {
        if (!cancelled) setWorkspaceIndex(snapshot);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceIndex(null);
      });
    return () => {
      cancelled = true;
    };
  }, [view?.workspaceRoot]);

  useEffect(() => {
    setSelectedApprovalActionIndex(1);
  }, [pendingApproval?.approvalId]);

  useInput((input, key) => {
    if (pendingApproval) {
      if (key.upArrow || input === "k") {
        setSelectedApprovalActionIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedApprovalActionIndex((current) => Math.min(APPROVAL_ACTIONS.length - 1, current + 1));
        return;
      }
      if (key.return) {
        const action = APPROVAL_ACTIONS[selectedApprovalActionIndex] ?? APPROVAL_ACTIONS[1];
        void client.dispatch({
          type: "application.approvalDecision",
          approvalId: pendingApproval.approvalId,
          decision: action.decision,
          note: action.label,
        })
          .then((result) => setView(result.view))
          .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
        return;
      }
    }
    if (activePanel?.actions && activePanel.actions.length > 0) {
      if (key.upArrow || input === "k") {
        setSelectedPanelActionIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedPanelActionIndex((current) => Math.min(activePanel.actions!.length - 1, current + 1));
        return;
      }
      if (key.return) {
        const action = activePanel.actions[selectedPanelActionIndex];
        if (!action) return;
        setActivePanel(null);
        if (action.prefill) {
          setComposerPrefill((current) => ({
            nonce: (current?.nonce ?? 0) + 1,
            value: action.prefill ?? "",
          }));
          return;
        }
        if (!action.command) return;
        setBusy(true);
        void client.dispatch(action.command)
          .then((result) => setView(result.view))
          .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
          .finally(() => setBusy(false));
        return;
      }
    }
    const delta = parseMouseScrollDelta(input);
    if (delta === null || !activePanel) return;
    setPanelScrollOffset((current) =>
      Math.max(0, Math.min(Math.max(0, activePanel.lines.length + (activePanel.actions?.length ?? 0) - 1), current + delta)));
  });

  const submit = (value: string, composerAttachments: readonly RaxodeApplicationAttachment[] = []) => {
    if (value === "/exit" || value === "/quit") {
      void client.close().finally(() => exit());
      return;
    }
    if (view) {
      const panel = buildRaxodeSlashPanel(value, view, workspaceIndex);
      if (panel) {
        setActivePanel(panel);
        setPanelScrollOffset(0);
        setSelectedPanelActionIndex(0);
        return;
      }
    }
    const cwd = view?.workspaceRoot ?? process.cwd();
    const slashCommand = resolveRaxodeSlashCommand(value, {
      cwd,
      workspaceIndex,
    });
    const applicationCommand = slashCommand?.type === "application.submitTurn"
      ? { ...slashCommand, mode: "live" as const }
      : slashCommand;
    setActivePanel(null);
    setBusy(true);
    void client.dispatch(applicationCommand ?? {
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: value,
        attachments: mergeAttachments(
          composerAttachments,
          extractComposerAttachments(value, cwd),
          extractPastedFileAttachments(value, cwd),
        ),
        cwd,
      },
    })
      .then((result) => setView(result.view))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setBusy(false));
  };

  if (error) {
    return h(Box, { flexDirection: "column" }, h(Text, { color: "red" }, error));
  }

  if (!view) {
    return h(Box, null, h(Text, { color: "gray" }, "Starting Raxode..."));
  }

  return h(
    Box,
    { flexDirection: "column" },
    h(RaxodeShell, { view }),
    pendingApproval ? h(RaxodeApprovalPanel, {
      approval: pendingApproval,
      selectedActionIndex: selectedApprovalActionIndex,
    }) : null,
    activePanel ? h(RaxodeSlashPanel, {
      panel: activePanel,
      scrollOffset: panelScrollOffset,
      selectedActionIndex: selectedPanelActionIndex,
    }) : null,
    h(RaxodeComposer, {
      disabled: busy,
      placeholder: busy
        ? "Raxode is working..."
        : "Drag to select text, Ctrl+V to paste images, @ to choose files, / to choose commands",
      sessionId: view.sessionId,
      prefill: composerPrefill,
      onSubmit: submit,
    }),
  );
}
