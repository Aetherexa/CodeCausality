import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { normalizePath } from './fs.js';

const execFileAsync = promisify(execFile);

export interface GitChangedFilesOptions {
  rootDir: string;
  since?: string;
  includeUntracked?: boolean;
}

export interface GitChangeSet {
  mode: 'ref' | 'working-tree';
  baseRef?: string;
  files: string[];
}

export async function getGitChangedFiles(options: GitChangedFilesOptions): Promise<GitChangeSet> {
  const rootDir = path.resolve(options.rootDir);
  await assertGitRepository(rootDir);

  if (options.since) {
    const { stdout } = await runGit(rootDir, [
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      `${options.since}...HEAD`,
      '--',
    ]);
    return {
      mode: 'ref',
      baseRef: options.since,
      files: parseLines(stdout),
    };
  }

  const tracked = await runGit(rootDir, [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    'HEAD',
    '--',
  ]);
  const files = parseLines(tracked.stdout);

  if (options.includeUntracked !== false) {
    const untracked = await runGit(rootDir, ['ls-files', '--others', '--exclude-standard']);
    files.push(...parseLines(untracked.stdout));
  }

  return {
    mode: 'working-tree',
    files: [...new Set(files)].sort(),
  };
}

async function assertGitRepository(rootDir: string): Promise<void> {
  try {
    const { stdout } = await runGit(rootDir, ['rev-parse', '--is-inside-work-tree']);
    if (stdout.trim() !== 'true') throw new Error('Not a Git working tree');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CodeCausality requires a Git repository for git-aware impact: ${message}`);
  }
}

async function runGit(rootDir: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const details = error as Error & { stderr?: string };
    throw new Error(details.stderr?.trim() || details.message);
  }
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean)
    .sort();
}
