import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeChangeSetImpact,
  analyzeImpact,
  analyzeRepository,
  toMermaid,
} from '../src/index.js';

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'codecausality-'));
  await mkdir(path.join(root, 'src', '__tests__'), { recursive: true });
  await writeFile(
    path.join(root, 'src', 'pricing.ts'),
    "import z from 'zod';\nexport const price = () => z.string();\n",
  );
  await writeFile(
    path.join(root, 'src', 'quote.ts'),
    "import { price } from './pricing.js';\nexport const quote = () => price();\n",
  );
  await writeFile(
    path.join(root, 'src', 'screen.ts'),
    "import { quote } from './quote.js';\nexport const screen = () => quote();\n",
  );
  await writeFile(
    path.join(root, 'src', '__tests__', 'quote.test.ts'),
    "import { quote } from '../quote.js';\nvoid quote;\n",
  );
  return root;
}

describe('repository analysis', () => {
  it('builds internal relationships without duplicating DrJSON package intelligence', async () => {
    const root = await fixture();
    const result = await analyzeRepository({ rootDir: root });

    expect(result.totals.sourceFiles).toBe(4);
    expect(result.dependencies).toHaveLength(3);
    expect(result.externalReferences).toEqual([
      expect.objectContaining({
        from: 'src/pricing.ts',
        packageName: 'zod',
        specifier: 'zod',
      }),
    ]);
    expect(result).not.toHaveProperty('technologies');
  });

  it('resolves NodeNext .js specifiers to TypeScript source files', async () => {
    const root = await fixture();
    const result = await analyzeRepository({ rootDir: root });

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        from: 'src/quote.ts',
        to: 'src/pricing.ts',
      }),
    );
  });

  it('computes transitive blast radius, affected tests and modules', async () => {
    const root = await fixture();
    const result = await analyzeRepository({ rootDir: root });
    const impact = analyzeChangeSetImpact(result, ['src/pricing.ts'], { moduleDepth: 2 });

    expect(impact.affectedFiles).toContain('src/screen.ts');
    expect(impact.affectedTests).toContain('src/__tests__/quote.test.ts');
    expect(impact.affectedModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: 'src',
          changedFiles: ['src/pricing.ts'],
        }),
        expect.objectContaining({
          module: 'src/__tests__',
          affectedTests: ['src/__tests__/quote.test.ts'],
        }),
      ]),
    );
  });

  it('computes direct impact for a single file', async () => {
    const root = await fixture();
    const result = await analyzeRepository({ rootDir: root });
    const impact = analyzeImpact(result, 'src/pricing.ts');

    expect(impact.found).toBe(true);
    expect(impact.directDependents).toEqual(['src/quote.ts']);
    expect(impact.transitiveDependents).toContain('src/screen.ts');
    expect(impact.impactScore).toBeGreaterThan(0);
  });

  it('aggregates and ranks impact for a changed file set', async () => {
    const root = await fixture();
    const result = await analyzeRepository({ rootDir: root });
    const impact = analyzeChangeSetImpact(result, ['src/pricing.ts', 'src/missing.ts']);

    expect(impact.foundTargets).toEqual(['src/pricing.ts']);
    expect(impact.missingTargets).toEqual(['src/missing.ts']);
    expect(impact.affectedFiles).toContain('src/screen.ts');
    expect(impact.rankedTargets[0]?.target).toBe('src/pricing.ts');
  });

  it('honors repository ignore patterns', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'generated'), { recursive: true });
    await writeFile(path.join(root, 'generated', 'client.ts'), 'export const generated = true;\n');

    const result = await analyzeRepository({
      rootDir: root,
      ignorePatterns: ['generated/**'],
    });

    expect(result.files.some((file) => file.path === 'generated/client.ts')).toBe(false);
  });

  it('detects circular dependencies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codecausality-cycle-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'a.ts'), "import './b.js';\n");
    await writeFile(path.join(root, 'src', 'b.ts'), "import './a.js';\n");

    const result = await analyzeRepository({ rootDir: root });
    expect(result.circularDependencies).toHaveLength(1);
  });

  it('captures nested dynamic imports and excludes Node built-ins from package references', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codecausality-dynamic-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'lazy.ts'), "export const lazy = 1;\n");
    await writeFile(
      path.join(root, 'src', 'entry.ts'),
      "import fs from 'fs';\nexport async function load() { return import('./lazy.js'); }\nvoid fs;\n",
    );

    const result = await analyzeRepository({ rootDir: root });
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        from: 'src/entry.ts',
        to: 'src/lazy.ts',
        kind: 'dynamic',
      }),
    );
    expect(
      result.externalReferences.some((reference) => reference.packageName === 'fs'),
    ).toBe(false);
  });

  it('renders Mermaid dependency output', async () => {
    const root = await fixture();
    const result = await analyzeRepository({ rootDir: root });
    const diagram = toMermaid(result.dependencies);

    expect(diagram).toContain('flowchart LR');
    expect(diagram).toContain('-->');
  });
});
