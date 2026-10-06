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

export interface GitFileHistory {
  file: string;
  commitCount: number;
  additions: number;
  deletions: number;
  churn: number;
  lastCommitSha?: string;
  lastAuthor?: string;
  lastAuthorEmail?: string;
  lastCommitDate?: string;
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

export async function getGitFileHistory(
  rootDir: string,
  files: string[],
): Promise<GitFileHistory[]> {
  const absoluteRoot = path.resolve(rootDir);
  await assertGitRepository(absoluteRoot);
  const result: GitFileHistory[] = [];

  for (const file of [...new Set(files.map(normalizePath))].sort()) {
    const { stdout } = await runGit(absoluteRoot, [
      'log',
      '--format=__CC__%H%x1f%an%x1f%ae%x1f%aI',
      '--numstat',
      '--',
      file,
    ]);
    result.push(parseFileHistory(file, stdout));
  }

  return result;
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

function parseFileHistory(file: string, output: string): GitFileHistory {
  let commitCount = 0;
  let additions = 0;
  let deletions = 0;
  let lastCommitSha: string | undefined;
  let lastAuthor: string | undefined;
  let lastAuthorEmail: string | undefined;
  let lastCommitDate: string | undefined;

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('__CC__')) {
      commitCount += 1;
      if (commitCount === 1) {
        const [sha, author, email, date] = line.slice('__CC__'.length).split('\x1f');
        lastCommitSha = sha || undefined;
        lastAuthor = author || undefined;
        lastAuthorEmail = email || undefined;
        lastCommitDate = date || undefined;
      }
      continue;
    }

    const match = line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (!match) continue;
    additions += match[1] === '-' ? 0 : Number(match[1]);
    deletions += match[2] === '-' ? 0 : Number(match[2]);
  }

  return {
    file,
    commitCount,
    additions,
    deletions,
    churn: additions + deletions,
    lastCommitSha,
    lastAuthor,
    lastAuthorEmail,
    lastCommitDate,
  };
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean)
    .sort();
}
