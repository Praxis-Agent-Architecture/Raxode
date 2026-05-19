/*
 * 文件定位：raxode-cli / frontend clipboard attachment helpers。
 * 核心目的：复用 legacy TUI 的 Ctrl+V 图片/长文本粘贴语义，并输出 application attachments。
 */

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import type { RaxodeApplicationAttachment } from "../../contracts.js";
import { normalizeMentionPath } from "./composerAttachments.js";

const execFile = promisify(execFileCallback);

export const PASTED_CONTENT_COMPRESSION_THRESHOLD = 1000;
export const CLIPBOARD_IMAGE_MIME_CANDIDATES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
] as const;
export const CLIPBOARD_FILE_MIME_CANDIDATES = [
  "x-special/gnome-copied-files",
  "text/uri-list",
] as const;

type ClipboardExec = (
  command: string,
  args: readonly string[],
  options: { encoding: "utf8" | "buffer"; timeout: number; maxBuffer?: number },
) => Promise<{ stdout: string | Buffer }>;

export type ClipboardReadOptions = {
  exec?: ClipboardExec;
  sessionId?: string;
  nextIndex?: number;
};

const defaultClipboardExec: ClipboardExec = async (command, args, options) => {
  const result = await execFile(command, [...args], options);
  return { stdout: result.stdout };
};

export function normalizeClipboardText(text: string): string {
  return text.replace(/\r\n/gu, "\n");
}

export function createPastedContentAttachment(text: string, nextIndex: number): RaxodeApplicationAttachment {
  const tokenText = `[Pasted Content #${nextIndex} with ${text.length} characters]`;
  return {
    id: `pasted-content:${nextIndex}`,
    kind: "text",
    tokenText,
    displayName: tokenText,
    text,
    metadata: {
      characterCount: text.length,
      sourceKind: "clipboard",
    },
  };
}

async function readClipboardTargets(execImpl: ClipboardExec): Promise<string> {
  try {
    const { stdout } = await execImpl("wl-paste", ["--list-types"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return typeof stdout === "string" ? stdout : stdout.toString("utf8");
  } catch {
    const { stdout } = await execImpl("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return typeof stdout === "string" ? stdout : stdout.toString("utf8");
  }
}

async function readClipboardMimeText(execImpl: ClipboardExec, mimeType: string): Promise<string | undefined> {
  try {
    const { stdout } = await execImpl("wl-paste", ["--type", mimeType], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const text = typeof stdout === "string" ? stdout : stdout.toString("utf8");
    return text.length > 0 ? normalizeClipboardText(text) : undefined;
  } catch {
    try {
      const { stdout } = await execImpl("xclip", ["-selection", "clipboard", "-t", mimeType, "-o"], {
        encoding: "utf8",
        timeout: 5_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const text = typeof stdout === "string" ? stdout : stdout.toString("utf8");
      return text.length > 0 ? normalizeClipboardText(text) : undefined;
    } catch {
      return undefined;
    }
  }
}

async function readClipboardImageBytes(execImpl: ClipboardExec, mimeType: string): Promise<Buffer | undefined> {
  try {
    const { stdout } = await execImpl("wl-paste", ["--type", mimeType], {
      encoding: "buffer",
      timeout: 5_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return Buffer.isBuffer(stdout) && stdout.length > 0 ? stdout : undefined;
  } catch {
    try {
      const { stdout } = await execImpl("xclip", ["-selection", "clipboard", "-t", mimeType, "-o"], {
        encoding: "buffer",
        timeout: 5_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      return Buffer.isBuffer(stdout) && stdout.length > 0 ? stdout : undefined;
    } catch {
      return undefined;
    }
  }
}

export async function readClipboardTextAttachment(options: ClipboardReadOptions = {}): Promise<{
  text: string;
  attachment?: RaxodeApplicationAttachment;
}> {
  const execImpl = options.exec ?? defaultClipboardExec;
  const normalizeResult = (stdout: string | Buffer) => {
    const text = normalizeClipboardText(typeof stdout === "string" ? stdout : stdout.toString("utf8"));
    if (text.length <= PASTED_CONTENT_COMPRESSION_THRESHOLD) return { text };
    const attachment = createPastedContentAttachment(text, options.nextIndex ?? 1);
    return { text: attachment.tokenText ?? text, attachment };
  };
  try {
    const { stdout } = await execImpl("wl-paste", ["--no-newline"], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return normalizeResult(stdout);
  } catch {
    const { stdout } = await execImpl("xclip", ["-selection", "clipboard", "-o"], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return normalizeResult(stdout);
  }
}

function parseClipboardFileUris(payload: string, mimeType: string): { action?: string; uris: string[] } {
  const lines = normalizeClipboardText(payload)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (mimeType === "x-special/gnome-copied-files") {
    const [action, ...uris] = lines;
    return { action, uris };
  }

  return { uris: lines };
}

export async function readClipboardFileAttachments(options: ClipboardReadOptions = {}): Promise<readonly RaxodeApplicationAttachment[]> {
  const execImpl = options.exec ?? defaultClipboardExec;
  let targets = "";
  try {
    targets = await readClipboardTargets(execImpl);
  } catch {
    return [];
  }

  const mimeType = CLIPBOARD_FILE_MIME_CANDIDATES.find((candidate) => targets.includes(candidate));
  if (!mimeType) return [];

  const payload = await readClipboardMimeText(execImpl, mimeType);
  if (!payload) return [];

  const parsed = parseClipboardFileUris(payload, mimeType);
  const attachments: RaxodeApplicationAttachment[] = [];
  const seen = new Set<string>();
  const startIndex = options.nextIndex ?? 1;
  for (const uri of parsed.uris) {
    if (!uri.startsWith("file://")) continue;
    let localPath: string;
    try {
      localPath = normalizeMentionPath(uri);
    } catch {
      continue;
    }
    if (seen.has(localPath)) continue;
    seen.add(localPath);
    const tokenText = `@${localPath}`;
    attachments.push({
      id: `clipboard-file:${startIndex + attachments.length}`,
      kind: "file",
      tokenText,
      displayName: basename(localPath),
      localPath,
      metadata: {
        sourceKind: "clipboard",
        clipboardMimeType: mimeType,
        clipboardAction: parsed.action,
      },
    });
  }
  return attachments;
}

export async function readClipboardImageAttachment(options: ClipboardReadOptions = {}): Promise<RaxodeApplicationAttachment | undefined> {
  const execImpl = options.exec ?? defaultClipboardExec;
  let targets = "";
  try {
    targets = await readClipboardTargets(execImpl);
  } catch {
    return undefined;
  }
  const mimeType = CLIPBOARD_IMAGE_MIME_CANDIDATES.find((candidate) => targets.includes(candidate));
  if (!mimeType) return undefined;

  const bytes = await readClipboardImageBytes(execImpl, mimeType);
  if (!bytes || bytes.length === 0) return undefined;

  const nextIndex = options.nextIndex ?? 1;
  const sessionId = options.sessionId ?? "raxode";
  const extension = extname(`x.${mimeType.split("/")[1] ?? "png"}`).replace(".svg+xml", ".svg") || ".png";
  const tempDir = resolve(tmpdir(), "raxode-cli", sessionId);
  await mkdir(tempDir, { recursive: true });
  const localPath = resolve(tempDir, `clipboard-image-${nextIndex}${extension}`);
  await writeFile(localPath, bytes);
  const tokenText = `[Image #${nextIndex}]`;

  return {
    id: `clipboard-image:${nextIndex}`,
    kind: "image",
    tokenText,
    displayName: tokenText,
    localPath,
    mimeType,
    metadata: {
      sourceKind: "clipboard",
      bytes: bytes.length,
    },
  };
}
