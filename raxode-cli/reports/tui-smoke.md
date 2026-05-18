# Raxode TUI Smoke Evidence

This report tracks migrated TUI startup and interaction evidence through the new application-layer backend.

## Non-TTY Guard

Command:

```bash
npm run raxode:tui
```

When stdin is not an interactive TTY, the CLI returns exit code `2` and prints:

```text
Raxode TUI requires an interactive TTY.
```

This prevents Ink raw-mode stack traces in scripts, CI, or captured shell environments.

## Pseudo-TTY Startup

Command:

```bash
script -qfec 'timeout 8s npm run raxode:tui' /tmp/raxode-tui-smoke.log
```

Expected evidence in `/tmp/raxode-tui-smoke.log`:

```text
powered by Praxis
v0.1.0
Raxode                                                                 ready
raxode · standard · gpt-5.5/low · 175/175 tools
mountedTools=175
```

The `timeout` exit code is expected because this command only verifies that the interactive TUI enters raw-mode rendering without crashing.

## Tmux Input And Backspace Smoke

Command shape:

```bash
session=raxode_smoke_$(date +%s)
tmux new-session -d -s "$session" -c /home/proview/Desktop/Praxis_series/Praxis_org 'npm run raxode:tui'
tmux send-keys -t "$session" '/statusxxxx'
for i in 1 2 3 4; do tmux send-keys -t "$session" BSpace; done
tmux send-keys -t "$session" Enter
tmux capture-pane -p -S -200 -t "$session" > /tmp/raxode-tmux-status-full.txt
tmux send-keys -t "$session" '/exit' Enter
tmux kill-session -t "$session" 2>/dev/null || true
```

Expected evidence in `/tmp/raxode-tmux-status-full.txt`:

```text
powered by Praxis
Drag to select text, Ctrl+V to paste images, @ to choose files, / to choose
Status
tools 175/175
```

This verifies real TTY input, repeated backspace correction, slash panel opening, and application view propagation. It is not yet a full rendered-frame 120Hz benchmark.

## Mouse Report Filtering Smoke

Command shape:

```bash
session=raxode_mouse_filter_$(date +%s)
tmux new-session -d -s "$session" -c /home/proview/Desktop/Praxis_series/Praxis_org 'npm run raxode:tui'
tmux send-keys -t "$session" Escape '[<0;5;32M'
tmux capture-pane -p -S -120 -t "$session" > /tmp/raxode-mouse-filter.txt
```

Expected evidence:

```bash
! grep -q '\\[<0;5;32M' /tmp/raxode-mouse-filter.txt
```

This verifies terminal SGR mouse reports are filtered from the text composer instead of being inserted as visible input. Full click-to-action support still needs rendered row-offset binding.
