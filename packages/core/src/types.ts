export interface AnalysisOptions {
  rootDir: string;
  maxFiles?: number;
  ignorePatterns?: string[];
}

export type ImportKind = 'static' | 'dynamic' | 'require';

export interface DependencyEdge {
  from: string;
  to: string;
  specifier: string;
  kind: ImportKind;
}

export interface ExternalReference {
  from: string;
  specifier: string;
  packageName: string;
  kind: ImportKind;
}

export interface SourceFileMetric {
  path: string;
  extension: string;
  lines: number;
  codeLines: number;
  todoCount: number;
  fanIn: number;
  fanOut: number;
  riskScore: number;
  isTest: boolean;
}

export interface RepositorySnapshot {
  generatedAt: string;
  rootDir: string;
  totals: {
    files: number;
    sourceFiles: number;
    lines: number;
    codeLines: number;
    todos: number;
    internalEdges: number;
    externalReferences: number;
  };
  files: SourceFileMetric[];
  dependencies: DependencyEdge[];
  externalReferences: ExternalReference[];
  circularDependencies: string[][];
  hotspots: SourceFileMetric[];
}

export type ImpactRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ImpactSummary {
  target: string;
  found: boolean;
  directDependencies: string[];
  directDependents: string[];
  transitiveDependents: string[];
  affectedFiles: string[];
  affectedTests: string[];
  impactScore: number;
  riskLevel: ImpactRiskLevel;
  targetRiskScore?: number;
  evidence: string[];
}

export interface RankedTargetImpact {
  target: string;
  impactScore: number;
  riskLevel: ImpactRiskLevel;
  affectedFiles: number;
  affectedTests: number;
}

export interface ModuleImpactSummary {
  module: string;
  changedFiles: string[];
  affectedFiles: string[];
  affectedTests: string[];
}

export interface ChangeSetImpactSummary {
  targets: string[];
  foundTargets: string[];
  missingTargets: string[];
  affectedFiles: string[];
  affectedTests: string[];
  affectedModules: ModuleImpactSummary[];
  rankedTargets: RankedTargetImpact[];
  impactScore: number;
  riskLevel: ImpactRiskLevel;
}

export interface ChangeSetImpactOptions {
  moduleDepth?: number;
}
