import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePath } from './fs.js';

export interface CodeOwnerRule {
  pattern: string;
  owners: string[];
}

export interface FileOwnership {
  file: string;
  owners: string[];
  matchedPattern?: string;
}

const CODEOWNERS_LOCATIONS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];

export async function loadCodeOwners(rootDir: string): Promise<CodeOwnerRule[]> {
  for (const relativePath of CODEOWNERS_LOCATIONS) {
    try {
      const content = await readFile(path.join(rootDir, relativePath), 'utf8');
      return parseCodeOwners(content);
    } catch (error) {
      const details = error as NodeJS.ErrnoException;
      if (details.code !== 'ENOENT') throw error;
    }
  }
  return [];
}

export function parseCodeOwners(content: string): CodeOwnerRule[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map(([pattern, ...owners]) => ({
      pattern: pattern ?? '',
      owners: owners.filter(Boolean),
    }))
    .filter((rule) => rule.pattern.length > 0 && rule.owners.length > 0);
}

export function resolveCodeOwners(rules: CodeOwnerRule[], files: string[]): FileOwnership[] {
  return files.map((file) => {
    const normalized = normalizePath(file);
    let matched: CodeOwnerRule | undefined;
    for (const rule of rules) {
      if (matchesCodeOwnerPattern(normalized, rule.pattern)) matched = rule;
    }
    return {
      file: normalized,
      owners: matched?.owners ?? [],
      matchedPattern: matched?.pattern,
    };
  });
}

function matchesCodeOwnerPattern(file: string, rawPattern: string): boolean {
  let pattern = rawPattern.trim();
  if (!pattern || pattern.startsWith('!')) return false;

  const anchored = pattern.startsWith('/');
  if (anchored) pattern = pattern.slice(1);
  if (pattern.endsWith('/')) pattern += '**';

  const hasSlash = pattern.includes('/');
  const expression = globToRegex(pattern);

  if (anchored || hasSlash) return expression.test(file);
  return file.split('/').some((segment) => expression.test(segment));
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
