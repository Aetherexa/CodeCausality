import { describe, expect, it } from 'vitest';
import { findArchitectureViolations } from '../src/index.js';

describe('architecture guardrails', () => {
  it('reports disallowed dependency directions', () => {
    const violations = findArchitectureViolations(
      [
        {
          from: 'src/ui/QuotePage.tsx',
          to: 'src/data/database.ts',
          specifier: '../data/database.js',
          kind: 'static',
        },
        {
          from: 'src/services/quote.ts',
          to: 'src/data/database.ts',
          specifier: '../data/database.js',
          kind: 'static',
        },
      ],
      [
        {
          name: 'ui-must-not-access-data',
          from: ['src/ui/**'],
          disallow: ['src/data/**'],
          severity: 'error',
        },
      ],
    );

    expect(violations).toEqual([
      expect.objectContaining({
        ruleName: 'ui-must-not-access-data',
        from: 'src/ui/QuotePage.tsx',
        to: 'src/data/database.ts',
        severity: 'error',
      }),
    ]);
  });

  it('supports warning-level boundaries and multiple path patterns', () => {
    const violations = findArchitectureViolations(
      [
        {
          from: 'packages/web/src/page.ts',
          to: 'packages/legacy/src/api.ts',
          specifier: '../../../legacy/src/api.js',
          kind: 'static',
        },
      ],
      [
        {
          name: 'legacy-isolation',
          from: ['packages/web/**', 'packages/admin/**'],
          disallow: ['packages/legacy/**'],
          severity: 'warning',
        },
      ],
    );

    expect(violations[0]?.severity).toBe('warning');
  });
});
