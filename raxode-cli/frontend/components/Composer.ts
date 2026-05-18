import { Box, Text, useInput } from "ink";
import React, { useState } from "react";

import type { RaxodeApplicationAttachment } from "../../contracts.js";
import {
  readClipboardFileAttachments,
  readClipboardImageAttachment,
  readClipboardTextAttachment,
} from "../state/clipboardAttachments.js";
import { extractPastedFileAttachments } from "../state/composerAttachments.js";
import {
  applyTuiTextInputKey,
  createTuiTextInputState,
  insertIntoTuiTextInput,
  renderTuiTextInputCursor,
  setTuiTextInputValue,
} from "../tui-input/text-input.js";

const h = React.createElement;

export type RaxodeComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  prefill?: { nonce: number; value: string };
  sessionId?: string;
  onSubmit: (value: string, attachments: readonly RaxodeApplicationAttachment[]) => void;
};

export function RaxodeComposer(props: RaxodeComposerProps): React.ReactElement {
  const [inputState, setInputState] = useState(() => createTuiTextInputState());
  const [attachments, setAttachments] = useState<readonly RaxodeApplicationAttachment[]>([]);
  const [nextPasteIndex, setNextPasteIndex] = useState(1);

  React.useEffect(() => {
    if (!props.prefill) return;
    setInputState((previous) => setTuiTextInputValue(previous, props.prefill?.value ?? ""));
  }, [props.prefill?.nonce]);

  useInput((input, key) => {
    if (props.disabled) return;
    if (key.ctrl && input === "v") {
      void (async () => {
        const imageAttachment = await readClipboardImageAttachment({
          sessionId: props.sessionId,
          nextIndex: nextPasteIndex,
        });
        if (imageAttachment) {
          setNextPasteIndex((index) => index + 1);
          setAttachments((previous) => [...previous, imageAttachment]);
          setInputState((previous) => insertIntoTuiTextInput(previous, imageAttachment.tokenText ?? ""));
          return;
        }
        const providerFileAttachments = await readClipboardFileAttachments({ nextIndex: nextPasteIndex });
        if (providerFileAttachments.length > 0) {
          setNextPasteIndex((index) => index + providerFileAttachments.length);
          setAttachments((previous) => [...previous, ...providerFileAttachments]);
          setInputState((previous) => insertIntoTuiTextInput(
            previous,
            providerFileAttachments.map((attachment) => attachment.tokenText ?? `@${attachment.localPath}`).join(" "),
          ));
          return;
        }
        const pasted = await readClipboardTextAttachment({ nextIndex: nextPasteIndex });
        if (!pasted.text) return;
        const fileAttachments = extractPastedFileAttachments(pasted.text, process.cwd());
        if (fileAttachments.length > 0) {
          setAttachments((previous) => [...previous, ...fileAttachments]);
          setInputState((previous) => insertIntoTuiTextInput(
            previous,
            fileAttachments.map((attachment) => attachment.tokenText ?? `@${attachment.localPath}`).join(" "),
          ));
          return;
        }
        if (pasted.attachment) {
          setNextPasteIndex((index) => index + 1);
          setAttachments((previous) => [...previous, pasted.attachment as RaxodeApplicationAttachment]);
        }
        setInputState((previous) => insertIntoTuiTextInput(previous, pasted.text));
      })().catch(() => {
        // Clipboard providers are optional; failed paste should not break typing.
      });
      return;
    }
    const result = applyTuiTextInputKey(inputState, input, key);
    if (!result.handled) return;
    if (result.submit) {
      const value = result.nextState.value.trim();
      if (value.length > 0) {
        props.onSubmit(value, attachments);
      }
      setInputState(createTuiTextInputState());
      setAttachments([]);
      return;
    }
    setInputState(result.nextState);
  });

  const rendered = renderTuiTextInputCursor(inputState);
  const isEmpty = inputState.value.length === 0;

  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { color: "gray" }, "────────────────────────────────────────────────────────────────────────────────"),
    h(
      Box,
      null,
      h(Text, { color: "cyanBright" }, ">> "),
      isEmpty
        ? h(Text, { color: "gray" }, props.placeholder ?? "Type a message...")
        : h(Text, null,
          rendered.before,
          h(Text, { inverse: true }, rendered.cursor),
          rendered.after,
        ),
    ),
    h(Text, { color: "gray" }, "────────────────────────────────────────────────────────────────────────────────"),
  );
}
