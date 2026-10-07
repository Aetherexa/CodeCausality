# CodeCausality for VS Code

This package is the first CodeCausality developer surface. It reuses `@codecausality/core` directly and does not introduce a second analysis engine.

## Current capabilities

- **Analyze Current File** — computes blast radius for the active source file.
- **Analyze Working Tree** — detects changed Git source files and analyzes their combined impact.
- **Impact Explorer** — shows risk, affected files/modules, recommended tests, architecture violations, CODEOWNERS and Git-history evidence.
- **Evidence navigation** — click a file/test/violation path to open it directly in VS Code.

Baseline analysis is local and deterministic. No LLM provider or token consumption is required.

## Development

```bash
npm install
npm run build -w @codecausality/vscode
npm run typecheck -w @codecausality/vscode
```

Open the repository in VS Code and launch an Extension Development Host with the extension package as the development extension.
