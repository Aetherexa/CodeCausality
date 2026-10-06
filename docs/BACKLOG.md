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

### P0

- [ ] Add git changed-file provider.
- [ ] Add `impact --since <ref>` CLI workflow.
- [ ] Rank changed files by blast radius.
- [ ] Add fixture repository for regression coverage.
- [ ] Add persisted JSON report output.
- [ ] Add configurable ignore patterns.

### P1

- [ ] Add churn and last-touch metadata.
- [ ] Add CODEOWNERS parsing.
- [ ] Add module/directory aggregation.
- [ ] Add architecture boundary configuration.
- [ ] Add richer test mapping heuristics.
