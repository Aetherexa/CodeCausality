import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { getGitChangedFiles, getGitFileHistory } from '../src/index.js';

const execFileAsync = promisify(execFile);

async function runGit(root: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: root });
}

async function gitFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'codecausality-git-'));
  await mkdir(path.join(root, 'src'));
  await runGit(root, ['init']);
  await runGit(root, ['config', 'user.email', 'codecausality@example.test']);
  await runGit(root, ['config', 'user.name', 'CodeCausality Test']);

  await writeFile(path.join(root, 'src', 'pricing.ts'), 'export const price = 1;\n');
  await writeFile(path.join(root, 'README.md'), '# fixture\n');
  await runGit(root, ['add', '.']);
  await runGit(root, ['commit', '-m', 'initial']);

  await writeFile(path.join(root, 'src', 'pricing.ts'), 'export const price = 2;\n');
  await runGit(root, ['add', 'src/pricing.ts']);
  await runGit(root, ['commit', '-m', 'change pricing']);
  return root;
}

describe('Git intelligence', () => {
  it('returns files changed since a Git ref', async () => {
    const root = await gitFixture();
    const changeSet = await getGitChangedFiles({ rootDir: root, since: 'HEAD~1' });

    expect(changeSet.mode).toBe('ref');
    expect(changeSet.baseRef).toBe('HEAD~1');
    expect(changeSet.files).toEqual(['src/pricing.ts']);
  });

  it('returns modified and untracked working-tree files', async () => {
    const root = await gitFixture();
    await writeFile(path.join(root, 'src', 'pricing.ts'), 'export const price = 3;\n');
    await writeFile(path.join(root, 'src', 'new-file.ts'), 'export const value = 1;\n');

    const changeSet = await getGitChangedFiles({ rootDir: root });

    expect(changeSet.mode).toBe('working-tree');
    expect(changeSet.files).toEqual(['src/new-file.ts', 'src/pricing.ts']);
  });

  it('returns churn and last-touch metadata for tracked files', async () => {
    const root = await gitFixture();
    const [history] = await getGitFileHistory(root, ['src/pricing.ts']);

    expect(history?.commitCount).toBe(2);
    expect(history?.churn).toBeGreaterThan(0);
    expect(history?.lastAuthor).toBe('CodeCausality Test');
    expect(history?.lastCommitSha).toBeTruthy();
  });
});
