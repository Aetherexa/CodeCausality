export { analyzeRepository } from './analyzer.js';
export { analyzeImpact, analyzeChangeSetImpact } from './impact.js';
export { toMermaid } from './mermaid.js';
export type {
  AnalysisOptions,
  RepositorySnapshot,
  ImpactSummary,
  ChangeSetImpactSummary,
  ImpactRiskLevel,
  SourceFileMetric,
  DependencyEdge,
  ExternalReference,
  ImportKind,
} from './types.js';
