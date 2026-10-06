import type { DependencyEdge } from './types.js';

export function toMermaid(edges: DependencyEdge[], maxEdges = 100): string {
  const lines = ['flowchart LR'];
  const ids = new Map<string, string>();
  let counter = 0;

  const idFor = (value: string): string => {
    const existing = ids.get(value);
    if (existing) return existing;
    const id = `N${counter++}`;
    ids.set(value, id);
    lines.push(`  ${id}["${escapeLabel(value)}"]`);
    return id;
  };

  for (const edge of edges.slice(0, maxEdges)) {
    lines.push(`  ${idFor(edge.from)} --> ${idFor(edge.to)}`);
  }
  if (edges.length > maxEdges) {
    lines.push(`  %% ${edges.length - maxEdges} edges omitted`);
  }

  return `${lines.join('\n')}\n`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('"', "'");
}
