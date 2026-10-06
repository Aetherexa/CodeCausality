import path from 'node:path';
import { buildReverseGraph } from './graph.js';
import { normalizePath } from './fs.js';
import type {
  ChangeSetImpactOptions,
  ChangeSetImpactSummary,
  ImpactRiskLevel,
  ImpactSummary,
  ModuleImpactSummary,
  RepositorySnapshot,
} from './types.js';

export function analyzeImpact(snapshot: RepositorySnapshot, targetFile: string): ImpactSummary {
  const target = normalizeTarget(snapshot.rootDir, targetFile);
  const knownFiles = new Set(snapshot.files.map((file) => file.path));
  const directDependencies = unique(
    snapshot.dependencies.filter((edge) => edge.from === target).map((edge) => edge.to),
  ).sort();
  const directDependents = unique(
    snapshot.dependencies.filter((edge) => edge.to === target).map((edge) => edge.from),
  ).sort();

  if (!knownFiles.has(target)) {
    return {
      target,
      found: false,
      directDependencies: [],
      directDependents: [],
      transitiveDependents: [],
      affectedFiles: [],
      affectedTests: [],
      impactScore: 0,
      riskLevel: 'LOW',
      evidence: ['Target is not part of the analyzed source graph.'],
    };
  }

  const reverse = buildReverseGraph(snapshot.dependencies);
  const visited = traverseDependents(reverse, directDependents, target);
  const transitiveDependents = [...visited]
    .filter((file) => !directDependents.includes(file))
    .sort();
  const affectedFiles = unique([target, ...directDependents, ...transitiveDependents]).sort();
  const affectedTests = affectedFiles.filter(
    (file) => snapshot.files.find((metric) => metric.path === file)?.isTest,
  );
  const metric = snapshot.files.find((file) => file.path === target);
  const participatesInCycle = snapshot.circularDependencies.some((cycle) => cycle.includes(target));
  const impactScore = scoreImpact({
    affectedFiles: affectedFiles.length,
    affectedTests: affectedTests.length,
    directDependents: directDependents.length,
    targetRiskScore: metric?.riskScore ?? 0,
    participatesInCycle,
  });

  const evidence = [
    `${directDependents.length} direct dependent(s)`,
    `${transitiveDependents.length} transitive dependent(s)`,
    `${affectedTests.length} affected test file(s)`,
  ];
  if (participatesInCycle) evidence.push('Target participates in a circular dependency');

  return {
    target,
    found: true,
    directDependencies,
    directDependents,
    transitiveDependents,
    affectedFiles,
    affectedTests,
    impactScore,
    riskLevel: riskLevelFor(impactScore),
    targetRiskScore: metric?.riskScore,
    evidence,
  };
}

export function analyzeChangeSetImpact(
  snapshot: RepositorySnapshot,
  targetFiles: string[],
  options: ChangeSetImpactOptions = {},
): ChangeSetImpactSummary {
  const normalizedTargets = unique(
    targetFiles.map((file) => normalizeTarget(snapshot.rootDir, file)),
  ).sort();
  const results = normalizedTargets.map((target) => analyzeImpact(snapshot, target));
  const foundTargets = results.filter((result) => result.found).map((result) => result.target);
  const missingTargets = results.filter((result) => !result.found).map((result) => result.target);
  const affectedFiles = unique(results.flatMap((result) => result.affectedFiles)).sort();
  const affectedTests = unique(results.flatMap((result) => result.affectedTests)).sort();
  const rankedTargets = results
    .filter((result) => result.found)
    .map((result) => ({
      target: result.target,
      impactScore: result.impactScore,
      riskLevel: result.riskLevel,
      affectedFiles: result.affectedFiles.length,
      affectedTests: result.affectedTests.length,
    }))
    .sort((a, b) => b.impactScore - a.impactScore || a.target.localeCompare(b.target));
  const impactScore =
    results.length === 0
      ? 0
      : Math.min(
          100,
          Math.max(...results.map((result) => result.impactScore)) +
            Math.min(20, foundTargets.length * 2),
        );

  return {
    targets: normalizedTargets,
    foundTargets,
    missingTargets,
    affectedFiles,
    affectedTests,
    affectedModules: aggregateModules(
      foundTargets,
      affectedFiles,
      affectedTests,
      options.moduleDepth ?? 2,
    ),
    rankedTargets,
    impactScore,
    riskLevel: riskLevelFor(impactScore),
  };
}

function aggregateModules(
  changedFiles: string[],
  affectedFiles: string[],
  affectedTests: string[],
  depth: number,
): ModuleImpactSummary[] {
  const changedSet = new Set(changedFiles);
  const testSet = new Set(affectedTests);
  const modules = new Map<string, ModuleImpactSummary>();

  for (const file of affectedFiles) {
    const moduleName = moduleFor(file, depth);
    const entry = modules.get(moduleName) ?? {
      module: moduleName,
      changedFiles: [],
      affectedFiles: [],
      affectedTests: [],
    };
    entry.affectedFiles.push(file);
    if (changedSet.has(file)) entry.changedFiles.push(file);
    if (testSet.has(file)) entry.affectedTests.push(file);
    modules.set(moduleName, entry);
  }

  return [...modules.values()]
    .map((entry) => ({
      ...entry,
      changedFiles: entry.changedFiles.sort(),
      affectedFiles: entry.affectedFiles.sort(),
      affectedTests: entry.affectedTests.sort(),
    }))
    .sort(
      (a, b) =>
        b.affectedFiles.length - a.affectedFiles.length || a.module.localeCompare(b.module),
    );
}

function moduleFor(file: string, depth: number): string {
  const parts = normalizePath(file).split('/');
  const directories = parts.slice(0, -1);
  if (directories.length === 0) return '(root)';
  return directories.slice(0, Math.max(1, depth)).join('/');
}

function traverseDependents(
  reverse: Map<string, string[]>,
  seeds: string[],
  target: string,
): Set<string> {
  const visited = new Set<string>();
  const queue = [...seeds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current === target || visited.has(current)) continue;
    visited.add(current);
    for (const dependent of reverse.get(current) ?? []) {
      if (!visited.has(dependent)) queue.push(dependent);
    }
  }

  return visited;
}

function scoreImpact(input: {
  affectedFiles: number;
  affectedTests: number;
  directDependents: number;
  targetRiskScore: number;
  participatesInCycle: boolean;
}): number {
  const raw =
    Math.min(40, Math.max(0, input.affectedFiles - 1) * 4) +
    Math.min(20, input.affectedTests * 5) +
    Math.min(15, input.directDependents * 3) +
    Math.min(15, input.targetRiskScore * 0.15) +
    (input.participatesInCycle ? 10 : 0);

  return Math.round(Math.min(100, raw));
}

function riskLevelFor(score: number): ImpactRiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

function normalizeTarget(rootDir: string, targetFile: string): string {
  const absolute = path.isAbsolute(targetFile) ? targetFile : path.resolve(rootDir, targetFile);
  return normalizePath(path.relative(rootDir, absolute));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
