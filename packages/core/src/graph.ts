import path from 'node:path';
import type { DependencyEdge } from './types.js';
import { SOURCE_EXTENSIONS } from './fs.js';

export function findCircularDependencies(files: string[], edges: DependencyEdge[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const file of files) {
    if (SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())) graph.set(file, []);
  }
  for (const edge of edges) graph.get(edge.from)?.push(edge.to);

  const cycles = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (node: string): void => {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) {
        const normalized = normalizeCycle([...stack.slice(start), node]);
        cycles.set(normalized.join(' -> '), normalized);
      }
      return;
    }

    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) visit(node);
  return [...cycles.values()].sort((a, b) => a.join('\0').localeCompare(b.join('\0')));
}

export function buildReverseGraph(edges: DependencyEdge[]): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const edge of edges) {
    const current = reverse.get(edge.to) ?? [];
    current.push(edge.from);
    reverse.set(edge.to, current);
  }
  for (const [key, values] of reverse) reverse.set(key, [...new Set(values)].sort());
  return reverse;
}

function normalizeCycle(cycle: string[]): string[] {
  const nodes = cycle.slice(0, -1);
  if (nodes.length === 0) return cycle;
  let best = nodes;
  for (let i = 1; i < nodes.length; i += 1) {
    const rotated = [...nodes.slice(i), ...nodes.slice(0, i)];
    if (rotated.join('\0') < best.join('\0')) best = rotated;
  }
  return [...best, best[0]];
}
