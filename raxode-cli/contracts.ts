/*
 * 文件定位：raxode-cli / 前后端共享协议。
 * 核心目的：复用 framework applicationLayer 合同，让 TUI 不依赖 backend 或 agentCore。
 */

export type {
  PraxisApplicationAttachment as RaxodeApplicationAttachment,
  PraxisApplicationCommand as RaxodeApplicationCommand,
  PraxisApplicationCommandResult as RaxodeApplicationBackendResult,
  PraxisApplicationEvent as RaxodeApplicationEvent,
  PraxisApplicationInputEnvelope as RaxodeApplicationInputEnvelope,
  PraxisApplicationPermissionProfile as RaxodeApplicationPermissionProfile,
  PraxisApplicationReasoningEffort as RaxodeApplicationReasoningEffort,
  PraxisApplicationRuntimeMode as RaxodeApplicationRunMode,
  PraxisApplicationStatus as RaxodeApplicationStatus,
  PraxisApplicationViewModel as RaxodeApplicationViewModel,
} from "@praxis-ai/praxis/application-layer";
