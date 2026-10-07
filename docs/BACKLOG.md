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
