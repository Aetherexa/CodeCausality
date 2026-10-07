import { describe, expect, it } from 'vitest';
import { recommendTests } from '../src/index.js';
import type { ChangeSetImpactSummary, RepositorySnapshot } from '../src/index.js';

function snapshot(): RepositorySnapshot {
  return {
    generatedAt: new Date(0).toISOString(),
    rootDir: '/repo',
    totals: {
      files: 5,
      sourceFiles: 5,
      lines: 0,
      codeLines: 0,
      todos: 0,
      internalEdges: 0,
      externalReferences: 0,
    },
    files: [
      metric('src/services/pricing.ts', false),
      metric('src/services/quote.ts', false),
      metric('src/services/__tests__/pricing.test.ts', true),
      metric('src/services/__tests__/quote.test.ts', true),
      metric('src/other/__tests__/unrelated.test.ts', true),
    ],
    dependencies: [],
    externalReferences: [],
    circularDependencies: [],
    hotspots: [],
  };
}

function impact(): ChangeSetImpactSummary {
  return {
    targets: ['src/services/pricing.ts'],
    foundTargets: ['src/services/pricing.ts'],
    missingTargets: [],
    affectedFiles: ['src/services/pricing.ts', 'src/services/quote.ts'],
    affectedTests: ['src/services/__tests__/quote.test.ts'],
    affectedModules: [],
    rankedTargets: [],
    impactScore: 20,
    riskLevel: 'LOW',
  };
}

function metric(filePath: string, isTest: boolean) {
  return {
    path: filePath,
    extension: '.ts',
    lines: 0,
    codeLines: 0,
    todoCount: 0,
    fanIn: 0,
    fanOut: 0,
    riskScore: 0,
    isTest,
  };
}

describe('test recommendations', () => {
  it('keeps dependency-graph tests at high confidence', () => {
    const result = recommendTests(snapshot(), impact());

    expect(result).toContainEqual(
      expect.objectContaining({
        path: 'src/services/__tests__/quote.test.ts',
        confidence: 'high',
        reasons: expect.arrayContaining(['dependency-graph']),
      }),
    );
  });

  it('recommends matching-name tests even when the graph does not connect them', () => {
    const result = recommendTests(snapshot(), impact());

    expect(result).toContainEqual(
      expect.objectContaining({
        path: 'src/services/__tests__/pricing.test.ts',
        confidence: 'high',
        reasons: expect.arrayContaining(['matching-source-name']),
      }),
    );
  });

  it('does not recommend unrelated-module tests', () => {
    const result = recommendTests(snapshot(), impact());

    expect(result.some((test) => test.path.includes('unrelated.test.ts'))).toBe(false);
  });
});
