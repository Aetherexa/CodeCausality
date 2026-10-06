import path from 'node:path';
import type { AnalysisOptions, RepositorySnapshot } from './types.js';
import { discoverFiles, isSourceFile } from './fs.js';
import { analyzeJsTsRelationships } from './jsTsAnalyzer.js';
import { findCircularDependencies } from './graph.js';
import { calculateFileMetrics } from './metrics.js';

export async function analyzeRepository(options: AnalysisOptions): Promise<RepositorySnapshot> {
  const rootDir = path.resolve(options.rootDir);
  const files = await discoverFiles(rootDir, options.maxFiles, options.ignorePatterns ?? []);
  const { dependencies, externalReferences } = await analyzeJsTsRelationships(rootDir, files);
  const circularDependencies = findCircularDependencies(files, dependencies);
  const fileMetrics = await calculateFileMetrics(rootDir, files, dependencies);
  const hotspots = [...fileMetrics]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    totals: {
      files: files.length,
      sourceFiles: files.filter(isSourceFile).length,
      lines: fileMetrics.reduce((sum, file) => sum + file.lines, 0),
      codeLines: fileMetrics.reduce((sum, file) => sum + file.codeLines, 0),
      todos: fileMetrics.reduce((sum, file) => sum + file.todoCount, 0),
      internalEdges: dependencies.length,
      externalReferences: externalReferences.length,
    },
    files: fileMetrics,
    dependencies,
    externalReferences,
    circularDependencies,
    hotspots,
  };
}
