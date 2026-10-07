import type { DependencyEdge, ImportKind } from './types.js';
import { normalizePath } from './fs.js';

export type ArchitectureViolationSeverity = 'warning' | 'error';

export interface ArchitectureBoundaryRule {
  name: string;
  from: string[];
  disallow: string[];
  severity: ArchitectureViolationSeverity;
}

export interface ArchitectureViolation {
  ruleName: string;
  severity: ArchitectureViolationSeverity;
  from: string;
  to: string;
  specifier: string;
  kind: ImportKind;
}

export function findArchitectureViolations(
  edges: DependencyEdge[],
  rules: ArchitectureBoundaryRule[],
): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];

  for (const edge of edges) {
    const from = normalizePath(edge.from);
    const to = normalizePath(edge.to);

    for (const rule of rules) {
      if (!matchesAny(from, rule.from) || !matchesAny(to, rule.disallow)) continue;
      violations.push({
        ruleName: rule.name,
        severity: rule.severity,
        from,
        to,
        specifier: edge.specifier,
        kind: edge.kind,
      });
    }
  }

  return violations.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      a.ruleName.localeCompare(b.ruleName) ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
  );
}

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegex(normalizePattern(pattern)).test(file));
}

function normalizePattern(raw: string): string {
  let pattern = normalizePath(raw.trim());
  if (pattern.startsWith('./')) pattern = pattern.slice(2);
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  if (pattern.endsWith('/')) pattern += '**';
  return pattern;
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

function severityRank(severity: ArchitectureViolationSeverity): number {
  return severity === 'error' ? 2 : 1;
}
