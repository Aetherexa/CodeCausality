import type { ArchitectureViolation } from './architecture.js';
import type { GitChangeSet, GitFileHistory } from './git.js';
import type { FileOwnership } from './ownership.js';
import type { RecommendedTest } from './testRecommendations.js';
import type { ChangeSetImpactSummary } from './types.js';

export const IMPACT_REPORT_SCHEMA_VERSION = '1.0';

export interface CodeCausalityImpactReport {
  schemaVersion: string;
  generatedAt: string;
  repositoryRoot: string;
  changeSet: GitChangeSet;
  ignoredFiles: string[];
  impact: ChangeSetImpactSummary;
  ownership: FileOwnership[];
  history: GitFileHistory[];
  architectureViolations: ArchitectureViolation[];
  recommendedTests: RecommendedTest[];
}

export function createImpactReport(input: {
  repositoryRoot: string;
  changeSet: GitChangeSet;
  ignoredFiles: string[];
  impact: ChangeSetImpactSummary;
  ownership?: FileOwnership[];
  history?: GitFileHistory[];
  architectureViolations?: ArchitectureViolation[];
  recommendedTests?: RecommendedTest[];
}): CodeCausalityImpactReport {
  return {
    schemaVersion: IMPACT_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repositoryRoot: input.repositoryRoot,
    changeSet: input.changeSet,
    ignoredFiles: [...input.ignoredFiles].sort(),
    impact: input.impact,
    ownership: [...(input.ownership ?? [])].sort((a, b) => a.file.localeCompare(b.file)),
    history: [...(input.history ?? [])].sort((a, b) => a.file.localeCompare(b.file)),
    architectureViolations: [...(input.architectureViolations ?? [])],
    recommendedTests: [...(input.recommendedTests ?? [])],
  };
}
