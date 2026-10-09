# CodeCausality V1 — VS Code Marketplace Launch

## Product promise

> **Trace change. Understand impact.**

V1 is sold as a standalone repository/change-intelligence extension.

### V1 customer-facing scope

- current-file impact
- working-tree impact
- blast radius
- affected files/modules
- recommended tests
- architecture guardrails
- CODEOWNERS and Git history evidence
- interactive impact graph
- local-first analysis

### Not marketed in V1

The repository keeps technical provisions for future products, but the Marketplace V1 page does not sell:

- MCP integration
- AI context bundles
- Copilot Toolkit integration
- agents or AI workflows

These belong to V2/V3 positioning.

## Repository readiness

- [x] Extension version set to `1.0.1`.
- [x] V1 Marketplace description and keywords.
- [x] V1-only Marketplace README.
- [x] 1.0.1 changelog.
- [x] LICENSE packaged.
- [x] SUPPORT packaged.
- [x] PRIVACY packaged.
- [x] No custom telemetry in V1.
- [x] Workspace trust declared unsupported.
- [x] Getting Started walkthrough.
- [x] VSIX packaging workflow.
- [x] CI verifies the generated VSIX.

## External launch blockers

### 1. Publisher

Confirm or create the Marketplace publisher ID:

```text
aetherexa
```

Publisher IDs cannot be renamed later, so confirm the identifier before first publication.

Marketplace publisher management:
https://marketplace.visualstudio.com/manage/publishers/

### 2. Extension icon

Create a production PNG icon:

- PNG, not SVG
- at least 128×128
- readable at small sizes
- transparent or clean solid background
- visually consistent with Aetherexa / CodeCausality branding

Then add:

```json
"icon": "media/icon.png"
```

to `packages/vscode/package.json`.

### 3. Marketplace screenshots

Capture from the final VSIX build:

1. Impact Explorer — current-file analysis.
2. Working-tree analysis summary.
3. Interactive impact graph.
4. Recommended tests + architecture guardrail evidence.

Do not show proprietary source code or internal company repositories.

### 4. Publishing authentication

The VSIX can be uploaded manually from the Marketplace publisher portal for the first release.

For automated publishing, prefer Microsoft Entra ID based automation rather than building new long-lived PAT automation. Microsoft has announced retirement of Azure DevOps global PATs on December 1, 2026.

## Final release rehearsal

1. Merge the V1 release PR.
2. Run the **VS Code Package** workflow manually.
3. Download the generated `codecausality-1.0.1.vsix`.
4. Install it into a clean VS Code profile.
5. Open a public/sample JavaScript or TypeScript repository.
6. Complete the Getting Started walkthrough.
7. Test **Analyze Current File**.
8. Test **Analyze Working Tree**.
9. Click graph/list evidence and verify navigation.
10. Verify untrusted workspace behavior.
11. Verify no network/API key/account is required for analysis.
12. Review Marketplace README rendering.
13. Capture final screenshots.
14. Add the production icon and repackage if not already included.
15. Publish from the confirmed `aetherexa` publisher.

## Post-launch signals

For V1, validate the product hypothesis before expanding features:

- installs
- active users only if a privacy-respecting telemetry strategy is deliberately introduced later
- GitHub stars
- issue volume and categories
- qualitative developer feedback
- repeated requests for language support
- repeated requests for CI/PR or AI integration

Do not expand the V1 feature surface solely because V2/V3 infrastructure already exists in the repository.
