/*
 * 文件定位：Raxode package library entry.
 * 核心目的：暴露应用后端与共享协议；用户命令入口由 bin/raxode 的 TUI 路径负责。
 */

export {
  createRaxodeBackend,
  createRaxodeBackendRestServer,
  createRaxodeBackendWebSocketServer,
} from "./backend/raxodeBackend.js";
export type {
  RaxodeApplicationAttachment,
  RaxodeApplicationBackendResult,
  RaxodeApplicationCommand,
  RaxodeApplicationEvent,
  RaxodeApplicationInputEnvelope,
  RaxodeApplicationPermissionProfile,
  RaxodeApplicationReasoningEffort,
  RaxodeApplicationRunMode,
  RaxodeApplicationStatus,
  RaxodeApplicationViewModel,
} from "./contracts.js";
