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
  "generatedAt": "2026-10-06T00:00:00.000Z",
  "repositoryRoot": "/workspace/repository",
  "changeSet": {
    "mode": "ref",
    "baseRef": "main",
    "files": ["src/pricing.ts"]
  },
  "ignoredFiles": [],
  "impact": {
    "targets": ["src/pricing.ts"],
    "foundTargets": ["src/pricing.ts"],
    "missingTargets": [],
    "affectedFiles": ["src/pricing.ts", "src/quote.ts"],
    "affectedTests": ["src/__tests__/quote.test.ts"],
    "affectedModules": [],
    "rankedTargets": [],
    "impactScore": 32,
    "riskLevel": "MEDIUM"
  },
  "ownership": [
    {
      "file": "src/pricing.ts",
      "owners": ["@pricing-team"],
      "matchedPattern": "/src/pricing.ts"
    }
  ],
  "history": [
    {
      "file": "src/pricing.ts",
      "commitCount": 14,
      "additions": 120,
      "deletions": 38,
      "churn": 158,
      "lastCommitSha": "abc123",
      "lastAuthor": "Developer",
      "lastAuthorEmail": "developer@example.com",
      "lastCommitDate": "2026-10-05T12:00:00+00:00"
    }
  ]
}
```

## Compatibility policy

Consumers must inspect `schemaVersion`. Additive fields may be introduced within the same major schema version. Breaking field removals or semantic changes require a new major schema version.

The report contains source/change intelligence only. Package version, compatibility, deprecation and dependency-health information remains outside this schema and belongs to DrJSON.
