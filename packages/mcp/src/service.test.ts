import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeFileForMcp,
  scanRepositoryForMcp,
} from './service.js';

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
});
