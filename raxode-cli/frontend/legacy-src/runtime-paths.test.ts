import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveConfigRoot,
  resolveRaxcodeHome,
  resolveStateRoot,
} from "./runtime-paths.js";

test("runtime paths use RAXODE_HOME and the ~/.raxode default instead of legacy raxcode naming", () => {
  const previousHome = process.env.HOME;
  const previousRaxodeHome = process.env.RAXODE_HOME;
  const previousRaxcodeHome = process.env.RAXCODE_HOME;
  const previousPraxisConfigRoot = process.env.PRAXIS_CONFIG_ROOT;
  const previousPraxisStateRoot = process.env.PRAXIS_STATE_ROOT;
  process.env.HOME = "/tmp/raxode-user-home";
  process.env.RAXCODE_HOME = "/tmp/legacy-raxcode-home";
  process.env.PRAXIS_CONFIG_ROOT = "/tmp/legacy-config-root";
  process.env.PRAXIS_STATE_ROOT = "/tmp/legacy-state-root";
  delete process.env.RAXODE_HOME;
  try {
    assert.equal(resolveRaxcodeHome("/tmp/workspace"), "/tmp/raxode-user-home/.raxode");
    assert.equal(resolveConfigRoot("/tmp/workspace"), "/tmp/raxode-user-home/.raxode");
    assert.equal(resolveStateRoot("/tmp/workspace"), "/tmp/raxode-user-home/.raxode");
    process.env.RAXODE_HOME = "/tmp/custom-raxode-home";
    assert.equal(resolveRaxcodeHome("/tmp/workspace"), "/tmp/custom-raxode-home");
    assert.equal(resolveConfigRoot("/tmp/workspace"), "/tmp/custom-raxode-home");
    assert.equal(resolveStateRoot("/tmp/workspace"), "/tmp/custom-raxode-home");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousRaxodeHome === undefined) {
      delete process.env.RAXODE_HOME;
    } else {
      process.env.RAXODE_HOME = previousRaxodeHome;
    }
    if (previousRaxcodeHome === undefined) {
      delete process.env.RAXCODE_HOME;
    } else {
      process.env.RAXCODE_HOME = previousRaxcodeHome;
    }
    if (previousPraxisConfigRoot === undefined) {
      delete process.env.PRAXIS_CONFIG_ROOT;
    } else {
      process.env.PRAXIS_CONFIG_ROOT = previousPraxisConfigRoot;
    }
    if (previousPraxisStateRoot === undefined) {
      delete process.env.PRAXIS_STATE_ROOT;
    } else {
      process.env.PRAXIS_STATE_ROOT = previousPraxisStateRoot;
    }
  }
});
