# CodeCausality Roadmap

## v0.1 — Change Graph Foundation

- deterministic local scanner
- JavaScript/TypeScript AST relationship extraction
- internal dependency graph
- external usage references (no package intelligence)
- circular dependency detection
- structural hotspot score
- file-level blast radius
- affected-test discovery
- CLI / JSON / Mermaid output
- CI, coverage and Sonar-ready configuration

## v0.2 — Git Change Intelligence

- compare working tree / git refs
- aggregate blast radius across changed files
- churn and last-touch ownership
- CODEOWNERS enrichment
- changed-file risk ranking
- `codecausality impact --since <ref>`

## v0.3 — PR Intelligence

- GitHub Action
- PR impact summary
- recommended test surface
- architecture boundary warnings
- evidence links for reviewers

## v0.4 — Developer Surfaces

- VS Code extension
- interactive graph and impact explorer
- MCP adapter
- compact AI context bundles

## v1.0 — Change Intelligence Platform

- multi-language analyzers
- cross-repository relationships
- repository ownership/history model
- policy and architecture guardrails
- optional evidence-backed AI explanations
