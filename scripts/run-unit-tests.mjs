import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const testFiles = [
  "raxode-cli/cli.test.ts",
  "raxode-cli/frontend/legacy-src/raxcode-cli.test.ts",
  "raxode-cli/frontend/legacy-src/raxcode-config.test.ts",
  "raxode-cli/frontend/legacy-src/raxode-login-wizard.test.ts",
  "raxode-cli/backend/tests/raxodeBackend.compile.test.ts",
  "raxode-cli/backend/tests/raxodeApplicationRuntime.test.ts",
  "raxode-cli/backend/tests/raxodeLiveProvider.test.ts",
  "raxode-cli/frontend/bridge/applicationClient.test.ts",
  "raxode-cli/frontend/components/Shell.render.test.ts",
];

const testHome = process.env.RAXODE_HOME || mkdtempSync(path.join(tmpdir(), "raxode-test-home-"));
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  {
    env: {
      ...process.env,
      RAXODE_HOME: testHome,
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
