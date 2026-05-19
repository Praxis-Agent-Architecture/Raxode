/*
 * 文件定位：raxode-cli / frontend slash command registry。
 * 核心目的：把 slash 命令展示和 application command 执行拆开，便于复用 legacy TUI 面板。
 */

import type {
  RaxodeApplicationCommand,
  RaxodeApplicationPermissionProfile,
  RaxodeApplicationReasoningEffort,
} from "../../contracts.js";
import { searchWorkspaceDirectories, type WorkspaceIndexSnapshot } from "./workspaceIndex.js";

export type RaxodeSlashCommand = {
  id: string;
  command: string;
  description: string;
  visible: boolean;
  toApplicationCommand?: (input?: string) => RaxodeApplicationCommand;
};

export const raxodeSlashCommands: readonly RaxodeSlashCommand[] = [
  {
    id: "model",
    command: "/model",
    description: "Choose model and reasoning settings",
    visible: true,
  },
  {
    id: "status",
    command: "/status",
    description: "View current working status",
    visible: true,
  },
  {
    id: "exit",
    command: "/exit",
    description: "Exit the current session",
    visible: true,
    toApplicationCommand: () => ({ type: "application.close" }),
  },
  {
    id: "init",
    command: "/init",
    description: "Initialize the current workspace session",
    visible: true,
    toApplicationCommand: (input) => ({
      type: "application.submitTurn",
      input: {
        type: "application.input",
        text: input?.trim() || "Initialize the current Raxode workspace session.",
      },
    }),
  },
  {
    id: "resume",
    command: "/resume",
    description: "Resume the latest session or current work",
    visible: true,
  },
  {
    id: "permissions",
    command: "/permissions",
    description: "View and change permissions and approvals",
    visible: true,
  },
  {
    id: "workspace",
    command: "/workspace",
    description: "Switch current workspace directory",
    visible: true,
  },
  {
    id: "rush",
    command: "/rush",
    description: "Rush toward the goal at a faster speed",
    visible: false,
  },
  {
    id: "cmp",
    command: "/cmp",
    description: "View current context sections summary",
    visible: false,
  },
  {
    id: "mp",
    command: "/mp",
    description: "Browse current memory state",
    visible: false,
  },
  {
    id: "capabilities",
    command: "/capabilities",
    description: "View registered TAP capabilities",
    visible: false,
  },
  {
    id: "agents",
    command: "/agents",
    description: "Switch to agents view",
    visible: false,
  },
];

const reasoningEfforts = new Set<RaxodeApplicationReasoningEffort>(["none", "minimal", "low", "medium", "high", "xhigh"]);
const permissionProfiles = new Set<RaxodeApplicationPermissionProfile>(["restricted", "standard", "permissive", "yolo", "bapr"]);

export function visibleRaxodeSlashCommands(): readonly RaxodeSlashCommand[] {
  return raxodeSlashCommands.filter((command) => command.visible);
}

export function resolveRaxodeSlashCommand(
  value: string,
  options: { cwd?: string; workspaceIndex?: WorkspaceIndexSnapshot | null } = {},
): RaxodeApplicationCommand | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return undefined;
  const [rawCommand = "", ...rest] = trimmed.split(/\s+/u);
  const command = raxodeSlashCommands.find((entry) => entry.command === rawCommand);
  if (!command) return undefined;
  const argument = rest.join(" ").trim();
  if (command.toApplicationCommand) return command.toApplicationCommand(argument);
  if (command.id === "status") return { type: "application.start" };
  if (command.id === "resume") {
    const [verb = "", target = "", ...nameParts] = argument.split(/\s+/u).filter(Boolean);
    if (!verb) return { type: "application.resume" };
    if (verb === "create") {
      const name = [target, ...nameParts].join(" ").trim();
      return { type: "application.createSession", name: name || undefined };
    }
    if (verb === "rename" && target) {
      return {
        type: "application.renameSession",
        sessionId: target,
        name: nameParts.join(" ").trim() || target,
      };
    }
    return { type: "application.resume", sessionId: argument };
  }
  if (command.id === "model") {
    const [model, reasoningEffort] = argument.split(/\s+/u).filter(Boolean);
    if (!model) return { type: "application.start" };
    return {
      type: "application.changeModel",
      model,
      reasoningEffort: reasoningEfforts.has(reasoningEffort as RaxodeApplicationReasoningEffort)
        ? reasoningEffort as RaxodeApplicationReasoningEffort
        : undefined,
    };
  }
  if (command.id === "permissions") {
    const [verb = "", target = "", ...noteParts] = argument.split(/\s+/u).filter(Boolean);
    if (!verb) return { type: "application.start" };
    if (verb === "request" && target) {
      return {
        type: "application.requestApproval",
        approvalId: target,
        reason: noteParts.join(" ") || "approval requested from permissions panel",
      };
    }
    if ((verb === "approve" || verb === "reject" || verb === "always") && target) {
      return {
        type: "application.approvalDecision",
        approvalId: target,
        decision: verb === "always" ? "approve_always" : verb,
        note: noteParts.join(" ") || undefined,
      };
    }
    const profile = verb.trim();
    if (!permissionProfiles.has(profile as RaxodeApplicationPermissionProfile)) return undefined;
    return {
      type: "application.changePermissionProfile",
      profile: profile as RaxodeApplicationPermissionProfile,
    };
  }
  if (command.id === "workspace" && argument) {
    const indexedMatch = options.workspaceIndex
      ? searchWorkspaceDirectories(options.workspaceIndex, argument, 1)[0]
      : undefined;
    return {
      type: "application.switchWorkspace",
      cwd: indexedMatch && options.cwd
        ? `${options.cwd.replace(/\/$/u, "")}/${indexedMatch.path === "." ? "" : indexedMatch.path}`.replace(/\/$/u, "")
        : argument,
    };
  }
  return undefined;
}
