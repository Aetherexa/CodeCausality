import type { CodeCausalityImpactReport } from './report.js';

export const CONTEXT_BUNDLE_SCHEMA_VERSION = '1.0';

export interface ContextBundleOptions {
  maxChars?: number;
}

export interface ContextBundleBudget {
  maxChars: number;
  usedChars: number;
  truncated: boolean;
}

export interface CodeCausalityContextBundle {
  schemaVersion: string;
  kind: 'change-impact';
  generatedAt: string;
  focus: {
    mode: 'ref' | 'working-tree';
    baseRef?: string;
    riskLevel: string;
    impactScore: number;
    changedSourceFileCount: number;
    affectedFileCount: number;
    affectedTestCount: number;
  };
  evidence: {
    changedFiles: string[];
    architectureViolations: CodeCausalityImpactReport['architectureViolations'];
    recommendedTests: CodeCausalityImpactReport['recommendedTests'];
    affectedModules: CodeCausalityImpactReport['impact']['affectedModules'];
    affectedFiles: string[];
    affectedTests: string[];
    ownership: CodeCausalityImpactReport['ownership'];
    history: CodeCausalityImpactReport['history'];
  };
  budget: ContextBundleBudget;
}

export function createContextBundle(
  report: CodeCausalityImpactReport,
  options: ContextBundleOptions = {},
): CodeCausalityContextBundle {
  const maxChars = normalizeBudget(options.maxChars);
  const bundle: CodeCausalityContextBundle = {
    schemaVersion: CONTEXT_BUNDLE_SCHEMA_VERSION,
    kind: 'change-impact',
    generatedAt: report.generatedAt,
    focus: {
      mode: report.changeSet.mode,
      baseRef: report.changeSet.baseRef,
      riskLevel: report.impact.riskLevel,
      impactScore: report.impact.impactScore,
      changedSourceFileCount: report.impact.foundTargets.length,
      affectedFileCount: report.impact.affectedFiles.length,
      affectedTestCount: report.impact.affectedTests.length,
    },
    evidence: {
      changedFiles: [],
      architectureViolations: [],
      recommendedTests: [],
      affectedModules: [],
      affectedFiles: [],
      affectedTests: [],
      ownership: [],
      history: [],
    },
    budget: {
      maxChars,
      usedChars: maxChars,
      truncated: false,
    },
  };

  const tiers: Array<[keyof CodeCausalityContextBundle['evidence'], unknown[]]> = [
    ['changedFiles', report.impact.foundTargets],
    ['architectureViolations', report.architectureViolations],
    ['recommendedTests', report.recommendedTests],
    ['affectedTests', report.impact.affectedTests],
    ['affectedModules', report.impact.affectedModules],
    ['affectedFiles', report.impact.affectedFiles],
    ['ownership', report.ownership],
    ['history', report.history],
  ];

  let omitted = false;

  for (const [key, values] of tiers) {
    for (const value of values) {
      if (!tryAppend(bundle, key, value, maxChars)) {
        omitted = true;
      }
    }
  }

  bundle.budget.truncated = omitted;
  settleUsedChars(bundle);
  return bundle;
}

function tryAppend(
  bundle: CodeCausalityContextBundle,
  key: keyof CodeCausalityContextBundle['evidence'],
  value: unknown,
  maxChars: number,
): boolean {
  const target = bundle.evidence[key] as unknown[];
  target.push(value);

  if (serializedSize(bundle) <= maxChars) {
    return true;
  }

  target.pop();
  return false;
}

function settleUsedChars(bundle: CodeCausalityContextBundle): void {
  let previous = -1;
  while (bundle.budget.usedChars !== previous) {
    previous = bundle.budget.usedChars;
    bundle.budget.usedChars = serializedSize(bundle);
  }
}

function serializedSize(value: unknown): number {
  return JSON.stringify(value).length;
}

function normalizeBudget(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 12_000;
  return Math.min(100_000, Math.max(1_500, Math.floor(value)));
}
