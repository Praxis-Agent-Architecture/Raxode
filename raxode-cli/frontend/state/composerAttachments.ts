/*
 * 文件定位：raxode-cli / frontend composer attachment parser。
 * 核心目的：把 TUI 输入里的 @file 引用转换为 application input attachments。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RaxodeApplicationAttachment } from "../../contracts.js";

const mentionPattern = /(^|\s)@(?<target>(?:\.{1,2}|~|\/)?[^\s]+)/gu;
const pastedFileLinePattern = /^(?:file:\/\/|\/|~\/|\.{1,2}\/)/u;

export function extractComposerAttachments(input: string, cwd = process.cwd()): readonly RaxodeApplicationAttachment[] {
  const attachments: RaxodeApplicationAttachment[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(mentionPattern)) {
    const rawTarget = match.groups?.target?.trim();
    if (!rawTarget || rawTarget.length === 0) continue;
    const localPath = normalizeMentionPath(rawTarget, cwd);
    if (seen.has(localPath)) continue;
    seen.add(localPath);
    attachments.push({
      id: `file:${localPath}`,
      kind: "file",
      tokenText: `@${rawTarget}`,
      displayName: path.basename(localPath),
      localPath,
    });
  }
  return attachments;
}

export function normalizeMentionPath(target: string, cwd = process.cwd(), home = process.env.HOME): string {
  if (target.startsWith("file://")) return path.resolve(fileURLToPath(target));
  if (target === "~") return home ?? target;
  if (target.startsWith("~/") && home) return path.resolve(home, target.slice(2));
  if (path.isAbsolute(target)) return path.resolve(target);
  return path.resolve(cwd, target);
}

export function extractPastedFileAttachments(text: string, cwd = process.cwd()): readonly RaxodeApplicationAttachment[] {
  const attachments: RaxodeApplicationAttachment[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/u)) {
    const candidate = rawLine.trim();
    if (!candidate || candidate.startsWith("#") || !pastedFileLinePattern.test(candidate)) continue;
    let localPath: string;
    try {
      localPath = normalizeMentionPath(candidate, cwd);
    } catch {
      continue;
    }
    if (seen.has(localPath)) continue;
    seen.add(localPath);
    attachments.push({
      id: `file:${localPath}`,
      kind: "file",
      tokenText: `@${localPath}`,
      displayName: path.basename(localPath),
      localPath,
      metadata: {
        sourceKind: "clipboard",
      },
    });
  }
  return attachments;
}
