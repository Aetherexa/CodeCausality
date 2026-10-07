import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ArchitectureBoundaryRule,
  ArchitectureViolationSeverity,
} from './architecture.js';

export interface CodeCausalityConfig {
  ignore: string[];
  moduleDepth: number;
  architecture: {
    boundaries: ArchitectureBoundaryRule[];
  };
}

const DEFAULT_CONFIG: CodeCausalityConfig = {
  ignore: [],
  moduleDepth: 2,
  architecture: {
    boundaries: [],
  },
};

export async function loadCodeCausalityConfig(
  rootDir: string,
  configPath = '.codecausality.json',
): Promise<CodeCausalityConfig> {
  const absolutePath = path.isAbsolute(configPath)
    ? configPath
    : path.join(path.resolve(rootDir), configPath);

  try {
    const raw = await readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      ignore?: unknown;
      moduleDepth?: unknown;
      architecture?: {
        boundaries?: unknown;
      };
    };

    return {
      ignore: Array.isArray(parsed.ignore)
        ? parsed.ignore.filter((value): value is string => typeof value === 'string')
        : [],
      moduleDepth:
        typeof parsed.moduleDepth === 'number' &&
        Number.isInteger(parsed.moduleDepth) &&
        parsed.moduleDepth > 0
          ? parsed.moduleDepth
          : DEFAULT_CONFIG.moduleDepth,
      architecture: {
        boundaries: parseArchitectureBoundaries(parsed.architecture?.boundaries),
      },
    };
  } catch (error) {
    const details = error as NodeJS.ErrnoException;
    if (details.code === 'ENOENT') {
      return {
        ...DEFAULT_CONFIG,
        architecture: { boundaries: [] },
      };
    }
    if (error instanceof SyntaxError) {
      throw new Error('Invalid CodeCausality config at ' + absolutePath + ': ' + error.message);
    }
    throw error;
  }
}

function parseArchitectureBoundaries(value: unknown): ArchitectureBoundaryRule[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): ArchitectureBoundaryRule | undefined => {
      if (!entry || typeof entry !== 'object') return undefined;
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
        return undefined;
      }

      const from = stringArray(candidate.from);
      const disallow = stringArray(candidate.disallow);
      if (from.length === 0 || disallow.length === 0) return undefined;

      return {
        name: candidate.name.trim(),
        from,
        disallow,
        severity: parseSeverity(candidate.severity),
      };
    })
    .filter((rule): rule is ArchitectureBoundaryRule => rule !== undefined);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function parseSeverity(value: unknown): ArchitectureViolationSeverity {
  return value === 'warning' ? 'warning' : 'error';
}
