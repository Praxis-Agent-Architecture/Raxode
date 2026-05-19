import assert from "node:assert/strict";
import test from "node:test";

import { buildCapabilityViewerBodyLines } from "./capability-viewer-panel.js";

test("capabilities panel omits TAP governance preview blocks", () => {
  const { lines } = buildCapabilityViewerBodyLines({
    snapshot: {
      registeredCount: 1,
      familyCount: 1,
      blockedCount: 0,
      pendingHumanGateCount: 0,
      toolReviewerSummary: {
        total: 1,
        open: 1,
        waitingHuman: 0,
        blocked: 0,
        completed: 0,
      },
      tmaSummary: {
        total: 2,
        inProgress: 1,
        resumable: 0,
        completed: 1,
      },
      lastAttempt: {
        capabilityKey: "repo.write",
        effectiveMode: "permissive",
        routeDecision: "allow",
        derivedRiskLevel: "normal",
      },
      writeDiagnostics: [{
        capabilityKey: "repo.write",
        requestedMode: "permissive",
        routeDecision: "allow",
        derivedRiskLevel: "normal",
      }],
      modeWalkthroughs: [{
        capabilityKey: "repo.write",
        probeLabel: "Normal probe",
        requestedMode: "permissive",
        routeDecision: "allow",
        derivedRiskLevel: "normal",
        accessStatus: "baseline_granted",
        safetyOutcome: "allow",
      }],
      groups: [{
        groupKey: "browser",
        title: "browser",
        count: 1,
        entries: [{
          capabilityKey: "browser.playwright",
          description: "Browser automation",
          bindingState: "active",
        }],
      }],
    },
    pageIndex: 0,
    lineWidth: 120,
    currentMode: "permissive",
  });

  const rendered = lines.map((line) => line.text).join("\n");
  assert.equal(rendered.includes("Write route preview"), false);
  assert.equal(rendered.includes("toolReviewer"), false);
  assert.equal(rendered.includes("TMA"), false);
  assert.equal(rendered.includes("TAP route anatomy"), false);
  assert.equal(rendered.includes("browser.playwright"), true);
});
