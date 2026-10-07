import { describe, expect, it } from 'vitest';
import {
  CONTEXT_BUNDLE_SCHEMA_VERSION,
  createContextBundle,
} from '../src/index.js';
import type { CodeCausalityImpactReport } from '../src/index.js';

function report(): CodeCausalityImpactReport {
  return {
    schemaVersion: '1.0',
    generatedAt: new Date(0).toISOString(),
    repositoryRoot: '/repo',
    changeSet: {
      mode: 'ref',
      baseRef: 'main',
      files: ['src/pricing.ts'],
    },
    ignoredFiles: [],
    impact: {
      targets: ['src/pricing.ts'],
      foundTargets: ['src/pricing.ts'],
      missingTargets: [],
      affectedFiles: Array.from({ length: 30 }, (_, index) => `src/affected-${index}.ts`),
      affectedTests: ['src/__tests__/pricing.test.ts'],
      affectedModules: [
        {
          module: 'src',
          changedFiles: ['src/pricing.ts'],
          affectedFiles: ['src/pricing.ts'],
          affectedTests: ['src/__tests__/pricing.test.ts'],
        },
      ],
      rankedTargets: [],
      impactScore: 67,
      riskLevel: 'HIGH',
    },
    ownership: [
      {
        file: 'src/pricing.ts',
        owners: ['@pricing-team'],
        matchedPattern: '/src/pricing.ts',
      },
    ],
    history: [
      {
        file: 'src/pricing.ts',
        commitCount: 12,
        additions: 100,
        deletions: 40,
        churn: 140,
        lastCommitSha: 'abcdef123456',
        lastAuthor: 'Developer',
      },
    ],
    architectureViolations: [
      {
        ruleName: 'ui-no-data',
        severity: 'error',
        from: 'src/pricing.ts',
        to: 'src/data/db.ts',
        specifier: './data/db.js',
        kind: 'static',
      },
    ],
    recommendedTests: [
      {
        path: 'src/__tests__/pricing.test.ts',
        confidence: 'high',
        reasons: ['dependency-graph'],
      },
    ],
  };
}

describe('context bundles', () => {
  it('prioritizes high-value evidence before general affected files', () => {
    const bundle = createContextBundle(report(), { maxChars: 2_500 });

    expect(bundle.schemaVersion).toBe(CONTEXT_BUNDLE_SCHEMA_VERSION);
    expect(bundle.focus.riskLevel).toBe('HIGH');
    expect(bundle.evidence.changedFiles).toEqual(['src/pricing.ts']);
    expect(bundle.evidence.architectureViolations).toHaveLength(1);
    expect(bundle.evidence.recommendedTests).toHaveLength(1);
  });

  it('enforces a deterministic serialized character budget', () => {
    const bundle = createContextBundle(report(), { maxChars: 1_500 });
    const size = JSON.stringify(bundle).length;

    expect(size).toBeLessThanOrEqual(1_500);
    expect(bundle.budget.maxChars).toBe(1_500);
    expect(bundle.budget.truncated).toBe(true);
    expect(bundle.evidence.affectedFiles.length).toBeLessThan(30);
  });

  it('uses a stable default budget', () => {
    const bundle = createContextBundle(report());

    expect(bundle.budget.maxChars).toBe(12_000);
    expect(bundle.budget.usedChars).toBe(JSON.stringify(bundle).length);
  });
});
