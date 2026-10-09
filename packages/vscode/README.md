# CodeCausality — Change Impact Intelligence

> **Trace change. Understand impact.**

CodeCausality helps you understand how a repository is connected and what a code change could affect **before you ship it**.

It runs locally inside VS Code and turns source relationships, Git changes, tests, architecture rules, ownership, and history into practical change-impact evidence.

## Why CodeCausality?

Changing one file rarely affects only one file.

Before a refactor, bug fix, or review, developers often have to manually answer:

- What depends on this file?
- Which modules could be affected?
- Which tests should I run?
- Does this change cross an architecture boundary?
- Who owns the affected code?
- Is this a historically risky area?

CodeCausality brings those signals together inside VS Code.

## V1 highlights

### Analyze the current file

Open a source file and run:

```text
CodeCausality: Analyze Current File
```

See its direct and transitive blast radius, affected modules, recommended tests, architecture evidence, ownership, and history.

### Analyze your working tree

Run:

```text
CodeCausality: Analyze Working Tree
```

CodeCausality detects your current Git changes and shows their combined impact.

### Interactive impact graph

Explore how a change propagates through the repository:

- changed files
- downstream affected files
- affected tests
- dependency edges
- path search
- changed / affected / test filters
- click-to-open navigation

### Recommended tests

CodeCausality combines dependency-graph evidence with deterministic matching heuristics to identify tests that are likely relevant to the change.

### Architecture guardrails

Optional rules in `.codecausality.json` let you flag forbidden dependency directions such as UI code directly reaching a data layer.

### Ownership and history

When available, CodeCausality surfaces:

- CODEOWNERS
- Git commit count
- churn
- last-touch author

## Quick start

1. Install CodeCausality.
2. Open a JavaScript or TypeScript Git repository.
3. Open **Explorer → CodeCausality Impact**.
4. Choose **Current file** or **Working tree**.
5. Follow the evidence before making or shipping the change.

You can also run:

```text
CodeCausality: Getting Started
```

from the Command Palette.

## Repository configuration

Create `.codecausality.json` in the repository root when you need custom exclusions or architecture boundaries.

```json
{
  "ignore": ["generated/**", "vendor/**"],
  "moduleDepth": 2,
  "architecture": {
    "boundaries": [
      {
        "name": "ui-must-not-access-data",
        "from": ["src/ui/**"],
        "disallow": ["src/data/**"],
        "severity": "error"
      }
    ]
  }
}
```

Configuration is optional. CodeCausality works without it.

## Privacy

CodeCausality V1 is local-first:

- no account required
- no API key required
- no repository upload
- no telemetry collected by CodeCausality
- no analytics service
- no LLM or cloud dependency for V1 analysis

The extension reads workspace source files and local Git metadata only to produce change-impact intelligence in your editor.

See [PRIVACY.md](PRIVACY.md) for the complete V1 privacy statement.

## Workspace trust

CodeCausality does not run repository analysis in VS Code untrusted workspaces. Trust the workspace before running analysis.

## Language support

V1 relationship analysis is strongest for:

- JavaScript
- TypeScript
- JSX
- TSX

The graph model is designed to support more language analyzers in later releases, but V1 Marketplace positioning is intentionally focused on the experience we can support well today.

## Install from VSIX

For manual testing before Marketplace publication:

```bash
code --install-extension codecausality-1.0.1.vsix
```

Or use **Extensions → … → Install from VSIX…** inside VS Code.

## Support

Use the GitHub issue tracker for bugs and feature requests.

See [SUPPORT.md](SUPPORT.md).

## Links

- Repository: https://github.com/Aetherexa/CodeCausality
- Issues: https://github.com/Aetherexa/CodeCausality/issues
- Architecture: https://github.com/Aetherexa/CodeCausality/blob/main/docs/ARCHITECTURE.md

## License

MIT
