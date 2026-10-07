# CodeCausality Roadmap

## v0.1 — Change Graph Foundation

- deterministic local scanner
- JavaScript/TypeScript AST relationship extraction
- internal dependency graph
- circular dependency detection
- structural hotspot score
- file-level blast radius
- affected-test discovery
- CLI / JSON / Mermaid output
- CI and coverage

## v0.2 — Git & Repository Context Intelligence

- compare Git refs and current working tree
- aggregate blast radius across changed files
- risk-rank changed source files
- configurable repository ignore patterns
- module-level impact aggregation
- CODEOWNERS enrichment
- churn and last-touch evidence
- versioned persistent impact reports
- regression fixture repository

## v0.3 — PR Intelligence

- GitHub Action
- PR impact summary
- recommended test surface
- architecture boundary warnings
- evidence links for reviewers
- report artifact publishing

## v0.4 — Developer Surfaces

- VS Code extension (foundation implemented)
- interactive graph and impact explorer (impact explorer implemented; graph visualization next)
- MCP adapter (stdio tool foundation implemented)
- compact AI context bundles (core budgeted bundle contract started)

## v1.0 — Change Intelligence Platform

- multi-language analyzers
- cross-repository relationships
- repository ownership/history model
- policy and architecture guardrails
- optional evidence-backed AI explanations
