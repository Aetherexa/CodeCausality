import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_IGNORES = new Set([
  '.git',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.codecausality',
]);

export const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.py',
  '.java',
  '.kt',
  '.kts',
  '.go',
  '.rs',
  '.cs',
  '.cpp',
  '.c',
  '.h',
  '.hpp',
]);

export async function discoverFiles(
  rootDir: string,
  maxFiles = 10_000,
  ignorePatterns: string[] = [],
): Promise<string[]> {
  const result: string[] = [];

  async function walk(current: string): Promise<void> {
    if (result.length >= maxFiles) return;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (result.length >= maxFiles) break;
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;

      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(rootDir, absolute));
      if (matchesAnyIgnore(relative, ignorePatterns, entry.isDirectory())) continue;

      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.push(relative);
    }
  }

  await walk(rootDir);
  return result.sort();
}

export async function readTextFile(rootDir: string, relativePath: string): Promise<string> {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

export function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

export function isSourceFile(file: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function isTestFile(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  return (
    normalized.includes('/__tests__/') ||
    /(?:^|\/)[^/]+\.(?:test|spec)\.[^.]+$/.test(normalized) ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/')
  );
}

export function matchesAnyIgnore(
  relativePath: string,
  patterns: string[],
  isDirectory = false,
): boolean {
  const normalized = normalizePath(relativePath);
  return patterns.some((pattern) => matchesIgnorePattern(normalized, pattern, isDirectory));
}

function matchesIgnorePattern(file: string, rawPattern: string, isDirectory: boolean): boolean {
  let pattern = normalizePath(rawPattern.trim());
  if (!pattern || pattern.startsWith('#')) return false;
  if (pattern.startsWith('./')) pattern = pattern.slice(2);
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  if (pattern.endsWith('/')) pattern += '**';

  const candidates = [file];
  if (isDirectory) candidates.push(file + '/');

  if (!pattern.includes('/')) {
    return file.split('/').some((segment) => globToRegex(pattern).test(segment));
  }

  const expression = globToRegex(pattern);
  return candidates.some((candidate) => expression.test(candidate));
}

function globToRegex(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char?.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&') ?? '';
    }
  }
  source += '$';
  return new RegExp(source);
}
