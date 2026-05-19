import assert from "node:assert/strict";
import test from "node:test";

import { extractComposerAttachments, extractPastedFileAttachments, normalizeMentionPath } from "./composerAttachments.js";

test("composer attachment parser normalizes file mentions", () => {
  assert.equal(normalizeMentionPath("./README.md", "/repo"), "/repo/README.md");
  assert.equal(normalizeMentionPath("/tmp/a.txt", "/repo"), "/tmp/a.txt");

  const attachments = extractComposerAttachments("read @./README.md and @src/index.ts again @./README.md", "/repo");
  assert.deepEqual(attachments.map((attachment) => attachment.localPath), [
    "/repo/README.md",
    "/repo/src/index.ts",
  ]);
  assert.equal(attachments[0]?.tokenText, "@./README.md");
});

test("composer attachment parser normalizes pasted file paths", () => {
  const attachments = extractPastedFileAttachments([
    "file:///repo/docs/a.md",
    "/repo/src/index.ts",
    "# comment from text/uri-list",
    "/repo/src/index.ts",
  ].join("\n"), "/repo");

  assert.deepEqual(attachments.map((attachment) => attachment.localPath), [
    "/repo/docs/a.md",
    "/repo/src/index.ts",
  ]);
  assert.equal(attachments[0]?.tokenText, "@/repo/docs/a.md");
});
