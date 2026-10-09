# Changelog

All notable changes to the CodeCausality VS Code extension are documented here.

## 1.0.4 — Modernized dashboard UX

- Refreshed the editor-tab UI with a cleaner VS Code-native dashboard hierarchy.
- Added risk-aware styling, metric cards, status pills, and a segmented analysis switcher.
- Added responsive evidence cards for affected files, tests, architecture guardrails, and history.
- Added visual graph zoom in/out, fit-to-width, reset, and drag-to-pan controls.
- Improved graph legends, filters, empty states, and responsive behavior without changing V1 analysis semantics.

## 1.0.3 — Current-file metric clarity

- Renamed the first Current File metric from `Changed` to `Target`.
- Added an explicit note explaining that Current File mode is a hypothetical impact analysis and does not require the file to be modified on disk.
- Kept `Changed` for Working Tree mode, where the metric represents actual Git changes.

## 1.0.2 — Editor tab experience

- Moved CodeCausality results from the narrow Activity Bar sidebar into a normal editor-area webview tab.
- Analyze Current File and Analyze Working Tree now open or reuse the CodeCausality Impact tab.
- Removed the dedicated sidebar/activity view to keep the extension UI focused.
- Expanded the impact layout for full-width graphs and four-column summary metrics.

## 1.0.1 — Launch candidate fixes

- Fixed Command Palette analysis commands so they automatically reveal the CodeCausality result surface.
- Added a dedicated CodeCausality Activity Bar container and icon.
- Kept the Marketplace PNG icon wired into the packaged VSIX.
- Improved local launch validation after the 1.0.0 internal release candidate.

## 1.0.0 — First public release

### Repository insight

- Added active-file change-impact analysis.
- Added Git working-tree change-impact analysis.
- Added direct and transitive blast-radius discovery.
- Added affected module and file summaries.
- Added structural risk scoring.

### Visual exploration

- Added the CodeCausality Impact Explorer.
- Added interactive change-propagation graph visualization.
- Added graph search and changed / affected / test filters.
- Added click-to-open evidence navigation.

### Change confidence

- Added deterministic recommended-test evidence.
- Added configurable architecture dependency guardrails.
- Added CODEOWNERS evidence.
- Added Git churn, commit-count, and last-touch evidence.

### Launch readiness

- Added V1 onboarding walkthrough.
- Added workspace-trust protection.
- Added explicit local-first/no-telemetry privacy documentation.
- Added Marketplace-ready VSIX packaging and validation.
