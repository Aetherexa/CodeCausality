export { analyzeRepository } from './analyzer.js';
export { findArchitectureViolations } from './architecture.js';
export { loadCodeCausalityConfig } from './config.js';
export { analyzeImpact, analyzeChangeSetImpact } from './impact.js';
export { getGitChangedFiles, getGitFileHistory } from './git.js';
export {
  loadCodeOwners,
  parseCodeOwners,
  resolveCodeOwners,
} from './ownership.js';
export {
  createImpactReport,
  IMPACT_REPORT_SCHEMA_VERSION,
} from './report.js';
export { toMermaid } from './mermaid.js';
export type {
  ArchitectureBoundaryRule,
  ArchitectureViolation,
  ArchitectureViolationSeverity,
} from './architecture.js';
export type {
  AnalysisOptions,
  RepositorySnapshot,
  ImpactSummary,
  ChangeSetImpactSummary,
  ChangeSetImpactOptions,
  RankedTargetImpact,
  ModuleImpactSummary,
  ImpactRiskLevel,
  SourceFileMetric,
  DependencyEdge,
  ExternalReference,
  ImportKind,
} from './types.js';
export type { CodeCausalityConfig } from './config.js';
export type { GitChangedFilesOptions, GitChangeSet, GitFileHistory } from './git.js';
export type { CodeOwnerRule, FileOwnership } from './ownership.js';
export type { CodeCausalityImpactReport } from './report.js';
