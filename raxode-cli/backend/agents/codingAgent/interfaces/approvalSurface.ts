import type { RuntimeApprovalResolver } from "@praxis-ai/praxis";

export const raxodeApprovalResolver: RuntimeApprovalResolver = async (approval) => ({
  status: "pending",
  resolvedBy: "raxode-application-approval-surface",
  reason: `Raxode application approval surface has not received a TUI decision for ${approval.approvalId}.`,
});
