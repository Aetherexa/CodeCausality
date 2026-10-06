import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface CodeCausalityConfig {
  ignore: string[];
  moduleDepth: number;
}

const DEFAULT_CONFIG: CodeCausalityConfig = {
  ignore: [],
  moduleDepth: 2,
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
    const parsed = JSON.parse(raw) as Partial<CodeCausalityConfig>;
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
    };
  } catch (error) {
    const details = error as NodeJS.ErrnoException;
    if (details.code === 'ENOENT') return { ...DEFAULT_CONFIG };
    if (error instanceof SyntaxError) {
      throw new Error('Invalid CodeCausality config at ' + absolutePath + ': ' + error.message);
    }
    throw error;
  }
}
