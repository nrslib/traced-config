import type { FileParser } from './types.js';
import YAML from 'yaml';

export function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    throw new Error(`Unsupported file type for path: ${filePath}`);
  }

  return filePath.slice(lastDot + 1).toLowerCase();
}

export function createDefaultParsers(): Map<string, FileParser> {
  return new Map<string, FileParser>([
    ['yaml', (content: string) => YAML.parse(content)],
    ['yml', (content: string) => YAML.parse(content)],
    ['json', (content: string) => JSON.parse(content) as unknown],
  ]);
}
