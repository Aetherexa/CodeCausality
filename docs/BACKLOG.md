# CodeCausality Backlog

## V1.0.0 — Marketplace launch

### Product scope freeze

- [x] V1 positioning: repository and change-impact intelligence.
- [x] Keep MCP, AI context bundles, and Copilot Toolkit integrations out of V1 Marketplace positioning.
- [x] Version extension as 1.0.0.
- [x] Add V1 onboarding walkthrough.
- [x] Add workspace-trust protection.
- [x] Add V1 privacy/no-telemetry statement.
- [x] Add support policy.
- [x] Rewrite Marketplace README for V1.
- [x] Add V1 release checklist.
- [ ] Confirm/create Marketplace publisher `aetherexa`.
- [ ] Add production PNG icon (>=128x128).
- [ ] Capture final Marketplace screenshots from the packaged build.
- [ ] Run clean-profile VSIX release rehearsal.
- [ ] Publish V1.

## Sprint 0 — Foundation

- [x] Finalize CodeCausality product boundary.
- [x] Separate package intelligence from DrJSON ownership.
- [x] Create `core` and `cli` workspaces.
- [x] Add deterministic repository discovery.
- [x] Add JS/TS AST relationship extraction.
- [x] Add internal and external usage reference models.
- [x] Add cycle analysis and structural metrics.
- [x] Add file-level blast radius and affected-test discovery.
- [x] Add tests, CI and Sonar-ready config.
- [ ] Generate and commit the npm lockfile from a networked environment.
- [ ] Configure branch protection / required checks.
- [ ] Connect SonarCloud project and quality gate.

## Sprint 1 — Git-aware impact

- [x] Add git changed-file provider.
- [x] Add `impact --since <ref>` and `impact --working-tree` CLI workflows.
- [x] Rank changed files by blast radius.
- [x] Add fixture repository for regression coverage.

## Sprint 2 — Repository context and reporting

### P0

- [x] Add configurable ignore patterns through `.codecausality.json`.
- [x] Add persisted JSON output with `--output`.
- [x] Add stable impact report schema version.
- [x] Add module/directory aggregation.

### P1

- [x] Add CODEOWNERS parsing and ownership resolution.
- [x] Add Git churn and last-touch metadata.
- [x] Include ownership/history evidence in Git-aware output.

## Sprint 3 — PR intelligence

- [x] Add architecture boundary configuration.
- [x] Add richer affected-test mapping heuristics.
- [x] Add GitHub Action.
- [x] Generate PR impact summary.
- [x] Publish recommended test surface.
- [x] Add evidence links for reviewers.

## Sprint 4 — VS Code developer surface

- [x] Add VS Code extension workspace.
- [x] Add Impact Explorer webview.
- [x] Analyze the active source file.
- [x] Analyze the current Git working tree.
- [x] Render risk, affected files/modules, recommended tests and architecture violations.
- [x] Open evidence files directly from the explorer.
- [x] Include extension typecheck and bundle in monorepo quality gates.
- [x] Add interactive dependency graph visualization.
- [x] Add selection/focus controls for large impact graphs.
- [x] Package the extension for Marketplace distribution.

## Future — V2/V3 integration capabilities

These capabilities may exist in the repository but are intentionally not part of the V1 Marketplace promise.

### V2 candidates

- MCP distribution/integration.
- AI context bundles.
- Optional bounded source snippets.
- MCP resources and host examples.

### V3 candidates

- Copilot Toolkit integration.
- Automated context selection/workflow orchestration.
- Broader Aetherexa intelligence composition.

## Infrastructure hardening

- [ ] Confirm/create the `aetherexa` Visual Studio Marketplace publisher.
- [ ] Publish the first V1 release after publisher authentication is configured.
- [ ] Add MCP resources for persisted impact reports when V2 work resumes.
- [ ] Add host integration examples for VS Code, Claude Code and Cursor when V2 work resumes.
