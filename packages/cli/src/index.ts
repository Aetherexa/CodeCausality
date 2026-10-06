#!/usr/bin/env node
import path from 'node:path';
import {
  analyzeChangeSetImpact,
  analyzeImpact,
  analyzeRepository,
  getGitChangedFiles,
  toMermaid,
} from '@codecausality/core';
import type {
  ChangeSetImpactSummary,
  GitChangeSet,
  ImpactSummary,
  RepositorySnapshot,
} from '@codecausality/core';

type OutputFormat = 'pretty' | 'json' | 'mermaid';

interface CliOptions {
  command: string;
  positional: string[];
  format: OutputFormat;
  repo: string;
  since?: string;
  workingTree: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const command = args[0] ?? 'scan';
  const positional: string[] = [];
  let format: OutputFormat = 'pretty';
  let repo = '.';
  let since: string | undefined;
  let workingTree = false;

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
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { command, positional, format, repo, since, workingTree };
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
): string {
  const scope = changeSet.mode === 'ref' ? `since ${changeSet.baseRef}` : 'working tree';
  return [
    'CodeCausality Git Impact',
    `Scope: ${scope}`,
    `Changed files: ${changeSet.files.length}`,
    `Changed source files analyzed: ${impact.foundTargets.length}`,
    `Non-source/unresolved files ignored: ${ignoredFiles.length}`,
    `Combined impact: ${impact.riskLevel} (${impact.impactScore}/100)`,
    `Affected files: ${impact.affectedFiles.length}`,
    `Affected tests: ${impact.affectedTests.length}`,
    '',
    'Risk-ranked changed files:',
    ...(impact.rankedTargets.length > 0
      ? impact.rankedTargets.map(
          (item, index) =>
            `  ${index + 1}. ${item.target} — ${item.riskLevel} ${item.impactScore}/100, ${item.affectedFiles} affected file(s), ${item.affectedTests} test(s)`,
        )
      : ['  - No changed source files found in the current repository graph.']),
    '',
    `Affected tests (${impact.affectedTests.length}):`,
    ...impact.affectedTests.map((file) => `  - ${file}`),
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (['--help', '-h', 'help'].includes(options.command)) {
    console.log(
      [
        'Usage:',
        '  codecausality scan [path] [--format pretty|json|mermaid]',
        '  codecausality impact <file> [--repo path] [--format pretty|json]',
        '  codecausality impact --since <git-ref> [--repo path] [--format pretty|json]',
        '  codecausality impact --working-tree [--repo path] [--format pretty|json]',
        '',
        'CodeCausality performs deterministic local analysis. No LLM or agent is required.',
      ].join('\n'),
    );
    return;
  }

  if (options.command === 'scan') {
    const target = path.resolve(options.positional[0] ?? '.');
    const snapshot = await analyzeRepository({ rootDir: target });
    if (options.format === 'json') console.log(JSON.stringify(snapshot, null, 2));
    else if (options.format === 'mermaid') console.log(toMermaid(snapshot.dependencies));
    else console.log(pretty(snapshot));
    return;
  }

  if (options.command === 'impact') {
    if (options.format === 'mermaid') {
      throw new Error('Mermaid output is only supported by scan');
    }

    const rootDir = path.resolve(options.repo);
    const snapshot = await analyzeRepository({ rootDir });

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
      const impact = analyzeChangeSetImpact(snapshot, sourceTargets);

      if (options.format === 'json') {
        console.log(JSON.stringify({ changeSet, ignoredFiles, impact }, null, 2));
      } else {
        console.log(prettyGitImpact(changeSet, ignoredFiles, impact));
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
