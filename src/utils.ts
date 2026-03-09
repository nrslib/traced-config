import type { FileParser } from './types.js';
import YAML from 'yaml';

function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  const lines = content.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid .env entry at line ${lineNumber}`);
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    let value = withoutExport.slice(separatorIndex + 1).trim();

    if (key.length === 0) {
      throw new Error(`Invalid .env entry at line ${lineNumber}`);
    }

    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

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
    ['env', (content: string) => parseDotEnv(content)],
  ]);
}
