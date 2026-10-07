import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createImpactReport,
  loadCodeCausalityConfig,
  loadCodeOwners,
  parseCodeOwners,
  resolveCodeOwners,
} from '../src/index.js';

describe('repository context', () => {
  it('loads .codecausality.json including architecture boundaries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codecausality-config-'));
    await writeFile(
      path.join(root, '.codecausality.json'),
      JSON.stringify({
        ignore: ['generated/**'],
        moduleDepth: 3,
        architecture: {
          boundaries: [
            {
              name: 'ui-no-data',
              from: ['src/ui/**'],
              disallow: ['src/data/**'],
              severity: 'warning',
            },
          ],
        },
      }),
    );

    const config = await loadCodeCausalityConfig(root);

    expect(config.ignore).toEqual(['generated/**']);
    expect(config.moduleDepth).toBe(3);
    expect(config.architecture.boundaries).toEqual([
      {
        name: 'ui-no-data',
        from: ['src/ui/**'],
        disallow: ['src/data/**'],
        severity: 'warning',
      },
    ]);
  });

  it('defaults malformed architecture entries away safely', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codecausality-config-invalid-'));
    await writeFile(
      path.join(root, '.codecausality.json'),
      JSON.stringify({
        architecture: {
          boundaries: [
            { name: '', from: ['src/**'], disallow: ['legacy/**'] },
            { name: 'missing-target', from: ['src/**'] },
          ],
        },
      }),
    );

    const config = await loadCodeCausalityConfig(root);
    expect(config.architecture.boundaries).toEqual([]);
  });

  it('uses the last matching CODEOWNERS rule', async () => {
    const rules = parseCodeOwners(
      ['/src/** @platform', '/src/payments/** @payments @security'].join('\n'),
    );

    const ownership = resolveCodeOwners(rules, [
      'src/orders/service.ts',
      'src/payments/card.ts',
    ]);

    expect(ownership[0]?.owners).toEqual(['@platform']);
    expect(ownership[1]?.owners).toEqual(['@payments', '@security']);
    expect(ownership[1]?.matchedPattern).toBe('/src/payments/**');
  });

  it('loads CODEOWNERS from the standard .github location', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codecausality-owners-'));
    await mkdir(path.join(root, '.github'));
    await writeFile(path.join(root, '.github', 'CODEOWNERS'), '/src/** @core-team\n');

    const rules = await loadCodeOwners(root);

    expect(rules).toEqual([{ pattern: '/src/**', owners: ['@core-team'] }]);
  });

  it('creates a stable versioned impact report with architecture evidence', () => {
    const report = createImpactReport({
      repositoryRoot: '/repo',
      changeSet: { mode: 'ref', baseRef: 'main', files: ['src/a.ts'] },
      ignoredFiles: ['README.md'],
      impact: {
        targets: ['src/a.ts'],
        foundTargets: ['src/a.ts'],
        missingTargets: [],
        affectedFiles: ['src/a.ts'],
        affectedTests: [],
        affectedModules: [
          {
            module: 'src',
            changedFiles: ['src/a.ts'],
            affectedFiles: ['src/a.ts'],
            affectedTests: [],
          },
        ],
        rankedTargets: [
          {
            target: 'src/a.ts',
            impactScore: 5,
            riskLevel: 'LOW',
            affectedFiles: 1,
            affectedTests: 0,
          },
        ],
        impactScore: 7,
        riskLevel: 'LOW',
      },
      architectureViolations: [
        {
          ruleName: 'ui-no-data',
          severity: 'error',
          from: 'src/a.ts',
          to: 'src/data/db.ts',
          specifier: './data/db.js',
          kind: 'static',
        },
      ],
    });

    expect(report.schemaVersion).toBe('1.0');
    expect(report.impact.affectedModules[0]?.module).toBe('src');
    expect(report.architectureViolations[0]?.ruleName).toBe('ui-no-data');
  });
});
