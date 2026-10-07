# CodeCausality Backlog

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
- [ ] Verify/create the `aetherexa` Visual Studio Marketplace publisher.
- [ ] Publish the first Preview release after publisher authentication is configured.


## Sprint 5 — MCP adapter

- [x] Add thin `@codecausality/mcp` workspace.
- [x] Use the current MCP TypeScript server SDK v2.
- [x] Expose repository scan, file impact, working-tree impact and ref impact tools.
- [x] Default to compact bounded evidence responses.
- [x] Serve over stdio without LLM/token dependency.
- [x] Keep ForgeMCP as the reusable MCP framework boundary.
- [ ] Add MCP resources for persisted impact reports.
- [ ] Add host integration examples for VS Code, Claude Code and Cursor.


## Sprint 6 — Compact AI context bundles

- [x] Add versioned context-bundle schema.
- [x] Add deterministic character budget.
- [x] Prioritize changed files, architecture violations, recommended tests and test evidence.
- [x] Add truncation metadata and regression tests.
- [x] Add CLI context-bundle export.
- [x] Add MCP context-bundle tool.
- [ ] Add optional bounded source snippets.
- [ ] Integrate the bundle with Copilot Toolkit context workflows.
