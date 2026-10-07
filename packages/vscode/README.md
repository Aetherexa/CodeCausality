# CodeCausality — Change Impact Intelligence

**Trace change. Understand impact.**

CodeCausality brings deterministic change-impact intelligence directly into VS Code. Before you edit, review, or merge code, inspect the likely blast radius without uploading the repository to an AI provider.

## Highlights

- **Analyze Current File** — calculate direct and transitive downstream impact for the active source file.
- **Analyze Working Tree** — detect changed Git source files and analyze their combined blast radius.
- **Interactive Impact Graph** — visualize change propagation and open evidence directly from graph nodes.
- **Graph Focus Controls** — search by path and filter changed, affected, or test nodes.
- **Recommended Tests** — surface graph-derived and deterministic heuristic test recommendations.
- **Architecture Guardrails** — highlight configured dependency-boundary violations.
- **Ownership & History** — show CODEOWNERS and Git churn/last-touch evidence.
- **Local-first** — baseline analysis is deterministic and consumes no LLM tokens.

## Quick start

1. Open a Git repository in VS Code.
2. Open **Explorer → CodeCausality Impact**.
3. Choose **Current file** or **Working tree**.
4. Review risk, affected files/modules, recommended tests, architecture violations, and the impact graph.
5. Click any evidence path or graph node to open the corresponding file.

The same commands are also available from the Command Palette:

- `CodeCausality: Analyze Current File`
- `CodeCausality: Analyze Working Tree`

## Repository configuration

CodeCausality reads `.codecausality.json` from the workspace root.

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

## Privacy and cost

The VS Code extension reuses the local `@codecausality/core` engine. Baseline analysis reads repository files and local Git metadata on the developer machine. It does not require an LLM provider, API key, cloud agent, or token budget.

## Current language depth

The initial relationship analyzer is strongest for JavaScript and TypeScript repositories. The normalized CodeCausality graph model is designed for additional language analyzers in later releases.

## Install from VSIX

A packaged build can be installed manually:

```bash
code --install-extension codecausality-0.1.0.vsix
```

Or use **Extensions → … → Install from VSIX…** inside VS Code.

## Development

From the repository root:

```bash
npm install
npm run build -w codecausality
npm run typecheck -w codecausality
npm run package:vscode
```

## Links

- Repository: https://github.com/Aetherexa/CodeCausality
- Issues: https://github.com/Aetherexa/CodeCausality/issues
- Architecture: https://github.com/Aetherexa/CodeCausality/blob/main/docs/ARCHITECTURE.md

## License

MIT
