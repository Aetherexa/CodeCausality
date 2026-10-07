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
  "architectureViolations": [
    {
      "ruleName": "ui-must-not-access-data",
      "severity": "error",
      "from": "src/ui/QuotePage.tsx",
      "to": "src/data/database.ts",
      "specifier": "../data/database.js",
      "kind": "static"
    }
  ]
}
```

## Architecture evidence

Architecture violations are generated from directional dependency rules configured in `.codecausality.json`. Git-aware reports include only violations whose source file is inside the current affected surface, preventing unrelated legacy violations from polluting the current change report.

## Compatibility policy

Consumers must inspect `schemaVersion`. Additive fields may be introduced within the same major schema version. Breaking field removals or semantic changes require a new major schema version.

The report contains source/change intelligence only. Package version, compatibility, deprecation and dependency-health information remains outside this schema and belongs to DrJSON.
