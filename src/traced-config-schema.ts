import { buildDefaultArgName, buildDefaultEnvName, normalizeArgName } from './naming.js';
import type { ResolvedSchemaEntry, SchemaEntry, SourceToggles } from './types.js';

export const DEFAULT_SOURCES: SourceToggles = {
  global: true,
  local: true,
  env: true,
  cli: false,
};

export function createDefaultSchemaSources(
  defaultSources: Partial<Pick<SourceToggles, 'env' | 'cli'>> | undefined,
): SourceToggles {
  return {
    ...DEFAULT_SOURCES,
    env: defaultSources?.env ?? DEFAULT_SOURCES.env,
    cli: defaultSources?.cli ?? DEFAULT_SOURCES.cli,
  };
}

export function findPrefixCollision(key: string, keys: Iterable<string>): string | null {
  for (const existingKey of keys) {
    if (key.startsWith(`${existingKey}.`) || existingKey.startsWith(`${key}.`)) {
      return existingKey;
    }
  }

  return null;
}

function assertDocString(key: string, entry: SchemaEntry<unknown>): void {
  if (typeof entry.doc !== 'string' || entry.doc.trim().length === 0) {
    throw new Error(`Schema key '${key}' must define a non-empty doc string`);
  }
}

export function resolveSchemaEntry(
  key: string,
  entry: SchemaEntry<unknown>,
  envStyle: 'SCREAMING_SNAKE',
  argStyle: 'kebab',
  defaultSources: SourceToggles,
): ResolvedSchemaEntry {
  assertDocString(key, entry);

  const env = entry.env ?? buildDefaultEnvName(key, envStyle);
  const arg = entry.arg ?? buildDefaultArgName(key, argStyle);

  return {
    default: entry.default,
    doc: entry.doc,
    format: entry.format,
    env,
    arg: normalizeArgName(arg),
    sources: {
      ...defaultSources,
      ...(entry.sources ?? {}),
    },
  };
}
