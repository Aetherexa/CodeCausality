import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  analyzeFileForMcp,
  createContextBundleForMcp,
  scanRepositoryForMcp,
} from './service.js';

const execFileAsync = promisify(execFile);

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'codecausality-mcp-'));
  await mkdir(path.join(root, 'src', '__tests__'), { recursive: true });

  await writeFile(
    path.join(root, 'src', 'pricing.ts'),
    'export const price = (value: number) => value;\n',
  );
  await writeFile(
    path.join(root, 'src', 'quote.ts'),
    "import { price } from './pricing.js';\nexport const quote = price;\n",
  );
  await writeFile(
    path.join(root, 'src', '__tests__', 'quote.test.ts'),
    "import { quote } from '../quote.js';\nvoid quote;\n",
  );

  return root;
}

async function gitFixture(): Promise<string> {
  const root = await fixture();
  await runGit(root, ['init']);
  await runGit(root, ['config', 'user.email', 'codecausality@example.test']);
  await runGit(root, ['config', 'user.name', 'CodeCausality Test']);
  await runGit(root, ['add', '.']);
  await runGit(root, ['commit', '-m', 'initial']);
  return root;
}

async function runGit(root: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: root });
}

describe('MCP analysis service', () => {
  it('returns a compact repository summary', async () => {
    const root = await fixture();
    const result = await scanRepositoryForMcp({
      rootDir: root,
      maxItems: 2,
    });

    expect(result.repositoryRoot).toBe(root);
    expect(result.totals.sourceFiles).toBe(3);
    expect(result.hotspots.length).toBeLessThanOrEqual(2);
  });

  it('returns bounded file-impact evidence and recommended tests', async () => {
    const root = await fixture();
    const result = await analyzeFileForMcp('src/pricing.ts', {
      rootDir: root,
      maxItems: 1,
    });

    expect(result.found).toBe(true);
    expect(result.directDependents.items).toEqual(['src/quote.ts']);
    expect(result.transitiveDependents.total).toBeGreaterThanOrEqual(1);
    expect(result.affectedFiles.items).toHaveLength(1);
    expect(result.affectedFiles.truncated).toBe(true);
    expect(result.recommendedTests.total).toBeGreaterThanOrEqual(1);
  });

  it('builds a bounded AI context bundle for the Git working tree', async () => {
    const root = await gitFixture();
    await writeFile(
      path.join(root, 'src', 'pricing.ts'),
      'export const price = (value: number) => value * 1.1;\n',
    );

    const result = await createContextBundleForMcp(undefined, {
      rootDir: root,
      maxChars: 1_500,
    });

    expect(result.schemaVersion).toBe('1.0');
    expect(result.kind).toBe('change-impact');
    expect(result.focus.mode).toBe('working-tree');
    expect(result.evidence.changedFiles).toContain('src/pricing.ts');
    expect(result.evidence.recommendedTests.length).toBeGreaterThanOrEqual(1);
    expect(result.budget.usedChars).toBeLessThanOrEqual(1_500);
  });

  it('builds a ref-scoped AI context bundle', async () => {
    const root = await gitFixture();
    await writeFile(
      path.join(root, 'src', 'pricing.ts'),
      'export const price = (value: number) => value * 1.2;\n',
    );
    await runGit(root, ['add', 'src/pricing.ts']);
    await runGit(root, ['commit', '-m', 'change pricing']);

    const result = await createContextBundleForMcp('HEAD~1', {
      rootDir: root,
      maxChars: 4_000,
    });

    expect(result.focus.mode).toBe('ref');
    expect(result.focus.baseRef).toBe('HEAD~1');
    expect(result.evidence.changedFiles).toContain('src/pricing.ts');
  });
});
