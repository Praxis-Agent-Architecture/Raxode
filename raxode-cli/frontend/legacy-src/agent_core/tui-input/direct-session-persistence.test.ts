import assert from "node:assert/strict";
import test from "node:test";

import { createDirectTuiSessionPersistenceScheduler } from "./direct-session-persistence.js";

test("direct session persistence scheduler coalesces pending snapshots", async () => {
  const saved: string[] = [];
  const scheduler = createDirectTuiSessionPersistenceScheduler<string>({
    delayMs: 20,
    save: (snapshot) => {
      saved.push(snapshot);
    },
  });

  scheduler.schedule("first");
  scheduler.schedule("second");
  scheduler.schedule("third");

  assert.deepEqual(saved, []);

  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.deepEqual(saved, ["third"]);
});

test("direct session persistence scheduler flushes latest snapshot immediately", () => {
  const saved: string[] = [];
  const scheduler = createDirectTuiSessionPersistenceScheduler<string>({
    delayMs: 1000,
    save: (snapshot) => {
      saved.push(snapshot);
    },
  });

  scheduler.schedule("first");
  scheduler.schedule("second");
  scheduler.flushNow();
  scheduler.flushNow();

  assert.deepEqual(saved, ["second"]);
});
