import path from "node:path";

import type { RaxodeApplicationCommand, RaxodeApplicationViewModel } from "../../contracts.js";
import { searchWorkspaceDirectories, type WorkspaceIndexSnapshot } from "./workspaceIndex.js";

export type RaxodeSlashPanelAction = {
  line: string;
  command?: RaxodeApplicationCommand;
  prefill?: string;
};

export type RaxodeSlashPanel = {
  id: "model" | "permissions" | "workspace" | "status" | "resume";
  title: string;
  lines: readonly string[];
  actions?: readonly RaxodeSlashPanelAction[];
};

export function buildRaxodeSlashPanel(
  input: string,
  view: RaxodeApplicationViewModel,
  workspaceIndex?: WorkspaceIndexSnapshot | null,
): RaxodeSlashPanel | undefined {
  const command = input.trim();
  if (command === "/model") {
    return {
      id: "model",
      title: "Model",
      lines: [
        `current ${view.model.model}/${view.model.reasoningEffort}`,
        "usage   /model gpt-5.5 low",
        "effort  none minimal low medium high xhigh",
      ],
    };
  }
  if (command === "/permissions" || command === "/permission") {
    const approvalLines = view.approvals.length > 0
      ? view.approvals.slice(0, 8).map((approval, index) =>
        `${String(index + 1).padStart(2, "0")} ${approval.approvalId} ${approval.status}${approval.decision ? `:${approval.decision}` : ""}`)
      : ["none    no approval records in current application view"];
    const pendingApprovalActions = view.approvals
      .filter((approval) => approval.status === "pending")
      .slice(0, 8)
      .flatMap((approval) => [
        {
          line: `approve ${approval.approvalId}`,
          command: {
            type: "application.approvalDecision" as const,
            approvalId: approval.approvalId,
            decision: "approve" as const,
          },
        },
        {
          line: `reject  ${approval.approvalId}`,
          command: {
            type: "application.approvalDecision" as const,
            approvalId: approval.approvalId,
            decision: "reject" as const,
          },
        },
        {
          line: `always  ${approval.approvalId}`,
          command: {
            type: "application.approvalDecision" as const,
            approvalId: approval.approvalId,
            decision: "approve_always" as const,
          },
        },
      ]);
    return {
      id: "permissions",
      title: "Permissions",
      lines: [
        `current ${view.permissionProfile}`,
        "usage   /permissions standard",
        "request /permissions request <approval-id> <reason>",
        "approve /permissions approve <approval-id>",
        "reject  /permissions reject <approval-id>",
        "profiles restricted standard permissive yolo bapr",
        ...approvalLines,
      ],
      actions: pendingApprovalActions,
    };
  }
  if (command === "/resume") {
    const sessionLines = view.sessions.length > 0
      ? view.sessions.slice(0, 8).map((session, index) =>
        `${String(index + 1).padStart(2, "0")} ${session.sessionId} ${session.status} turns=${session.turns}`)
      : ["none    no session history in current application view"];
    const sessionActions = view.sessions.slice(0, 8).flatMap((session) => [
      {
        line: `resume  ${session.sessionId}`,
        command: {
          type: "application.resume" as const,
          sessionId: session.sessionId,
        },
      },
      {
        line: `rename  ${session.sessionId}`,
        prefill: `/resume rename ${session.sessionId} `,
      },
    ]);
    return {
      id: "resume",
      title: "Resume",
      lines: [
        `current ${view.sessionId}`,
        "usage   /resume <session-id>",
        "create  /resume create <name>",
        "rename  /resume rename <session-id> <name>",
        "empty   resumes the current/latest application session",
        ...sessionLines,
      ],
      actions: [
        {
          line: "create  new session",
          prefill: "/resume create ",
        },
        ...sessionActions,
      ],
    };
  }
  if (command === "/workspace") {
    const directoryEntries = workspaceIndex ? searchWorkspaceDirectories(workspaceIndex, "", 8) : [];
    const directoryHints = workspaceIndex
      ? directoryEntries.map((entry) => `dir     ${entry.path}`)
      : ["index   loading or unavailable"];
    return {
      id: "workspace",
      title: "Workspace",
      lines: [
        `current ${view.workspaceRoot}`,
        "usage   /workspace /absolute/path",
        ...directoryHints,
      ],
      actions: directoryEntries.map((entry) => ({
        line: `switch  ${entry.path}`,
        command: {
          type: "application.switchWorkspace",
          cwd: path.resolve(workspaceIndex?.root ?? view.workspaceRoot, entry.path),
        },
      })),
    };
  }
  if (command === "/status") {
    return {
      id: "status",
      title: "Status",
      lines: [
        `status  ${view.status}`,
        `session ${view.sessionId}`,
        `tools   ${view.tools.mounted}/${view.tools.total}`,
      ],
    };
  }
  return undefined;
}
