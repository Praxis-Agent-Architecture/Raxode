import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type PackageJson = {
  bin?: Record<string, string>;
  files?: string[];
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
}

test("package exposes only the raxode command", () => {
  const manifest = readPackageJson();

  assert.deepEqual(manifest.bin, {
    raxode: "./bin/raxode",
  });
  assert.equal(manifest.files?.includes("bin/raxode-cli"), false);
});
