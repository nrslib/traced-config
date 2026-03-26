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

const MAX_CONFIG_NESTING_DEPTH = 100;

export function flattenFileEntries(
  value: Record<string, unknown>,
  leafKeys: ReadonlySet<string> = new Set<string>(),
): Array<[string, unknown]> {
  const flattened: Array<[string, unknown]> = [];
  const activeAncestors = new WeakSet<Record<string, unknown>>();
  const stack: Array<{
    value: Record<string, unknown>;
    prefix: string;
    entries: Array<[string, unknown]>;
    index: number;
    depth: number;
  }> = [
    {
      value,
      prefix: '',
      entries: Object.entries(value),
      index: 0,
      depth: 0,
    },
  ];

  activeAncestors.add(value);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    if (!current) {
      break;
    }

    if (current.index >= current.entries.length) {
      activeAncestors.delete(current.value);
      stack.pop();
      continue;
    }

    const nextEntry = current.entries[current.index];
    if (!nextEntry) {
      activeAncestors.delete(current.value);
      stack.pop();
      continue;
    }

    const [key, nestedValue] = nextEntry;
    current.index += 1;
    const dottedKey = current.prefix.length === 0 ? key : `${current.prefix}.${key}`;

    if (!isPlainObject(nestedValue)) {
      flattened.push([dottedKey, nestedValue]);
      continue;
    }

    if (activeAncestors.has(nestedValue)) {
      throw new Error('Circular references in config files are not supported');
    }

    if (leafKeys.has(dottedKey)) {
      flattened.push([dottedKey, nestedValue]);
      continue;
    }

    const nextDepth = current.depth + 1;
    if (nextDepth > MAX_CONFIG_NESTING_DEPTH) {
      throw new Error(`Config file nesting exceeds maximum depth of ${MAX_CONFIG_NESTING_DEPTH}`);
    }

    activeAncestors.add(nestedValue);
    stack.push({
      value: nestedValue,
      prefix: dottedKey,
      entries: Object.entries(nestedValue),
      index: 0,
      depth: nextDepth,
    });
  }

  return flattened;
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
