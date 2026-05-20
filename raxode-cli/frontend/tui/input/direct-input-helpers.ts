export type DirectInputImageSourceKind = "clipboard" | "local_path" | "remote_url";

export interface DirectInputImageAttachment {
  id: string;
  tokenText?: string;
  sourceKind: DirectInputImageSourceKind;
  displayName?: string;
  mimeType?: string;
  localPath?: string;
  remoteUrl?: string;
}

export interface DirectInputPastedContentAttachment {
  id: string;
  tokenText: string;
  text: string;
  characterCount: number;
}

export interface DirectInputFileReference {
  id: string;
  tokenText: string;
  relativePath: string;
  absolutePath: string;
  displayName?: string;
}

function stripCodeFences(value: string): string {
  return value.replace(/```[a-zA-Z0-9_-]*\n?/gu, "").replace(/```/gu, "").trim();
}

function extractFirstJsonObject(source: string): string {
  const fenced = source.match(/```json\s*([\s\S]*?)```/iu) ?? source.match(/```\s*([\s\S]*?)```/iu);
  if (fenced?.[1]) {
    return extractFirstJsonObject(fenced[1]);
  }
  const start = source.indexOf("{");
  if (start === -1) {
    throw new Error("response envelope did not contain a JSON object");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error("response envelope JSON was unterminated");
}

function extractResponseTextFromPartialEnvelope(buffer: string): string | undefined {
  const match = /"responseText"\s*:\s*"/u.exec(buffer);
  if (!match) {
    return undefined;
  }
  let index = match.index + match[0].length;
  let output = "";

  while (index < buffer.length) {
    const char = buffer[index];
    if (char === "\"") {
      return output;
    }
    if (char === "\\") {
      const next = buffer[index + 1];
      if (next === undefined) {
        return output;
      }
      if (next === "u") {
        const hex = buffer.slice(index + 2, index + 6);
        if (!/^[0-9a-fA-F]{4}$/u.test(hex)) {
          return output;
        }
        output += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
        continue;
      }
      const simpleEscapeMap: Record<string, string> = {
        "\"": "\"",
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      output += simpleEscapeMap[next] ?? next;
      index += 2;
      continue;
    }
    output += char;
    index += 1;
  }

  return output;
}

export function extractResponseTextMaybe(text: string): string {
  const cleaned = text.trim();
  const stripped = stripCodeFences(cleaned).trim();
  const candidates = [...new Set([cleaned, stripped].filter((value) => value.length > 0))];

  for (const candidate of candidates) {
    const looksEnvelopeLike = candidate.startsWith("{") || candidate.includes("\"responseText\"");
    if (!looksEnvelopeLike) {
      continue;
    }
    try {
      const parsed = JSON.parse(extractFirstJsonObject(candidate)) as Record<string, unknown>;
      if (typeof parsed.responseText === "string" && parsed.responseText.trim()) {
        return parsed.responseText.trim();
      }
    } catch {
      const partial = extractResponseTextFromPartialEnvelope(candidate)?.trim();
      if (partial) {
        return partial;
      }
      continue;
    }
    const partial = extractResponseTextFromPartialEnvelope(candidate)?.trim();
    if (partial) {
      return partial;
    }
  }
  return cleaned;
}

const ESCAPED_DISPLAY_SEQUENCE_PATTERN = /\\(?:r\\n|n\\n|r|n|t|u[0-9a-fA-F]{4})/u;

function decodeEscapedDisplayTextSinglePass(text: string): string {
  return JSON.parse(
    `"${text
      .replace(/"/gu, "\\\"")
      .replace(/\r/gu, "\\r")
      .replace(/\n/gu, "\\n")
      .replace(/\u2028/gu, "\\u2028")
      .replace(/\u2029/gu, "\\u2029")}"`,
  ) as string;
}

function shouldDecodeEscapedDisplayText(text: string): boolean {
  if (!ESCAPED_DISPLAY_SEQUENCE_PATTERN.test(text)) {
    return false;
  }
  if (/\\u[0-9a-fA-F]{4}/u.test(text)) {
    return true;
  }
  if (/\\r\\n|\\n\\n|\\t/u.test(text)) {
    return true;
  }
  const matches = text.match(/\\(?:r\\n|n\\n|r|n|t|u[0-9a-fA-F]{4})/gu) ?? [];
  return matches.length >= 2;
}

export function decodeEscapedDisplayTextMaybe(text: string): string {
  if (!shouldDecodeEscapedDisplayText(text)) {
    return text;
  }

  const preservedPaths: string[] = [];
  let withProtectedPaths = "";
  let index = 0;

  while (index < text.length) {
    const current = text[index];
    const next = text[index + 1];
    const third = text[index + 2];
    const startsWindowsPath = (
      /[A-Za-z]/u.test(current ?? "")
      && next === ":"
      && third === "\\"
    );

    if (!startsWindowsPath) {
      withProtectedPaths += current;
      index += 1;
      continue;
    }

    let cursor = index + 3;
    let path = text.slice(index, cursor);
    let consumedSeparator = false;

    while (cursor < text.length) {
      const char = text[cursor];
      if (/\s/u.test(char ?? "")) {
        break;
      }
      if (char !== "\\") {
        path += char;
        cursor += 1;
        continue;
      }

      const escapeLead = text[cursor + 1];
      const escapeTail = text[cursor + 2];
      const looksDisplayEscape = (
        (escapeLead === "n" || escapeLead === "r" || escapeLead === "t")
        && (
          escapeTail === "\\"
          || escapeTail === undefined
          || /\s/u.test(escapeTail)
          || /[\u2e80-\u9fff]/u.test(escapeTail)
          || /[)\]}>,.;!?:"']/u.test(escapeTail)
        )
      ) || (
        escapeLead === "u"
        && /^[0-9a-fA-F]{4}$/u.test(text.slice(cursor + 2, cursor + 6))
      );

      if (looksDisplayEscape) {
        break;
      }

      consumedSeparator = true;
      path += "\\";
      cursor += 1;
    }

    if (!consumedSeparator) {
      withProtectedPaths += current;
      index += 1;
      continue;
    }

    const token = `__RAXODE_ESCAPED_PATH_${preservedPaths.length}__`;
    preservedPaths.push(path);
    withProtectedPaths += token;
    index = cursor;
  }

  let decoded = withProtectedPaths;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!shouldDecodeEscapedDisplayText(decoded)) {
      break;
    }
    try {
      const next = decodeEscapedDisplayTextSinglePass(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      break;
    }
  }

  return preservedPaths.reduce(
    (value, preserved, pathIndex) => value.replace(`__RAXODE_ESCAPED_PATH_${pathIndex}__`, preserved),
    decoded,
  );
}
