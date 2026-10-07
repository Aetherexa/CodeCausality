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

## Reviewer evidence links

The GitHub Step Summary is review-oriented. File evidence is linked against the exact checked-out commit so reviewers can navigate directly from the impact summary to repository evidence.

The summary links:

- changed source files
- downstream affected files
- recommended tests
- both sides of architecture-violation dependency edges
- last-touch Git commits for changed source files

This URL rendering belongs to the GitHub Action adapter. The versioned JSON report intentionally keeps repository-relative paths and commit SHAs so the core remains portable to GitLab, Azure DevOps, VS Code, MCP, and other future surfaces.

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

The consuming workflow must check out the repository before running CodeCausality. Use `fetch-depth: 0` so Git comparison and history evidence are available reliably.

The action is deterministic and does not require an LLM provider, API key, or token budget.
