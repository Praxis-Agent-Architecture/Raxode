import assert from "node:assert/strict";
import test from "node:test";

import {
  releaseOutboundSubmissionLock,
  tryAcquireOutboundSubmissionLock,
} from "./outbound-submission-lock.js";

test("tryAcquireOutboundSubmissionLock allows the first submission", () => {
  assert.deepEqual(tryAcquireOutboundSubmissionLock({
    activeToken: null,
    candidateToken: "manual:1",
  }), {
    acquired: true,
    nextToken: "manual:1",
  });
});

test("tryAcquireOutboundSubmissionLock blocks overlapping submissions while one is active", () => {
  assert.deepEqual(tryAcquireOutboundSubmissionLock({
    activeToken: "manual:1",
    candidateToken: "queue:2",
  }), {
    acquired: false,
    nextToken: "manual:1",
  });
});

test("releaseOutboundSubmissionLock only releases the active owner", () => {
  assert.equal(releaseOutboundSubmissionLock({
    activeToken: "manual:1",
    candidateToken: "queue:2",
  }), "manual:1");
  assert.equal(releaseOutboundSubmissionLock({
    activeToken: "manual:1",
    candidateToken: "manual:1",
  }), null);
});
