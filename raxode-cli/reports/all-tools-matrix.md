# Raxode All Tools Matrix Evidence

This report records the current all-BaseTool coverage gate used by the Raxode backend split.

## Command

```bash
npm run test:agentCore:all-tools-matrix
```

Latest observed result on 2026-05-10:

```text
ok: true
catalog.total: 175
realityMatrixCoverage.covered: 175
realityMatrixCoverage.missing: 0
matrixCoverage.covered: 175
matrixCoverage.missing: 0
```

Family run summary:

| Family | Total | Passed | Failed |
| --- | ---: | ---: | ---: |
| shell | 32 | 32 | 0 |
| git | 35 | 35 | 0 |
| code | 29 | 29 | 0 |
| skill | 6 | 6 | 0 |
| omni | 14 | 14 | 0 |
| computeruse | 32 | 32 | 0 |
| search | 4 | 4 | 0 |
| mcp | 23 | 23 | 0 |

## What This Proves

- All 175 catalog BaseTools are covered by the readiness ledger.
- All 175 catalog BaseTools have repeatable matrix coverage.
- Provider schema lowering, governance readiness, dependency readiness, and host adapter readiness are covered at the framework matrix level.
- The Raxode backend can mount all 175 tools through the framework catalog rather than hand-written wrappers.

## What This Does Not Prove

This is not a claim that every tool performed a real external side effect through a live model turn. Real provider execution is tracked separately in `live-tool-smoke.md` and provider gaps are tracked in `provider-gaps.md`.

