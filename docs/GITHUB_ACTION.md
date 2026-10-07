# CodeCausality GitHub Action

The reusable CodeCausality action runs the same deterministic change-intelligence engine used by the CLI.

## Pull request workflow

Create `.github/workflows/codecausality.yml` in a consuming repository:

```yaml
name: CodeCausality

on:
  pull_request:

permissions:
  contents: read

jobs:
  impact:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Analyze change impact
        id: codecausality
        uses: Aetherexa/CodeCausality@main
        with:
          fail-on-architecture-error: 'true'

      - name: Upload impact report
        uses: actions/upload-artifact@v4
        with:
          name: codecausality-impact
          path: .codecausality/impact.json
```

## Outputs

The action exposes:

- `impact-score`
- `risk-level`
- `architecture-errors`
- `recommended-tests`
- `report-path`

Example:

```yaml
- name: Read CodeCausality outputs
  run: |
    echo "Risk: ${{ steps.codecausality.outputs.risk-level }}"
    echo "Score: ${{ steps.codecausality.outputs.impact-score }}"
```

## Architecture enforcement

When `fail-on-architecture-error: 'true'`, CodeCausality exits non-zero if any relevant configured architecture violation has severity `error`.

Warnings remain visible in the report and GitHub Step Summary but do not fail the workflow.

## Requirements

The consuming workflow must check out the repository before running CodeCausality. Use `fetch-depth: 0` so Git comparison data is available reliably.

The action is deterministic and does not require an LLM provider, API key, or token budget.
