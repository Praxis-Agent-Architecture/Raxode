import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHumanGatePanelBodyLines,
  buildHumanGatePanelFields,
  resolveHumanGatePendingSignature,
  type HumanGatePanelEntry,
} from "./human-gate-panel.js";

const fixtureEntry: HumanGatePanelEntry = {
  gateId: "gate-1",
  requestId: "request-1",
  capabilityKey: "code.read",
  requestedTier: "B1",
  mode: "permissive",
  reason: "external read needs human approval",
  externalPathPrefixes: ["/home/proview/Desktop/Secrets"],
  plainLanguageRisk: {
    plainLanguageSummary: "This read will inspect a path outside the workspace.",
    requestedAction: "read /home/proview/Desktop/Secrets/notes.txt",
    riskLevel: "risky",
    whyItIsRisky: "The path is outside the current workspace boundary.",
    possibleConsequence: "Sensitive local files may be exposed to the agent.",
    whatHappensIfNotRun: "The task stays paused until a human decides.",
    availableUserActions: [
      { actionId: "gate-1:approve-once", label: "Approve once", kind: "approve" },
      { actionId: "gate-1:approve-always", label: "Approve always", kind: "approve" },
      { actionId: "gate-1:reject", label: "Reject", kind: "deny" },
      { actionId: "gate-1:reject-with-instruction", label: "Reject with note", kind: "ask_for_safer_alternative" },
      { actionId: "gate-1:view-details", label: "View details", kind: "view_details" },
    ],
  },
};

const applicationApprovalEntry: HumanGatePanelEntry = {
  gateId: "approval-1",
  requestId: "approval-1",
  capabilityKey: "computer_use",
  requestedTier: "risky",
  mode: "application-approval",
  reason: "computeruse.keyboardInputEmulation requires runtime approval",
  externalPathPrefixes: [],
  plainLanguageRisk: {
    plainLanguageSummary: "Raxode now infers: Under the current circumstances, the \"computer_use\" feature should be used.",
    requestedAction: "Use computeruse.keyboardInputEmulation",
    riskLevel: "risky",
    whyItIsRisky: "The tool can type into the current desktop session.",
    possibleConsequence: "The desktop session may receive keyboard input.",
    whatHappensIfNotRun: "Raxode will continue without using computer_use for this request.",
    availableUserActions: [
      { actionId: "approve-once", label: "Approve the use of this feature this time.", kind: "approve" },
      { actionId: "approve-always", label: "Always Approve this feature for this session.", kind: "approve" },
      { actionId: "continue-deny", label: "Continue and Deny the use of this feature this time.", kind: "deny" },
      { actionId: "stop-deny", label: "Stop and Deny the use of this feature this time.", kind: "deny" },
    ],
    metadata: {
      sourceKind: "application-approval",
    },
  },
};

test("buildHumanGatePanelFields exposes controlled actions for the selected gate", () => {
  const fields = buildHumanGatePanelFields({
    entry: fixtureEntry,
    expanded: false,
    noteValue: "",
    hasMultipleEntries: true,
  });
  assert.deepEqual(
    fields.map((field) => field.key),
    [
      "humanGate:approveOnce",
      "humanGate:approveAlways",
      "humanGate:deny",
      "humanGate:note",
      "humanGate:denyWithInstruction",
      "humanGate:toggleDetails",
      "humanGate:prev",
      "humanGate:next",
    ],
  );
});

test("buildHumanGatePanelBodyLines includes expanded details and external path prefixes", () => {
  const lines = buildHumanGatePanelBodyLines({
    entry: fixtureEntry,
    expanded: true,
    currentIndex: 0,
    totalCount: 2,
  });
  const rendered = lines.map((line) => line.text).join("\n");
  assert.match(rendered, /Pending approval 1\/2/);
  assert.match(rendered, /Risk level\s+risky/);
  assert.match(rendered, /Path prefix\s+\/home\/proview\/Desktop\/Secrets/);
  assert.match(rendered, /Gate \/ req\s+gate-1 \/ request-1/);
});

test("application approval panel renders human approval copy and four decisions", () => {
  const fields = buildHumanGatePanelFields({
    entry: applicationApprovalEntry,
    expanded: false,
    noteValue: "",
    hasMultipleEntries: false,
  });
  assert.deepEqual(
    fields.map((field) => [field.key, field.label, field.value]),
    [
      ["humanGate:approveOnce", "Approve This Time", "Approve the use of this feature this time."],
      ["humanGate:approveAlways", "Always Approve", "Always approve this feature for this session."],
      ["humanGate:deny", "Continue and Deny", "Continue and deny the use of this feature this time."],
      ["humanGate:denyAndStop", "Stop and Deny", "Stop and deny the use of this feature this time."],
    ],
  );

  const rendered = buildHumanGatePanelBodyLines({
    entry: applicationApprovalEntry,
    expanded: false,
    currentIndex: 0,
    totalCount: 1,
  }).map((line) => line.text).join("\n");
  assert.equal(
    rendered,
    " Approval Needed  Raxode now infers: Under the current circumstances, the \"computer_use\" feature should be used.\n",
  );
});

test("resolveHumanGatePendingSignature changes when gate revision changes", () => {
  const first = resolveHumanGatePendingSignature([
    { ...fixtureEntry, updatedAt: "2026-04-14T10:00:00.000Z" },
  ]);
  const second = resolveHumanGatePendingSignature([
    { ...fixtureEntry, updatedAt: "2026-04-14T10:01:00.000Z" },
  ]);
  assert.notEqual(first, second);
});
