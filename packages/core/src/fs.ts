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
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.py', '.java', '.kt', '.kts', '.go', '.rs', '.cs', '.cpp', '.c', '.h', '.hpp',
]);

export async function discoverFiles(rootDir: string, maxFiles = 10_000): Promise<string[]> {
  const result: string[] = [];

  async function walk(current: string): Promise<void> {
    if (result.length >= maxFiles) return;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (result.length >= maxFiles) break;
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;

      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.push(normalizePath(path.relative(rootDir, absolute)));
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
