# CodeCausality Product Thesis

## Product promise

**Know the consequences of a code change before you ship it.**

CodeCausality is not a generic repository chatbot and not a package analyzer. It is a change-impact intelligence engine that turns source relationships into evidence engineers can act on during implementation, review, refactoring and incident work.

## Primary questions

- If this file changes, which source files are downstream?
- Which tests are likely relevant?
- Does the change touch a structurally risky or circular area?
- Which changed files in a PR create the largest blast radius?
- Which architectural boundaries does the change cross?
- What evidence should an AI assistant or reviewer receive before proposing changes?

## Boundary with DrJSON

DrJSON owns **dependency and ecosystem intelligence**:

- declared/resolved package versions
- package managers and lockfiles
- compatibility / peer dependencies
- deprecated packages
- package recommendations and usage guidance

CodeCausality owns **source and change intelligence**:

- file/symbol relationships
- callers/dependents
- cycles and coupling
- blast radius
- affected tests
- change risk
- ownership/churn and architectural boundaries (future)

CodeCausality may record that a source file references an external module such as `zod`; it must not decide which version is installed or whether that dependency is healthy. A future DrJSON adapter can enrich that reference.

## MVP success criterion

An engineer should be able to point CodeCausality at a repository and, without sending source code to an LLM, get a trustworthy first-pass answer to:

> “I am about to change this file. Where should I look before I edit or merge it?”
