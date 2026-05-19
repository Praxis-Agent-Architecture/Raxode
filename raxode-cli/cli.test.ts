import assert from "node:assert/strict";
import test from "node:test";

import { canStartInteractiveRaxodeTui } from "./index.js";

test("raxode cli detects whether interactive TUI can use raw terminal input", () => {
  assert.equal(canStartInteractiveRaxodeTui({ isTTY: true }), true);
  assert.equal(canStartInteractiveRaxodeTui({ isTTY: false }), false);
  assert.equal(canStartInteractiveRaxodeTui({} as Pick<NodeJS.ReadStream, "isTTY">), false);
});
