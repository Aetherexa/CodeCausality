# CodeCausality V1 Privacy

CodeCausality V1 is designed to provide repository and change-impact intelligence locally inside VS Code.

## Data CodeCausality reads

When you ask CodeCausality to analyze a file or working tree, the extension may read:

- source files in the open VS Code workspace
- local Git change information
- local Git history metadata
- CODEOWNERS files
- `.codecausality.json`

This information is used to calculate source relationships, blast radius, affected tests/modules, architecture-boundary evidence, ownership, and history signals.

## Data CodeCausality sends

**CodeCausality V1 does not transmit repository source code, file contents, Git metadata, analysis results, or usage telemetry to Aetherexa or to a third-party analytics service.**

V1 does not require:

- an Aetherexa account
- an API key
- an AI/LLM provider
- a cloud backend
- an analytics service

## Telemetry

CodeCausality V1 does not implement product telemetry or custom analytics.

VS Code itself may collect telemetry according to the user's VS Code configuration and Microsoft's privacy policies. That VS Code telemetry is separate from CodeCausality.

## Network access

The CodeCausality V1 runtime does not require network access for repository analysis.

Installing or updating the extension through the Visual Studio Marketplace is handled by VS Code/Marketplace infrastructure and is separate from CodeCausality's analysis runtime.

## Workspace trust

CodeCausality declares untrusted workspaces unsupported because repository analysis reads workspace files and local Git metadata. VS Code must trust the workspace before the extension performs analysis.

## Future versions

If a future CodeCausality version introduces an optional cloud, AI, MCP-hosted, or telemetry-enabled feature, its data behavior will be documented before that capability is enabled for users.

Last updated: October 7, 2026.
