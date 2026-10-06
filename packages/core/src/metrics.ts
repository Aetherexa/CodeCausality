import path from 'node:path';
import type { DependencyEdge, SourceFileMetric } from './types.js';
import { isSourceFile, isTestFile, readTextFile } from './fs.js';

export async function calculateFileMetrics(
  rootDir: string,
  files: string[],
  edges: DependencyEdge[],
): Promise<SourceFileMetric[]> {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  for (const edge of edges) {
    fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1);
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }

  const metrics: SourceFileMetric[] = [];
  for (const file of files) {
    if (!isSourceFile(file)) continue;
    const content = await readTextFile(rootDir, file);
    const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
    const codeLines = content
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('//')).length;
    const todoCount = (content.match(/\b(?:TODO|FIXME|HACK)\b/gi) ?? []).length;
    const inCount = fanIn.get(file) ?? 0;
    const outCount = fanOut.get(file) ?? 0;
    const riskScore = round(
      Math.min(100, Math.log2(lines + 1) * 7 + inCount * 5 + outCount * 2 + todoCount * 4),
    );

    metrics.push({
      path: file,
      extension: path.extname(file).toLowerCase(),
      lines,
      codeLines,
      todoCount,
      fanIn: inCount,
      fanOut: outCount,
      riskScore,
      isTest: isTestFile(file),
    });
  }

  return metrics.sort((a, b) => a.path.localeCompare(b.path));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
