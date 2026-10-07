import path from 'node:path';
import { normalizePath } from './fs.js';
import type { ChangeSetImpactSummary, RepositorySnapshot } from './types.js';

export type TestRecommendationConfidence = 'high' | 'medium';
export type TestRecommendationReason =
  | 'dependency-graph'
  | 'matching-source-name'
  | 'same-module';

export interface RecommendedTest {
  path: string;
  confidence: TestRecommendationConfidence;
  reasons: TestRecommendationReason[];
}

export function recommendTests(
  snapshot: RepositorySnapshot,
  impact: ChangeSetImpactSummary,
): RecommendedTest[] {
  const recommendations = new Map<string, RecommendedTest>();
  const affectedFiles = new Set(impact.affectedFiles);
  const affectedSources = snapshot.files
    .filter((file) => affectedFiles.has(file.path) && !file.isTest)
    .map((file) => normalizePath(file.path));
  const tests = snapshot.files.filter((file) => file.isTest).map((file) => normalizePath(file.path));

  for (const test of impact.affectedTests) {
    addRecommendation(recommendations, normalizePath(test), 'high', 'dependency-graph');
  }

  for (const test of tests) {
    const testStem = sourceStem(test);
    const testModule = moduleDirectoryForTest(test);

    for (const source of affectedSources) {
      if (testStem === sourceStem(source)) {
        addRecommendation(recommendations, test, 'high', 'matching-source-name');
        continue;
      }

      if (testModule === path.posix.dirname(source)) {
        addRecommendation(recommendations, test, 'medium', 'same-module');
      }
    }
  }

  return [...recommendations.values()]
    .map((item) => ({
      ...item,
      reasons: [...new Set(item.reasons)].sort(),
    }))
    .sort(
      (a, b) =>
        confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
        a.path.localeCompare(b.path),
    );
}

function addRecommendation(
  recommendations: Map<string, RecommendedTest>,
  testPath: string,
  confidence: TestRecommendationConfidence,
  reason: TestRecommendationReason,
): void {
  const existing = recommendations.get(testPath);
  if (!existing) {
    recommendations.set(testPath, {
      path: testPath,
      confidence,
      reasons: [reason],
    });
    return;
  }

  existing.reasons.push(reason);
  if (confidenceRank(confidence) > confidenceRank(existing.confidence)) {
    existing.confidence = confidence;
  }
}

function sourceStem(file: string): string {
  const base = path.posix.basename(normalizePath(file));
  return base
    .replace(/\.(?:test|spec)(?=\.)/i, '')
    .replace(/\.[^.]+$/, '');
}

function moduleDirectoryForTest(file: string): string {
  const directory = path.posix.dirname(normalizePath(file));
  return directory.endsWith('/__tests__')
    ? directory.slice(0, -'/__tests__'.length)
    : directory;
}

function confidenceRank(confidence: TestRecommendationConfidence): number {
  return confidence === 'high' ? 2 : 1;
}
