#!/usr/bin/env node
import path from 'node:path';
import { analyzeImpact, analyzeRepository, toMermaid } from '@codecausality/core';
import type { ImpactSummary, RepositorySnapshot } from '@codecausality/core';

type OutputFormat = 'pretty' | 'json' | 'mermaid';

interface CliOptions {
  command: string;
  positional: string[];
  format: OutputFormat;
  repo: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const command = args[0] ?? 'scan';
  const positional: string[] = [];
  let format: OutputFormat = 'pretty';
  let repo = '.';

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--format') {
      const value = args[++i];
      if (value === 'pretty' || value === 'json' || value === 'mermaid') format = value;
      else throw new Error('Expected --format pretty|json|mermaid');
    } else if (arg === '--repo') {
      repo = args[++i] ?? '.';
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { command, positional, format, repo };
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (['--help', '-h', 'help'].includes(options.command)) {
    console.log(
      [
        'Usage:',
        '  codecausality scan [path] [--format pretty|json|mermaid]',
        '  codecausality impact <file> [--repo path] [--format pretty|json]',
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
    const targetFile = options.positional[0];
    if (!targetFile) {
      throw new Error('Usage: codecausality impact <file> [--repo path]');
    }
    if (options.format === 'mermaid') {
      throw new Error('Mermaid output is only supported by scan');
    }

    const snapshot = await analyzeRepository({ rootDir: path.resolve(options.repo) });
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
