# Impact Report Schema

CodeCausality Git-aware analysis emits a versioned JSON report. The current schema version is `1.0`.

Generate and persist a report with:

```bash
codecausality impact --since main --format json --output .codecausality/impact.json
```

## Top-level contract

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-10-07T00:00:00.000Z",
  "repositoryRoot": "/workspace/repository",
  "changeSet": {
    "mode": "ref",
    "baseRef": "main",
    "files": ["src/ui/QuotePage.tsx"]
  },
  "ignoredFiles": [],
  "impact": {
    "targets": ["src/ui/QuotePage.tsx"],
    "foundTargets": ["src/ui/QuotePage.tsx"],
    "missingTargets": [],
    "affectedFiles": ["src/ui/QuotePage.tsx"],
    "affectedTests": [],
    "affectedModules": [],
    "rankedTargets": [],
    "impactScore": 12,
    "riskLevel": "LOW"
  },
  "ownership": [],
  "history": [],
  "architectureViolations": [],
  "recommendedTests": [
    {
      "path": "src/ui/__tests__/QuotePage.test.tsx",
      "confidence": "high",
      "reasons": ["matching-source-name"]
    }
  ]
}
```

## Test recommendation evidence

Recommendations are deterministic and currently use three evidence classes:

- `dependency-graph` — the test is already inside the computed dependency blast radius.
- `matching-source-name` — the test name matches an affected source file.
- `same-module` — the test is colocated with an affected source module.

Graph and matching-name evidence are high confidence. Module proximity is medium confidence.

## Architecture evidence

Architecture violations are generated from directional dependency rules configured in `.codecausality.json`. Git-aware reports include only violations whose source file is inside the current affected surface, preventing unrelated legacy violations from polluting the current change report.

## Compatibility policy

Consumers must inspect `schemaVersion`. Additive fields may be introduced within the same major schema version. Breaking field removals or semantic changes require a new major schema version.

The report contains source/change intelligence only. Package version, compatibility, deprecation and dependency-health information remains outside this schema and belongs to DrJSON.
