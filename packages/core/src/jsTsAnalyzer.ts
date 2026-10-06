import path from 'node:path';
import ts from 'typescript';
import type { DependencyEdge, ExternalReference, ImportKind } from './types.js';
import { readTextFile } from './fs.js';

const JS_TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

interface ImportFact {
  specifier: string;
  kind: ImportKind;
}

export interface SourceRelationshipResult {
  dependencies: DependencyEdge[];
  externalReferences: ExternalReference[];
}

export async function analyzeJsTsRelationships(
  rootDir: string,
  files: string[],
): Promise<SourceRelationshipResult> {
  const fileSet = new Set(files);
  const dependencies: DependencyEdge[] = [];
  const externalReferences: ExternalReference[] = [];

  for (const file of files) {
    if (!JS_TS_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const content = await readTextFile(rootDir, file);
    const facts = extractImports(file, content);

    for (const fact of facts) {
      if (fact.specifier.startsWith('.')) {
        const resolved = resolveRelativeImport(file, fact.specifier, fileSet);
        if (resolved) {
          dependencies.push({
            from: file,
            to: resolved,
            specifier: fact.specifier,
            kind: fact.kind,
          });
        }
      } else if (!isNodeBuiltin(fact.specifier)) {
        externalReferences.push({
          from: file,
          specifier: fact.specifier,
          packageName: packageRoot(fact.specifier),
          kind: fact.kind,
        });
      }
    }
  }

  return {
    dependencies: dedupeDependencies(dependencies),
    externalReferences: dedupeExternalReferences(externalReferences),
  };
}

function extractImports(file: string, content: string): ImportFact[] {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
  const facts: ImportFact[] = [];

  source.forEachChild((node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        facts.push({ specifier: moduleSpecifier.text, kind: 'static' });
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) {
        facts.push({ specifier: first.text, kind: 'dynamic' });
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      facts.push({
        specifier: (node.arguments[0] as ts.StringLiteral).text,
        kind: 'require',
      });
    }
  });

  return dedupeFacts(facts);
}

function scriptKind(file: string): ts.ScriptKind {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  if (['.js', '.mjs', '.cjs'].includes(ext)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function resolveRelativeImport(
  from: string,
  specifier: string,
  fileSet: Set<string>,
): string | undefined {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const emittedExtension = path.posix.extname(base);
  const sourceBase = ['.js', '.mjs', '.cjs'].includes(emittedExtension)
    ? base.slice(0, -emittedExtension.length)
    : base;

  const candidates = [
    base,
    ...RESOLVE_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...RESOLVE_EXTENSIONS.map((ext) => `${sourceBase}${ext}`),
    ...RESOLVE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
    ...RESOLVE_EXTENSIONS.map((ext) => `${sourceBase}/index${ext}`),
  ];

  return candidates.find((candidate) => fileSet.has(candidate));
}

function packageRoot(specifier: string): string {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0] ?? specifier;
}

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith('node:');
}

function dedupeFacts(facts: ImportFact[]): ImportFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.kind}:${fact.specifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeDependencies(edges: DependencyEdge[]): DependencyEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}:${edge.to}:${edge.kind}:${edge.specifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeExternalReferences(references: ExternalReference[]): ExternalReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.from}:${reference.specifier}:${reference.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
