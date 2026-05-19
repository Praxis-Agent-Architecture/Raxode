import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPastedContentAttachment,
  normalizeClipboardText,
  readClipboardFileAttachments,
  readClipboardImageAttachment,
  readClipboardTextAttachment,
} from "./clipboardAttachments.js";

test("clipboard text helpers normalize and compress long pasted content", async () => {
  assert.equal(normalizeClipboardText("a\r\nb"), "a\nb");
  const attachment = createPastedContentAttachment("x".repeat(1001), 3);
  assert.equal(attachment.kind, "text");
  assert.equal(attachment.tokenText, "[Pasted Content #3 with 1001 characters]");

  const result = await readClipboardTextAttachment({
    nextIndex: 4,
    exec: async (command) => {
      assert.equal(command, "wl-paste");
      return { stdout: "y".repeat(1002) };
    },
  });
  assert.equal(result.text, "[Pasted Content #4 with 1002 characters]");
  assert.equal(result.attachment?.text, "y".repeat(1002));
});

test("clipboard image helper stores image bytes as application attachment", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "raxode-clipboard-test-"));
  const pngBytes = Buffer.from("png-bytes");
  const calls: string[] = [];
  const attachment = await readClipboardImageAttachment({
    sessionId: path.basename(tempHome),
    nextIndex: 2,
    exec: async (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (args.includes("--list-types")) return { stdout: "text/plain\nimage/png\n" };
      return { stdout: pngBytes };
    },
  });

  assert.equal(attachment?.kind, "image");
  assert.equal(attachment?.tokenText, "[Image #2]");
  assert.equal(attachment?.mimeType, "image/png");
  assert.deepEqual(await readFile(attachment?.localPath ?? ""), pngBytes);
  assert.ok(calls.some((call) => call.includes("--list-types")));
  await rm(path.dirname(attachment?.localPath ?? tempHome), { recursive: true, force: true });
});

test("clipboard file helper reads GNOME copied file MIME payload", async () => {
  const attachments = await readClipboardFileAttachments({
    nextIndex: 5,
    exec: async (command, args) => {
      assert.equal(command, "wl-paste");
      if (args.includes("--list-types")) return { stdout: "text/plain\nx-special/gnome-copied-files\n" };
      assert.deepEqual(args, ["--type", "x-special/gnome-copied-files"]);
      return { stdout: "copy\nfile:///tmp/alpha.txt\nfile:///tmp/beta%20space.md\n" };
    },
  });

  assert.equal(attachments.length, 2);
  assert.equal(attachments[0]?.id, "clipboard-file:5");
  assert.equal(attachments[0]?.kind, "file");
  assert.equal(attachments[0]?.localPath, "/tmp/alpha.txt");
  assert.equal(attachments[0]?.displayName, "alpha.txt");
  assert.equal(attachments[0]?.metadata?.clipboardMimeType, "x-special/gnome-copied-files");
  assert.equal(attachments[0]?.metadata?.clipboardAction, "copy");
  assert.equal(attachments[1]?.localPath, "/tmp/beta space.md");
});

test("clipboard file helper reads text uri list through xclip fallback", async () => {
  const attachments = await readClipboardFileAttachments({
    nextIndex: 1,
    exec: async (command, args) => {
      if (command === "wl-paste") throw new Error("no wayland clipboard");
      if (args.includes("TARGETS")) return { stdout: "text/plain\ntext/uri-list\n" };
      assert.deepEqual(args, ["-selection", "clipboard", "-t", "text/uri-list", "-o"]);
      return { stdout: "# comment\nfile:///tmp/report.csv\nhttps://example.com/ignored\nfile:///tmp/report.csv\n" };
    },
  });

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.id, "clipboard-file:1");
  assert.equal(attachments[0]?.localPath, "/tmp/report.csv");
  assert.equal(attachments[0]?.metadata?.clipboardMimeType, "text/uri-list");
});
