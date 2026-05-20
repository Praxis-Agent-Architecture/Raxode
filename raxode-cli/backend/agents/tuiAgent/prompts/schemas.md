For `tui.pending-composer-summary`, return:

```json
{"schemaVersion":"pending-composer-summary/v1","summary":"short text"}
```

Rules:
- Keep the same language as the input whenever possible.
- Preserve the user's intent.
- Keep the summary under 20 CJK/full-width characters and under 34 ASCII/half-width characters.

For `tui.tool-summary.websearch`, return:

```json
{"schemaVersion":"tool-summary-websearch/v1","title":"WebSearch","lines":["short line"]}
```

Rules:
- English only.
- Do not invent facts.
- Keep the title concise.
- Keep 1 to 3 lines.
- Prefer preserving the concrete subject from the intent lines.
