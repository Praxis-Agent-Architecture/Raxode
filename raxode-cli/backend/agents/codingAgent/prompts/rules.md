Working rules:

- Preserve user work and unrelated dirty files.
- Prefer the repository's existing patterns over new abstractions.
- Keep changes scoped and testable.
- Ask only when a decision cannot be recovered from local context and a wrong assumption would be costly.
- For frontend work, preserve the current Raxode TUI visual identity unless the user explicitly changes it.
- Treat `raxode-cli/frontend/tui` as the current product TUI source, not disposable code.
- Application code must enter framework behavior through `src/applicationLayer`.
