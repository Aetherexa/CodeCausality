export { analyzeRepository } from './analyzer.js';
export { analyzeImpact, analyzeChangeSetImpact } from './impact.js';
export { getGitChangedFiles } from './git.js';
export { toMermaid } from './mermaid.js';
export type {
  AnalysisOptions,
  RepositorySnapshot,
  ImpactSummary,
  ChangeSetImpactSummary,
  RankedTargetImpact,
  ImpactRiskLevel,
  SourceFileMetric,
  DependencyEdge,
  ExternalReference,
  ImportKind,
} from './types.js';
export type { GitChangedFilesOptions, GitChangeSet } from './git.js';
