import path from 'node:path';
import {
  analyzeChangeSetImpact,
  analyzeImpact,
  analyzeRepository,
  createImpactReport,
  findArchitectureViolations,
  getGitChangedFiles,
  getGitFileHistory,
  loadCodeCausalityConfig,
  loadCodeOwners,
  recommendTests,
  resolveCodeOwners,
} from '@codecausality/core';

export interface ToolOptions {
  rootDir?: string;
  maxItems?: number;
}

export async function scanRepositoryForMcp(options: ToolOptions = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const maxItems = normalizeMaxItems(options.maxItems);
  const config = await loadCodeCausalityConfig(rootDir);
  const snapshot = await analyzeRepository({
    rootDir,
    ignorePatterns: config.ignore,
  });

  return {
    repositoryRoot: rootDir,
    generatedAt: snapshot.generatedAt,
    totals: snapshot.totals,
    circularDependencies: snapshot.circularDependencies.slice(0, maxItems),
    circularDependencyCount: snapshot.circularDependencies.length,
    hotspots: snapshot.hotspots.slice(0, Math.min(maxItems, 20)),
    externalPackageReferenceCount: snapshot.externalReferences.length,
  };
}

export async function analyzeFileForMcp(
  file: string,
  options: ToolOptions = {},
) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const maxItems = normalizeMaxItems(options.maxItems);
  const config = await loadCodeCausalityConfig(rootDir);
  const snapshot = await analyzeRepository({
    rootDir,
    ignorePatterns: config.ignore,
  });

  const detailedImpact = analyzeImpact(snapshot, file);
  const changeImpact = analyzeChangeSetImpact(snapshot, [file], {
    moduleDepth: config.moduleDepth,
  });
  const affected = new Set(changeImpact.affectedFiles);
  const architectureViolations = findArchitectureViolations(
    snapshot.dependencies,
    config.architecture.boundaries,
  ).filter((violation) => affected.has(violation.from));
  const recommendedTests = recommendTests(snapshot, changeImpact);

  return {
    repositoryRoot: rootDir,
    target: detailedImpact.target,
    found: detailedImpact.found,
    impactScore: detailedImpact.impactScore,
    riskLevel: detailedImpact.riskLevel,
    evidence: detailedImpact.evidence,
    directDependencies: limited(detailedImpact.directDependencies, maxItems),
    directDependents: limited(detailedImpact.directDependents, maxItems),
    transitiveDependents: limited(detailedImpact.transitiveDependents, maxItems),
    affectedFiles: limited(detailedImpact.affectedFiles, maxItems),
    affectedTests: limited(detailedImpact.affectedTests, maxItems),
    affectedModules: limited(changeImpact.affectedModules, maxItems),
    recommendedTests: limited(recommendedTests, maxItems),
    architectureViolations: limited(architectureViolations, maxItems),
  };
}

export async function analyzeWorkingTreeForMcp(options: ToolOptions = {}) {
  return analyzeGitChangeSetForMcp(undefined, options);
}

export async function analyzeSinceForMcp(
  baseRef: string,
  options: ToolOptions = {},
) {
  return analyzeGitChangeSetForMcp(baseRef, options);
}

async function analyzeGitChangeSetForMcp(
  baseRef: string | undefined,
  options: ToolOptions,
) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const maxItems = normalizeMaxItems(options.maxItems);
  const config = await loadCodeCausalityConfig(rootDir);
  const snapshot = await analyzeRepository({
    rootDir,
    ignorePatterns: config.ignore,
  });
  const changeSet = await getGitChangedFiles({
    rootDir,
    since: baseRef,
  });
  const knownSourceFiles = new Set(snapshot.files.map((file) => file.path));
  const sourceTargets = changeSet.files.filter((file) => knownSourceFiles.has(file));
  const ignoredFiles = changeSet.files.filter((file) => !knownSourceFiles.has(file));
  const impact = analyzeChangeSetImpact(snapshot, sourceTargets, {
    moduleDepth: config.moduleDepth,
  });
  const ownership = resolveCodeOwners(await loadCodeOwners(rootDir), sourceTargets);
  const history = await getGitFileHistory(rootDir, sourceTargets);
  const affected = new Set(impact.affectedFiles);
  const architectureViolations = findArchitectureViolations(
    snapshot.dependencies,
    config.architecture.boundaries,
  ).filter((violation) => affected.has(violation.from));
  const recommendedTests = recommendTests(snapshot, impact);
  const report = createImpactReport({
    repositoryRoot: rootDir,
    changeSet,
    ignoredFiles,
    impact,
    ownership,
    history,
    architectureViolations,
    recommendedTests,
  });

  return {
    schemaVersion: report.schemaVersion,
    repositoryRoot: rootDir,
    scope: baseRef ? { mode: 'ref', baseRef } : { mode: 'working-tree' },
    changedFiles: limited(changeSet.files, maxItems),
    ignoredFiles: limited(ignoredFiles, maxItems),
    impact: {
      impactScore: impact.impactScore,
      riskLevel: impact.riskLevel,
      foundTargets: limited(impact.foundTargets, maxItems),
      missingTargets: limited(impact.missingTargets, maxItems),
      affectedFiles: limited(impact.affectedFiles, maxItems),
      affectedTests: limited(impact.affectedTests, maxItems),
      affectedModules: limited(impact.affectedModules, maxItems),
      rankedTargets: limited(impact.rankedTargets, maxItems),
    },
    ownership: limited(ownership, maxItems),
    history: limited(history, maxItems),
    architectureViolations: limited(architectureViolations, maxItems),
    recommendedTests: limited(recommendedTests, maxItems),
  };
}

function normalizeMaxItems(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 40;
  return Math.min(200, Math.max(1, Math.floor(value)));
}

function limited<T>(items: T[], maxItems: number) {
  return {
    total: items.length,
    truncated: items.length > maxItems,
    items: items.slice(0, maxItems),
  };
}
