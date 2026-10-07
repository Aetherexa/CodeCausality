#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
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
  resolveCodeOwners,
  recommendTests,
  toMermaid,
} from '@codecausality/core';
import type {
  ArchitectureViolation,
  ChangeSetImpactSummary,
  CodeCausalityImpactReport,
  FileOwnership,
  GitChangeSet,
  GitFileHistory,
  ImpactSummary,
  RepositorySnapshot,
  RecommendedTest,
} from '@codecausality/core';

type OutputFormat = 'pretty' | 'json' | 'mermaid';

interface CliOptions {
  command: string;
  positional: string[];
  format: OutputFormat;
  repo: string;
  since?: string;
  workingTree: boolean;
  output?: string;
  configPath?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const command = args[0] ?? 'scan';
  const positional: string[] = [];
  let format: OutputFormat = 'pretty';
  let repo = '.';
  let since: string | undefined;
  let workingTree = false;
  let output: string | undefined;
  let configPath: string | undefined;

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--format') {
      const value = args[++i];
      if (value === 'pretty' || value === 'json' || value === 'mermaid') format = value;
      else throw new Error('Expected --format pretty|json|mermaid');
    } else if (arg === '--repo') {
      repo = args[++i] ?? '.';
    } else if (arg === '--since') {
      const value = args[++i];
      if (!value) throw new Error('Expected a Git ref after --since');
      since = value;
    } else if (arg === '--working-tree') {
      workingTree = true;
    } else if (arg === '--output') {
      const value = args[++i];
      if (!value) throw new Error('Expected a file path after --output');
      output = value;
    } else if (arg === '--config') {
      const value = args[++i];
      if (!value) throw new Error('Expected a file path after --config');
      configPath = value;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { command, positional, format, repo, since, workingTree, output, configPath };
}

function pretty(snapshot: RepositorySnapshot): string {
  const externalPackages = new Set(
    snapshot.externalReferences.map((reference) => reference.packageName),
  );
  const lines = [
    'CodeCausality',
    `Repository: ${snapshot.rootDir}`,
    `Source files: ${snapshot.totals.sourceFiles}`,
    `Internal relationships: ${snapshot.totals.internalEdges}`,
    `External packages referenced: ${externalPackages.size}`,
    `Circular dependencies: ${snapshot.circularDependencies.length}`,
    '',
    'Top structural hotspots:',
    ...snapshot.hotspots.slice(0, 5).map(
      (file, index) =>
        `  ${index + 1}. ${file.path} — structural risk ${file.riskScore}, fan-in ${file.fanIn}, fan-out ${file.fanOut}`,
    ),
  ];

  if (snapshot.circularDependencies.length > 0) {
    lines.push(
      '',
      'Cycles:',
      ...snapshot.circularDependencies
        .slice(0, 5)
        .map((cycle) => `  - ${cycle.join(' -> ')}`),
    );
  }

  return lines.join('\n');
}

function prettyImpact(impact: ImpactSummary): string {
  if (!impact.found) {
    return `CodeCausality Impact\nTarget not found in analyzed source graph: ${impact.target}`;
  }

  return [
    'CodeCausality Impact',
    `Target: ${impact.target}`,
    `Impact: ${impact.riskLevel} (${impact.impactScore}/100)`,
    `Affected files: ${impact.affectedFiles.length}`,
    `Affected tests: ${impact.affectedTests.length}`,
    '',
    'Evidence:',
    ...impact.evidence.map((item) => `  - ${item}`),
    '',
    `Direct dependents (${impact.directDependents.length}):`,
    ...impact.directDependents.map((file) => `  - ${file}`),
    '',
    `Transitive dependents (${impact.transitiveDependents.length}):`,
    ...impact.transitiveDependents.map((file) => `  - ${file}`),
    '',
    `Affected tests (${impact.affectedTests.length}):`,
    ...impact.affectedTests.map((file) => `  - ${file}`),
  ].join('\n');
}

function prettyGitImpact(
  changeSet: GitChangeSet,
  ignoredFiles: string[],
  impact: ChangeSetImpactSummary,
  ownership: FileOwnership[],
  history: GitFileHistory[],
  architectureViolations: ArchitectureViolation[],
  recommendedTests: RecommendedTest[],
): string {
  const scope = changeSet.mode === 'ref' ? `since ${changeSet.baseRef}` : 'working tree';
  const ownerLines = ownership
    .filter((item) => item.owners.length > 0)
    .map((item) => `  - ${item.file}: ${item.owners.join(', ')}`);
  const historyLines = history
    .filter((item) => item.commitCount > 0)
    .sort((a, b) => b.churn - a.churn)
    .slice(0, 5)
    .map(
      (item) =>
        `  - ${item.file}: ${item.commitCount} commit(s), churn ${item.churn}, last touched by ${item.lastAuthor ?? 'unknown'}`,
    );
  const architectureLines = architectureViolations.map(
    (violation) =>
      `  - [${violation.severity.toUpperCase()}] ${violation.ruleName}: ${violation.from} -> ${violation.to}`,
  );
  const recommendedTestLines = recommendedTests.map(
    (test) =>
      `  - [${test.confidence.toUpperCase()}] ${test.path} (${test.reasons.join(', ')})`,
  );

  return [
    'CodeCausality Git Impact',
    `Scope: ${scope}`,
    `Changed files: ${changeSet.files.length}`,
    `Changed source files analyzed: ${impact.foundTargets.length}`,
    `Non-source/ignored files: ${ignoredFiles.length}`,
    `Combined impact: ${impact.riskLevel} (${impact.impactScore}/100)`,
    `Affected files: ${impact.affectedFiles.length}`,
    `Affected tests: ${impact.affectedTests.length}`,
    `Affected modules: ${impact.affectedModules.length}`,
    `Architecture violations: ${architectureViolations.length}`,
    `Recommended tests: ${recommendedTests.length}`,
    '',
    'Risk-ranked changed files:',
    ...(impact.rankedTargets.length > 0
      ? impact.rankedTargets.map(
          (item, index) =>
            `  ${index + 1}. ${item.target} — ${item.riskLevel} ${item.impactScore}/100, ${item.affectedFiles} affected file(s), ${item.affectedTests} test(s)`,
        )
      : ['  - No changed source files found in the current repository graph.']),
    '',
    'Affected modules:',
    ...(impact.affectedModules.length > 0
      ? impact.affectedModules.map(
          (item) =>
            `  - ${item.module}: ${item.affectedFiles.length} file(s), ${item.affectedTests.length} test(s)`,
        )
      : ['  - None']),
    '',
    'Architecture guardrails:',
    ...(architectureLines.length > 0 ? architectureLines : ['  - No relevant violations']),
    '',
    'Recommended test surface:',
    ...(recommendedTestLines.length > 0 ? recommendedTestLines : ['  - No deterministic recommendations']),
    '',
    'CODEOWNERS:',
    ...(ownerLines.length > 0 ? ownerLines : ['  - No owners resolved']),
    '',
    'History signals:',
    ...(historyLines.length > 0 ? historyLines : ['  - No tracked history for changed source files']),
    '',
    `Affected tests (${impact.affectedTests.length}):`,
    ...impact.affectedTests.map((file) => `  - ${file}`),
  ].join('\n');
}

async function writeJsonOutput(outputPath: string, value: unknown): Promise<void> {
  const absolute = path.resolve(outputPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (['--help', '-h', 'help'].includes(options.command)) {
    console.log(
      [
        'Usage:',
        '  codecausality scan [path] [--format pretty|json|mermaid] [--config path]',
        '  codecausality impact <file> [--repo path] [--format pretty|json] [--config path]',
        '  codecausality impact --since <git-ref> [--repo path] [--output report.json]',
        '  codecausality impact --working-tree [--repo path] [--output report.json]',
        '',
        'Config:',
        '  .codecausality.json supports ignore, moduleDepth, and architecture.boundaries.',
        '',
        'CodeCausality performs deterministic local analysis. No LLM or agent is required.',
      ].join('\n'),
    );
    return;
  }

  if (options.command === 'scan') {
    const rootDir = path.resolve(options.positional[0] ?? '.');
    const config = await loadCodeCausalityConfig(rootDir, options.configPath);
    const snapshot = await analyzeRepository({
      rootDir,
      ignorePatterns: config.ignore,
    });
    if (options.format === 'json') console.log(JSON.stringify(snapshot, null, 2));
    else if (options.format === 'mermaid') console.log(toMermaid(snapshot.dependencies));
    else console.log(pretty(snapshot));
    if (options.output) await writeJsonOutput(options.output, snapshot);
    return;
  }

  if (options.command === 'impact') {
    if (options.format === 'mermaid') {
      throw new Error('Mermaid output is only supported by scan');
    }

    const rootDir = path.resolve(options.repo);
    const config = await loadCodeCausalityConfig(rootDir, options.configPath);
    const snapshot = await analyzeRepository({
      rootDir,
      ignorePatterns: config.ignore,
    });

    if (options.since && options.workingTree) {
      throw new Error('Use either --since <git-ref> or --working-tree, not both');
    }

    if (options.since || options.workingTree) {
      if (options.positional.length > 0) {
        throw new Error(
          'Use either impact <file>, impact --since <git-ref>, or impact --working-tree',
        );
      }

      const changeSet = await getGitChangedFiles({ rootDir, since: options.since });
      const knownSourceFiles = new Set(snapshot.files.map((file) => file.path));
      const sourceTargets = changeSet.files.filter((file) => knownSourceFiles.has(file));
      const ignoredFiles = changeSet.files.filter((file) => !knownSourceFiles.has(file));
      const impact = analyzeChangeSetImpact(snapshot, sourceTargets, {
        moduleDepth: config.moduleDepth,
      });
      const ownership = resolveCodeOwners(await loadCodeOwners(rootDir), sourceTargets);
      const history = await getGitFileHistory(rootDir, sourceTargets);
      const affectedFiles = new Set(impact.affectedFiles);
      const architectureViolations = findArchitectureViolations(
        snapshot.dependencies,
        config.architecture.boundaries,
      ).filter((violation) => affectedFiles.has(violation.from));
      const recommendedTests = recommendTests(snapshot, impact);
      const report: CodeCausalityImpactReport = createImpactReport({
        repositoryRoot: rootDir,
        changeSet,
        ignoredFiles,
        impact,
        ownership,
        history,
        architectureViolations,
        recommendedTests,
      });

      if (options.output) await writeJsonOutput(options.output, report);
      if (options.format === 'json') console.log(JSON.stringify(report, null, 2));
      else {
        console.log(
          prettyGitImpact(
            changeSet,
            ignoredFiles,
            impact,
            ownership,
            history,
            architectureViolations,
            recommendedTests,
          ),
        );
      }
      return;
    }

    const targetFile = options.positional[0];
    if (!targetFile) {
      throw new Error(
        'Usage: codecausality impact <file>, impact --since <git-ref>, or impact --working-tree',
      );
    }

    const impact = analyzeImpact(snapshot, targetFile);
    if (options.output) await writeJsonOutput(options.output, impact);
    if (options.format === 'json') console.log(JSON.stringify(impact, null, 2));
    else console.log(prettyImpact(impact));
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CodeCausality failed: ${message}`);
  process.exitCode = 1;
});
